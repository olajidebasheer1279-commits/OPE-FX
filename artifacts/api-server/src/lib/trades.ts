import type { Trade } from "@workspace/db";

export function toNumber(value: string | number | null): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}

function nullableNumber(value: string | number | null): number | null {
  return value === null ? null : toNumber(value);
}

/**
 * Pip size heuristic: JPY forex pairs use 0.01, other forex pairs use 0.0001.
 * For non-forex markets (e.g. synthetic indices) there is no standard pip
 * convention, so we report the raw price movement instead.
 */
function pipSize(market: string, symbol: string): number | null {
  if (market !== "Forex") return null;
  return symbol.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
}

export interface TradeComputationInput {
  symbol: string;
  market: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  lotSize: number;
  riskPercent: number | null;
  riskAmount: number | null;
  accountBalance: number;
}

export interface TradeComputationResult {
  status: "open" | "closed";
  pnl: number | null;
  pips: number | null;
  riskRewardRatio: number | null;
  outcome: "win" | "loss" | "breakeven" | null;
  riskPercent: number | null;
  riskAmount: number | null;
}

/**
 * Derives trade metrics on the server so the client never has to be trusted
 * with P&L/RR/outcome math. Anything the client sends for these fields is
 * ignored in favor of this computation.
 */
export function computeTradeMetrics(
  input: TradeComputationInput,
): TradeComputationResult {
  const {
    symbol,
    market,
    direction,
    entryPrice,
    exitPrice,
    stopLoss,
    lotSize,
    riskPercent,
    riskAmount,
    accountBalance,
  } = input;

  const status: "open" | "closed" = exitPrice === null ? "open" : "closed";
  const directionSign = direction === "long" ? 1 : -1;

  let pnl: number | null = null;
  let pips: number | null = null;
  let outcome: "win" | "loss" | "breakeven" | null = null;

  if (exitPrice !== null) {
    const priceDiff = (exitPrice - entryPrice) * directionSign;
    pnl = priceDiff * lotSize;

    const size = pipSize(market, symbol);
    pips = size ? priceDiff / size : priceDiff;

    outcome = pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
  }

  let riskRewardRatio: number | null = null;
  if (exitPrice !== null && stopLoss !== null) {
    const reward = Math.abs(exitPrice - entryPrice);
    const risk = Math.abs(entryPrice - stopLoss);
    riskRewardRatio = risk > 0 ? reward / risk : null;
  }

  let computedRiskPercent = riskPercent;
  let computedRiskAmount = riskAmount;
  if (computedRiskAmount === null && computedRiskPercent !== null && accountBalance > 0) {
    computedRiskAmount = (accountBalance * computedRiskPercent) / 100;
  } else if (
    computedRiskPercent === null &&
    computedRiskAmount !== null &&
    accountBalance > 0
  ) {
    computedRiskPercent = (computedRiskAmount / accountBalance) * 100;
  }

  return {
    status,
    pnl,
    pips,
    riskRewardRatio,
    outcome,
    riskPercent: computedRiskPercent,
    riskAmount: computedRiskAmount,
  };
}

export function serializeTrade(trade: Trade) {
  return {
    id: trade.id,
    symbol: trade.symbol,
    market: trade.market,
    direction: trade.direction as "long" | "short",
    status: trade.status as "open" | "closed",
    entryPrice: toNumber(trade.entryPrice),
    exitPrice: nullableNumber(trade.exitPrice),
    stopLoss: nullableNumber(trade.stopLoss),
    takeProfit: nullableNumber(trade.takeProfit),
    lotSize: toNumber(trade.lotSize),
    riskPercent: nullableNumber(trade.riskPercent),
    riskAmount: nullableNumber(trade.riskAmount),
    pnl: nullableNumber(trade.pnl),
    pips: nullableNumber(trade.pips),
    riskRewardRatio: nullableNumber(trade.riskRewardRatio),
    outcome: trade.outcome as "win" | "loss" | "breakeven" | null,
    timeframe: trade.timeframe,
    strategy: trade.strategy,
    notes: trade.notes,
    beforeScreenshotUrl: trade.beforeScreenshotUrl,
    afterScreenshotUrl: trade.afterScreenshotUrl,
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt === null ? null : trade.closedAt.toISOString(),
    createdAt: trade.createdAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString(),
  };
}
