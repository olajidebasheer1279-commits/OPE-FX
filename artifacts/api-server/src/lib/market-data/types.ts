/** Normalized price tick emitted by every provider. */
export interface PriceUpdate {
  /** OPE-FX canonical symbol, e.g. "EURUSD", "R_75", "US30" */
  symbol: string;
  bid: number;
  ask: number;
  /** (bid + ask) / 2 */
  mid: number;
  /** Unix ms timestamp of the tick */
  timestamp: number;
  /** Which provider produced this tick */
  provider: ProviderName;
}

export type ProviderName = "finnhub" | "kraken" | "deriv" | "twelve-data";
export type MarketCategory = "forex" | "metals" | "crypto" | "indices" | "synthetic";

export type PriceHandler = (update: PriceUpdate) => void;

export interface ProviderStatus {
  name: ProviderName;
  connected: boolean;
  requiresApiKey: boolean;
  apiKeyPresent: boolean;
  subscribedCount: number;
  lastUpdateAt: number | null;
  error?: string;
}
