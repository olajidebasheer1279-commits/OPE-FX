import type { MarketCategory, ProviderName } from "./types.js";

export interface SymbolClassification {
  category: MarketCategory;
  provider: ProviderName;
  /** Symbol as the provider expects it */
  providerSymbol: string;
  /** OPE-FX canonical symbol */
  opeFxSymbol: string;
}

// ─── Deriv synthetic patterns ────────────────────────────────────────────────

const DERIV_PATTERNS = [
  /^R_\d+$/,           // R_10, R_25, R_50, R_75, R_100
  /^BOOM\d+/,          // BOOM300N, BOOM500, BOOM1000
  /^CRASH\d+/,         // CRASH300N, CRASH500, CRASH1000
  /^1HZ\d+V$/,         // 1HZ10V ... 1HZ250V
  /^JD\d+$/,           // JD10 ... JD200
  /^STEP_INDEX$/,
  /^RANGE_BREAK/,
];

// ─── Indices (Twelve Data symbols) ───────────────────────────────────────────

/** Map from OPE-FX index symbol → Twelve Data symbol */
export const INDEX_TO_TWELVEDATA: Record<string, string> = {
  US30: "DJI",
  NAS100: "NDX",
  SPX500: "SPX",
  UK100: "UKX",
  DE40: "DAX",
  JP225: "NKY",
  AUS200: "AS51",
  FRA40: "CAC",
  HK50: "HSI",
  IT40: "FTSEMIB",
  ES35: "IBEX",
  EU50: "SX5E",
  CH20: "SMI",
  US500: "SPX",
  US100: "NDX",
  USTEC: "NDX",
  GER40: "DAX",
  GER30: "DAX",
  UK100INDEX: "UKX",
};

/** Reverse map: Twelve Data symbol → OPE-FX symbol */
export const TWELVEDATA_TO_OPEFX: Record<string, string> = Object.fromEntries(
  Object.entries(INDEX_TO_TWELVEDATA).map(([k, v]) => [v, k]),
);

// ─── Crypto bases (Binance) ───────────────────────────────────────────────────

const CRYPTO_BASES = new Set([
  "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "MATIC", "DOT",
  "AVAX", "LINK", "LTC", "BCH", "ATOM", "NEAR", "ALGO", "VET", "ICP",
  "FIL", "TRX", "ETC", "XLM", "THETA", "APE", "SAND", "MANA", "AXS",
  "UNI", "AAVE", "COMP", "MKR", "SNX", "CRV", "SUSHI", "YFI", "SHIB",
  "PEPE", "FLOKI", "WIF", "BONK", "SUI", "APT", "ARB", "OP", "INJ",
  "TON", "SEI", "TIA", "PYTH", "JTO", "RNDR",
]);

// ─── Metals base currencies ───────────────────────────────────────────────────

const METAL_BASES = new Set(["XAU", "XAG", "XPT", "XPD"]);

// ─── Main classifier ─────────────────────────────────────────────────────────

export function classifySymbol(rawSymbol: string): SymbolClassification | null {
  const symbol = rawSymbol.toUpperCase().trim();

  // 1. Synthetic – Deriv
  if (DERIV_PATTERNS.some((p) => p.test(symbol))) {
    return {
      category: "synthetic",
      provider: "deriv",
      providerSymbol: symbol,
      opeFxSymbol: symbol,
    };
  }

  // 2. Indices – Twelve Data
  if (INDEX_TO_TWELVEDATA[symbol]) {
    return {
      category: "indices",
      provider: "twelve-data",
      providerSymbol: INDEX_TO_TWELVEDATA[symbol],
      opeFxSymbol: symbol,
    };
  }

  // 3. Crypto – Binance
  // Accepts BTCUSD, BTCUSDT, ETHUSDT, etc.
  const stripQuote = (s: string) => {
    if (s.endsWith("USDT")) return s.slice(0, -4);
    if (s.endsWith("USD")) return s.slice(0, -3);
    return null;
  };
  const base = stripQuote(symbol);
  if (base && CRYPTO_BASES.has(base)) {
    return {
      category: "crypto",
      provider: "kraken",
      // Kraken format: BTC/USD
      providerSymbol: `${base}/USD`,
      opeFxSymbol: symbol,
    };
  }

  // 4. Forex / Metals – Finnhub via OANDA
  // Pattern: 6 uppercase characters or BASE/QUOTE
  const cleaned = symbol.replace("/", "");
  if (cleaned.length === 6 && /^[A-Z]{6}$/.test(cleaned)) {
    const b = cleaned.slice(0, 3);
    const q = cleaned.slice(3);
    return {
      category: METAL_BASES.has(b) ? "metals" : "forex",
      provider: "finnhub",
      providerSymbol: `OANDA:${b}_${q}`,
      opeFxSymbol: cleaned,
    };
  }

  return null; // unrecognised
}

/** Convert a Finnhub OANDA symbol back to OPE-FX canonical form */
export function finnhubToOpeFx(finnhubSymbol: string): string {
  // "OANDA:EUR_USD" → "EURUSD"
  return finnhubSymbol.replace("OANDA:", "").replace("_", "");
}

/** Convert a Kraken symbol back to OPE-FX canonical form */
export function krakenToOpeFx(krakenSymbol: string): string {
  // "BTC/USD" → "BTCUSD"
  return krakenSymbol.replace("/", "");
}
