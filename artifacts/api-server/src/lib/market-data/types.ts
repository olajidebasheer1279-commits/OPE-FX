/**
 * Shared types for the Market Data Engine.
 *
 * The engine and alert engine depend only on these interfaces — never on
 * specific provider implementations. To replace a provider, create a new
 * class that implements IMarketProvider and swap it in the engine's provider
 * list. No other file needs to change.
 */

// ── Price tick ────────────────────────────────────────────────────────────────

/** Normalized price tick emitted by every provider. */
export interface PriceUpdate {
  /** OPE-FX canonical symbol, e.g. "EURUSD", "R_75", "US30", "BTCUSD" */
  symbol: string;
  bid: number;
  ask: number;
  /** (bid + ask) / 2 */
  mid: number;
  /** Unix ms timestamp of the tick */
  timestamp: number;
  /** Display name of the provider that produced this tick — free-form string */
  provider: string;
}

export type MarketCategory = "forex" | "metals" | "crypto" | "indices" | "synthetic";
export type PriceHandler = (update: PriceUpdate) => void;

// ── Provider health snapshot ──────────────────────────────────────────────────

export interface ProviderStatus {
  /** Display name — matches IMarketProvider.name */
  name: string;
  connected: boolean;
  requiresApiKey: boolean;
  apiKeyPresent: boolean;
  /** Number of symbols currently subscribed */
  subscribedCount: number;
  lastUpdateAt: number | null;
  error?: string;
}

// ── Provider contract ─────────────────────────────────────────────────────────

/**
 * Every market data provider must implement this interface.
 *
 * The engine interacts exclusively through this interface — it never imports a
 * concrete provider class except in the one place where the provider list is
 * assembled (engine.ts). Replacing a provider means:
 *   1. Create a new class implementing IMarketProvider.
 *   2. Swap one entry in the provider array in engine.ts.
 *   3. Nothing else changes.
 */
export interface IMarketProvider {
  /** Human-readable name shown in /api/market/status */
  readonly name: string;

  /**
   * Return true if this provider can supply live prices for the given symbol.
   * Symbol is always passed in OPE-FX canonical form (uppercase, no slashes).
   * Each provider's canHandle must not overlap with other providers — the
   * engine picks the first provider that returns true.
   */
  canHandle(opeFxSymbol: string): boolean;

  /**
   * Subscribe to real-time prices for opeFxSymbol.
   * The symbol is always in OPE-FX canonical form — the provider is
   * responsible for translating it to whatever format its feed requires.
   * Idempotent: calling subscribe() twice for the same symbol is safe.
   */
  subscribe(opeFxSymbol: string): void;

  /**
   * Unsubscribe from a symbol. No-op if not subscribed.
   * Symbol is always in OPE-FX canonical form.
   */
  unsubscribe(opeFxSymbol: string): void;

  /** Register a price handler. May be called multiple times; each is stored once. */
  onPrice(handler: PriceHandler): void;

  /** Open the WebSocket connection (or start polling). */
  connect(): void;

  /** Close the connection and cancel any pending reconnect timers. */
  disconnect(): void;

  /** Return a point-in-time health snapshot for the status endpoint. */
  getStatus(): ProviderStatus;
}
