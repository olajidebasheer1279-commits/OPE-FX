/**
 * Universal instrument configuration for the OPE-FX calculation engine.
 *
 * Supports: Forex, Metals, Indices, Synthetic Indices
 *
 * Core formula:
 *   pipValuePerLot = contractSize × pipSize   (for USD-quoted pairs)
 *   pipValuePerLot = contractSize × pipSize / entryPrice  (for USD-base pairs)
 *
 *   PnL          = priceDiff × directionSign × contractSize × lotSize
 *   riskAmount   = slPips × pipValuePerLot × lotSize
 *   potProfit    = tpPips × pipValuePerLot × lotSize
 */

export type Market = "Forex" | "Metals" | "Indices" | "Synthetic Indices" | "Crypto";

export interface InstrumentSpec {
  pipSize: number;
  contractSize: number;
  /** How pipValuePerLot is resolved vs. entryPrice */
  quoteType: "usd-quoted" | "usd-base" | "approximate";
  /** Approximate pip value per lot when quoteType === 'approximate' */
  approxPipValuePerLot?: number;
  /**
   * When true the instrument counts in MT5 points (minimum price increment),
   * not Forex pips.  UI should display "pts" instead of "pips".
   */
  usesPoints?: boolean;
}

// ---------------------------------------------------------------------------
// Metals
// ---------------------------------------------------------------------------
const METAL_SPECS: Record<string, InstrumentSpec> = {
  XAUUSD: { pipSize: 0.01, contractSize: 100, quoteType: "usd-quoted" },   // Gold  $1/pip/lot
  XAGUSD: { pipSize: 0.001, contractSize: 5000, quoteType: "usd-quoted" }, // Silver $5/pip/lot
  XPTUSD: { pipSize: 0.01, contractSize: 100, quoteType: "usd-quoted" },   // Platinum
  XPDUSD: { pipSize: 0.01, contractSize: 100, quoteType: "usd-quoted" },   // Palladium
};

