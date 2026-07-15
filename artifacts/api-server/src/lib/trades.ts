import type { Trade } from "@workspace/db";
import { computeTradeCalc, type Market } from "@workspace/calc-engine";

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}

function nullableNumber(value: string | number | null): number | null {
  return value === null ? null : toNumber(value);
}

export interface TradeComputationInput {
  symbol: string;
  market: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit?: number | null;
  lotSize: number;
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
 * Derives all trade metrics using the universal calculation engine.
 * Server is the single source of truth — client inputs for pnl/rr/risk
 * are ignored and recomputed here.
 */
export function computeTradeMetrics(
  input: TradeComputationInput,
): TradeComputationResult {
  const result = computeTradeCalc({
    market: input.market as Market,
    symbol: input.symbol,
    direction: input.direction,
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit ?? null,
    exitPrice: input.exitPrice,
    lotSize: input.lotSize,
    accountBalance: input.accountBalance,
  });

  return {
    status: result.status,
    pnl: result.pnl,
    pips: result.pips,
    riskRewardRatio: result.riskRewardRatio,
    outcome: result.outcome,
    riskPercent: result.riskPercent,
    riskAmount: result.riskAmount,
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
