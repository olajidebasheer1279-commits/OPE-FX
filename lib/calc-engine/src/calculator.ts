/**
 * Universal Calculation Engine — core functions.
 *
 * All monetary values are in the account currency (USD by default).
 * All calculations are pure functions with no side effects.
 */

import { type Market, getInstrumentSpec, getPipValuePerLot } from "./instruments.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalcInput {
  market: Market;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice: number | null;
  lotSize: number;
  accountBalance: number;
  /** Optional: if provided, lotSize is ignored and recomputed from this */
  riskPercent?: number | null;
}

export interface CalcResult {
  /** Price distance from entry to SL, expressed in pips */
  slPips: number | null;
  /** Price distance from entry to TP, expressed in pips */
  tpPips: number | null;
  /** Monetary risk (what you stand to lose) based on SL */
  riskAmount: number | null;
  /** Risk as % of current account balance */
  riskPercent: number | null;
  /** Potential profit based on TP */
  potentialProfit: number | null;
  /** Potential profit as % of current account balance */
  potentialProfitPercent: number | null;
  /** Pre-trade R:R = tpPips / slPips (when both present) */
  riskRewardRatio: number | null;
  /** Realized P&L for a closed trade */
  pnl: number | null;
  /** Realized pips for a closed trade */
  pips: number | null;
  /** Trade status derived from exitPrice */
  status: "open" | "closed";
  /** Trade outcome for closed trades */
  outcome: "win" | "loss" | "breakeven" | null;
  /** Computed lot size when riskPercent mode is active */
  computedLotSize: number | null;
  /** Validation warnings to surface to the user */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EPSILON = 1e-8;

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

/**
 * Computes all trade metrics from raw inputs.
 * This is the single source of truth for every calculation in OPE-FX.
 */
export function computeTradeCalc(input: CalcInput): CalcResult {
  const {
    market,
    symbol,
    direction,
    entryPrice,
    stopLoss,
    takeProfit,
    exitPrice,
    lotSize,
    accountBalance,
    riskPercent: inputRiskPercent,
  } = input;

  const spec = getInstrumentSpec(market, symbol);
  const pipSize = spec.pipSize;
  const pipValue = getPipValuePerLot(spec, entryPrice);
  const contractSize = spec.contractSize;
  const dirSign = direction === "long" ? 1 : -1;

  const warnings: string[] = [];

  // --- Validate entry price ---
  if (entryPrice <= 0) {
    warnings.push("Entry price must be greater than zero.");
  }

  // --- SL validation & distance ---
  let slPips: number | null = null;
  if (stopLoss !== null && entryPrice > 0) {
    const slDistPrice = (entryPrice - stopLoss) * dirSign;
    if (slDistPrice <= EPSILON) {
      warnings.push(
        direction === "long"
          ? "Stop loss must be below the entry price for a long trade."
          : "Stop loss must be above the entry price for a short trade.",
      );
    } else {
      slPips = round(slDistPrice / pipSize, 2);
    }
  }

  // --- TP validation & distance ---
  let tpPips: number | null = null;
  if (takeProfit !== null && entryPrice > 0) {
    const tpDistPrice = (takeProfit - entryPrice) * dirSign;
    if (tpDistPrice <= EPSILON) {
      warnings.push(
        direction === "long"
          ? "Take profit must be above the entry price for a long trade."
          : "Take profit must be below the entry price for a short trade.",
      );
    } else {
      tpPips = round(tpDistPrice / pipSize, 2);
    }
  }

  // --- Risk % mode: compute lot size from riskPercent ---
  let computedLotSize: number | null = null;
  let effectiveLotSize = lotSize;

  if (inputRiskPercent != null && inputRiskPercent > 0 && slPips !== null && pipValue > 0) {
    const targetRiskAmount = (accountBalance * inputRiskPercent) / 100;
    computedLotSize = round(targetRiskAmount / (slPips * pipValue), 2);
    effectiveLotSize = computedLotSize;
  }

  // --- Risk amount & percent ---
  let riskAmount: number | null = null;
  let riskPercent: number | null = null;

  if (slPips !== null && effectiveLotSize > 0 && pipValue > 0) {
    riskAmount = round(slPips * pipValue * effectiveLotSize, 2);
    if (accountBalance > 0) {
      riskPercent = round((riskAmount / accountBalance) * 100, 2);
      if (riskPercent > 5) {
        warnings.push(
          `Risk of ${riskPercent.toFixed(2)}% exceeds the recommended 2% maximum. Consider reducing lot size.`,
        );
      }
    }
  }

  // --- Potential profit & percent ---
  let potentialProfit: number | null = null;
  let potentialProfitPercent: number | null = null;

  if (tpPips !== null && effectiveLotSize > 0 && pipValue > 0) {
    potentialProfit = round(tpPips * pipValue * effectiveLotSize, 2);
    if (accountBalance > 0) {
      potentialProfitPercent = round((potentialProfit / accountBalance) * 100, 2);
    }
  }

  // --- Risk:Reward (pre-trade: from TP/SL) ---
  let riskRewardRatio: number | null = null;
  if (tpPips !== null && slPips !== null && slPips > 0) {
    const rr = tpPips / slPips;
    if (rr <= 99999) riskRewardRatio = round(rr, 2);
    if (rr < 1.0) {
      warnings.push(
        `R:R of ${rr.toFixed(2)} is below 1:1. Consider a better entry or wider take profit.`,
      );
    }
  } else if (tpPips === null && slPips === null && exitPrice !== null && stopLoss !== null) {
    // Fall back to actual R:R from closed trade when no TP provided
    const reward = Math.abs(exitPrice - entryPrice);
    const risk = Math.abs(entryPrice - stopLoss);
    if (risk > EPSILON) {
      const rr = reward / risk;
      if (rr <= 99999) riskRewardRatio = round(rr, 2);
    }
  }

  // --- PnL & outcome (closed trade) ---
  const status: "open" | "closed" = exitPrice === null ? "open" : "closed";
  let pnl: number | null = null;
  let pips: number | null = null;
  let outcome: "win" | "loss" | "breakeven" | null = null;

  if (exitPrice !== null && exitPrice > 0) {
    const priceDiff = (exitPrice - entryPrice) * dirSign;
    pnl = round(priceDiff * contractSize * effectiveLotSize, 2);
    pips = round(priceDiff / pipSize, 2);
    outcome = pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
  }

  return {
    slPips,
    tpPips,
    riskAmount: inputRiskPercent != null ? round((accountBalance * inputRiskPercent) / 100, 2) : riskAmount,
    riskPercent: inputRiskPercent != null ? inputRiskPercent : riskPercent,
    potentialProfit,
    potentialProfitPercent,
    riskRewardRatio,
    pnl,
    pips,
    status,
    outcome,
    computedLotSize,
    warnings,
  };
}

/**
 * Calculates the lot size required to risk a given percentage of account balance.
 * Returns null if inputs are insufficient.
 */
export function calcLotSizeFromRisk(input: {
  market: Market;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  stopLoss: number;
  riskPercent: number;
  accountBalance: number;
}): number | null {
  const spec = getInstrumentSpec(input.market, input.symbol);
  const pipSize = spec.pipSize;
  const pipValue = getPipValuePerLot(spec, input.entryPrice);
  const dirSign = input.direction === "long" ? 1 : -1;

  const slDistPrice = (input.entryPrice - input.stopLoss) * dirSign;
  if (slDistPrice <= EPSILON || pipValue <= 0 || input.riskPercent <= 0 || input.accountBalance <= 0) {
    return null;
  }

  const slPips = slDistPrice / pipSize;
  const riskAmount = (input.accountBalance * input.riskPercent) / 100;
  const lotSize = riskAmount / (slPips * pipValue);

  return round(Math.max(0.01, lotSize), 2);
}

/**
 * Validates trade inputs and returns an array of warning messages.
 * Empty array = no issues found.
 */
export function validateTradeInputs(input: Partial<CalcInput>): string[] {
  const warnings: string[] = [];

  if (input.entryPrice !== undefined && input.entryPrice !== null && input.entryPrice <= 0) {
    warnings.push("Entry price must be greater than zero.");
  }

  if (
    input.stopLoss !== null &&
    input.stopLoss !== undefined &&
    input.entryPrice !== undefined &&
    input.entryPrice !== null &&
    input.direction
  ) {
    const diff = (input.entryPrice - input.stopLoss) * (input.direction === "long" ? 1 : -1);
    if (diff <= 0) {
      warnings.push(
        input.direction === "long"
          ? "Stop loss must be below the entry price for a long trade."
          : "Stop loss must be above the entry price for a short trade.",
      );
    }
    if (Math.abs(diff) < EPSILON) {
      warnings.push("Stop loss cannot equal the entry price.");
    }
  }

  if (
    input.takeProfit !== null &&
    input.takeProfit !== undefined &&
    input.entryPrice !== undefined &&
    input.entryPrice !== null &&
    input.direction
  ) {
    const diff = (input.takeProfit - input.entryPrice) * (input.direction === "long" ? 1 : -1);
    if (diff <= 0) {
      warnings.push(
        input.direction === "long"
          ? "Take profit must be above the entry price for a long trade."
          : "Take profit must be below the entry price for a short trade.",
      );
    }
  }

  return warnings;
}