// ---------------------------------------------------------------------------
// Indices (CFD contracts — 1 lot = 1 contract, 1 point = $1 unless noted)
// ---------------------------------------------------------------------------
const INDEX_SPECS: Record<string, InstrumentSpec> = {
  US30:   { pipSize: 1, contractSize: 1, quoteType: "usd-quoted" },
  WS30:   { pipSize: 1, contractSize: 1, quoteType: "usd-quoted" },
  DJ30:   { pipSize: 1, contractSize: 1, quoteType: "usd-quoted" },
  NAS100: { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  US100:  { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  NDX:    { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  SPX500: { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  US500:  { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  SP500:  { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  UK100:  { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  GER40:  { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  GER30:  { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  FRA40:  { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  AUS200: { pipSize: 0.1, contractSize: 1, quoteType: "usd-quoted" },
  JPN225: { pipSize: 1, contractSize: 1, quoteType: "usd-quoted" },
};

// ---------------------------------------------------------------------------
// Synthetic Indices (Deriv/Binary.com — MT5 point logic)
//
// PnL formula (MT5):  priceDiff × contractSize × lots
// pointValue per lot: pipSize × contractSize  (same as usd-quoted)
//
// quoteType is "usd-quoted" so getPipValuePerLot returns pipSize × contractSize,
// which is the exact MT5 point value.  usesPoints:true drives the UI label.
// ---------------------------------------------------------------------------
const S = (pipSize: number, contractSize = 1): InstrumentSpec => ({
  pipSize,
  contractSize,
  quoteType: "usd-quoted",
  usesPoints: true,
});

const SYNTHETIC_SPECS: Record<string, InstrumentSpec> = {
  // Volatility Indices
  "V10":     S(0.001),
  "V10(1S)": S(0.001),
  "V25":     S(0.001),
  "V25(1S)": S(0.001),
  "V50":     S(0.001),
  "V50(1S)": S(0.001),
  "V75":     S(0.001),
  "V75(1S)": S(0.001),
  "V100":    S(0.001),
  "V100(1S)":S(0.001),
  // Crash & Boom
  "CRASH300":  S(0.001),
  "CRASH500":  S(0.001),
  "CRASH1000": S(0.001),
  "BOOM300":   S(0.001),
  "BOOM500":   S(0.001),
  "BOOM1000":  S(0.001),
  // Step Indices
  "STPIDX10": S(0.1),
  // Range Break
  "RB100": S(0.1),
  "RB200": S(0.1),
  // Jump Indices
  "JUMP10":  S(0.001),
  "JUMP25":  S(0.001),
  "JUMP50":  S(0.001),
  "JUMP75":  S(0.001),
  "JUMP100": S(0.001),
};

/**
 * Detects pip size from a Forex symbol (handles JPY, standard pairs).
 * Returns 0.0001 for most pairs, 0.01 for JPY crosses.
 */
function forexPipSize(symbol: string): number {
  return symbol.includes("JPY") ? 0.01 : 0.0001;
}

// ---------------------------------------------------------------------------
// Crypto (1 lot = 1 coin, USD-quoted — pip value = contractSize × pipSize)
// ---------------------------------------------------------------------------
const CRYPTO_SPECS: Record<string, InstrumentSpec> = {
  BTCUSD:  { pipSize: 1,      contractSize: 1, quoteType: "usd-quoted" }, // $1/pip/lot
  ETHUSD:  { pipSize: 0.01,   contractSize: 1, quoteType: "usd-quoted" }, // $0.01/pip/lot
  SOLUSD:  { pipSize: 0.001,  contractSize: 1, quoteType: "usd-quoted" }, // $0.001/pip/lot
  XRPUSD:  { pipSize: 0.0001, contractSize: 1, quoteType: "usd-quoted" }, // $0.0001/pip/lot
  ADAUSD:  { pipSize: 0.0001, contractSize: 1, quoteType: "usd-quoted" }, // $0.0001/pip/lot
  DOGEUSD: { pipSize: 0.0001, contractSize: 1, quoteType: "usd-quoted" }, // $0.0001/pip/lot
  LTCUSD:  { pipSize: 0.01,   contractSize: 1, quoteType: "usd-quoted" }, // $0.01/pip/lot
};

/**
 * Returns the InstrumentSpec for the given market/symbol.
 * Falls back gracefully for unknown symbols.
 */
export function getInstrumentSpec(market: Market, symbol: string): InstrumentSpec {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9().]/g, "");

  if (market === "Metals") {
    const key = Object.keys(METAL_SPECS).find((k) => sym.includes(k));
    if (key) return METAL_SPECS[key];
    // Unknown metal: default to gold-like spec
    return { pipSize: 0.01, contractSize: 100, quoteType: "usd-quoted" };
  }

  if (market === "Indices") {
    const key = Object.keys(INDEX_SPECS).find((k) => sym.includes(k));
    if (key) return INDEX_SPECS[key];
    // Unknown index: 1-point CFD
    return { pipSize: 1, contractSize: 1, quoteType: "usd-quoted" };
  }

  if (market === "Crypto") {
    const key = Object.keys(CRYPTO_SPECS).find((k) => sym.includes(k) || k.includes(sym));
    if (key) return CRYPTO_SPECS[key];
    // Unknown crypto: treat as USD-quoted, 1-unit contract
    return { pipSize: 0.01, contractSize: 1, quoteType: "usd-quoted" };
  }

  if (market === "Synthetic Indices") {
    // Try exact key, then partial match
    const key =
      Object.keys(SYNTHETIC_SPECS).find((k) => sym === k.replace(/[^A-Z0-9()]/g, "")) ??
      Object.keys(SYNTHETIC_SPECS).find((k) => {
        const clean = k.replace(/[^A-Z0-9()]/g, "");
        return sym.includes(clean) || clean.includes(sym);
      });
    if (key) return SYNTHETIC_SPECS[key];
    // Unknown synthetic: MT5 point logic, generic small-point instrument
    return S(0.001);
  }

  // Forex (default market)
  const pipSize = forexPipSize(sym);
  const contractSize = 100_000;

  // USD is base currency (USD/JPY, USD/CHF, USD/CAD, USD/NOK, USD/SEK, USD/DKK, USD/MXN…)
  if (sym.startsWith("USD") && sym.length === 6) {
    return { pipSize, contractSize, quoteType: "usd-base" };
  }

  // Cross JPY pairs (EUR/JPY, GBP/JPY, AUD/JPY, etc.) — approximate
  if (sym.includes("JPY") && !sym.startsWith("USD")) {
    return {
      pipSize,
      contractSize,
      quoteType: "approximate",
      approxPipValuePerLot: 8.0,
    };
  }

  // USD is quote currency (EUR/USD, GBP/USD, AUD/USD, NZD/USD…)
  return { pipSize, contractSize, quoteType: "usd-quoted" };
}

/**
 * Computes the dollar value of 1 pip per 1.0 standard lot for the instrument.
 * @param spec   InstrumentSpec from getInstrumentSpec()
 * @param entryPrice  Used only for usd-base pairs to compute pip value in USD.
 */
export function getPipValuePerLot(spec: InstrumentSpec, entryPrice: number): number {
  switch (spec.quoteType) {
    case "usd-quoted":
      return spec.contractSize * spec.pipSize;
    case "usd-base":
      // e.g. USD/JPY: 100,000 × 0.01 / 150 ≈ $6.67/pip/lot
      return entryPrice > 0 ? (spec.contractSize * spec.pipSize) / entryPrice : 0;
    case "approximate":
      return spec.approxPipValuePerLot ?? spec.contractSize * spec.pipSize;
  }
}
