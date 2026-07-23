/**
 * Shared market symbol data used by individual providers.
 *
 * Each provider imports only the subset it needs. The engine never imports
 * from this file — symbol classification is entirely a provider concern.
 *
 * To add support for a new symbol category:
 *   1. Add the relevant data here (patterns, sets, maps).
 *   2. Reference it in the appropriate provider's canHandle() method.
 *   3. The engine and alert engine do not need to change.
 */

// ── Deriv synthetic patterns ──────────────────────────────────────────────────

export const DERIV_PATTERNS: RegExp[] = [
  /^R_\d+$/,           // R_10, R_25, R_50, R_75, R_100
  /^BOOM\d+/,          // BOOM300N, BOOM500, BOOM1000
  /^CRASH\d+/,         // CRASH300N, CRASH500, CRASH1000
  /^1HZ\d+V$/,         // 1HZ10V … 1HZ250V
  /^JD\d+$/,           // JD10 … JD200
  /^STEP_INDEX$/,
  /^RANGE_BREAK/,
];

// ── Index symbol maps (Twelve Data) ──────────────────────────────────────────

/** OPE-FX index symbol → Twelve Data stream symbol */
export const INDEX_TO_TWELVEDATA: Readonly<Record<string, string>> = {
  US30:        "DJI",
  NAS100:      "NDX",
  SPX500:      "SPX",
  US500:       "SPX",
  US100:       "NDX",
  USTEC:       "NDX",
  UK100:       "UKX",
  DE40:        "DAX",
  GER40:       "DAX",
  GER30:       "DAX",
  JP225:       "NKY",
  AUS200:      "AS51",
  FRA40:       "CAC",
  HK50:        "HSI",
  IT40:        "FTSEMIB",
  ES35:        "IBEX",
  EU50:        "SX5E",
  CH20:        "SMI",
  UK100INDEX:  "UKX",
};

/** Twelve Data stream symbol → OPE-FX canonical symbol (first match wins) */
export const TWELVEDATA_TO_OPEFX: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(INDEX_TO_TWELVEDATA).map(([opeFx, td]) => [td, opeFx]),
  );

// ── Crypto base currencies (Kraken) ──────────────────────────────────────────

export const CRYPTO_BASES: ReadonlySet<string> = new Set([
  "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "MATIC", "DOT",
  "AVAX", "LINK", "LTC", "BCH", "ATOM", "NEAR", "ALGO", "VET", "ICP",
  "FIL", "TRX", "ETC", "XLM", "THETA", "APE", "SAND", "MANA", "AXS",
  "UNI", "AAVE", "COMP", "MKR", "SNX", "CRV", "SUSHI", "YFI", "SHIB",
  "PEPE", "FLOKI", "WIF", "BONK", "SUI", "APT", "ARB", "OP", "INJ",
  "TON", "SEI", "TIA", "PYTH", "JTO", "RNDR",
]);

// ── Metal base currencies (Finnhub) ──────────────────────────────────────────

export const METAL_BASES: ReadonlySet<string> = new Set([
  "XAU", "XAG", "XPT", "XPD",
]);

// ── Provider-specific symbol conversion helpers ───────────────────────────────

/** OPE-FX "EURUSD" → Finnhub "OANDA:EUR_USD" */
export function toFinnhubSymbol(opeFxSymbol: string): string {
  const s = opeFxSymbol.toUpperCase().replace("/", "");
  return `OANDA:${s.slice(0, 3)}_${s.slice(3)}`;
}

/** Finnhub "OANDA:EUR_USD" → OPE-FX "EURUSD" */
export function fromFinnhubSymbol(finnhubSymbol: string): string {
  return finnhubSymbol.replace("OANDA:", "").replace("_", "");
}

/** OPE-FX "BTCUSD" or "BTCUSDT" → Kraken "BTC/USD" */
export function toKrakenSymbol(opeFxSymbol: string): string | null {
  const upper = opeFxSymbol.toUpperCase();
  let base: string;
  if (upper.endsWith("USDT")) base = upper.slice(0, -4);
  else if (upper.endsWith("USD")) base = upper.slice(0, -3);
  else return null;
  return `${base}/USD`;
}

/** Kraken "BTC/USD" → OPE-FX "BTCUSD" */
export function fromKrakenSymbol(krakenSymbol: string): string {
  return krakenSymbol.replace("/", "");
}

/** OPE-FX "US30" → Twelve Data "DJI" (returns opeFxSymbol if not mapped) */
export function toTwelveDataSymbol(opeFxSymbol: string): string {
  return INDEX_TO_TWELVEDATA[opeFxSymbol.toUpperCase()] ?? opeFxSymbol.toUpperCase();
}
