/**
 * BaseProvider — abstract base class for all market data providers.
 *
 * Implements IMarketProvider and handles the parts that are the same for every
 * WebSocket-based provider:
 *   • Price handler registration and dispatch
 *   • Reconnect scheduling with exponential back-off (2 s → 60 s)
 *   • Status reporting
 *
 * Subclasses must implement:
 *   • name — display name shown in status endpoint
 *   • canHandle(symbol) — declares which OPE-FX symbols this provider owns
 *   • connect() / disconnect() — WebSocket lifecycle
 *   • subscribe(opeFxSymbol) / unsubscribe(opeFxSymbol)
 *
 * The engine interacts only through IMarketProvider. BaseProvider is an
 * implementation detail — providers may extend it or implement IMarketProvider
 * directly.
 */
import type { IMarketProvider, PriceHandler, PriceUpdate, ProviderStatus } from "../types.js";
import { logger } from "../../logger.js";

export abstract class BaseProvider implements IMarketProvider {
  abstract readonly name: string;

  /**
   * Declare which OPE-FX symbols this provider can supply.
   * The engine calls this to route subscriptions — never reference specific
   * provider names in routing logic outside this method.
   */
  abstract canHandle(opeFxSymbol: string): boolean;

  protected handlers = new Set<PriceHandler>();
  /**
   * Internal symbol map: providerSymbol → opeFxSymbol.
   * Subclasses manage this map; the size is exposed via getStatus().
   */
  protected symbolMap = new Map<string, string>();
  protected _connected = false;
  protected _lastUpdateAt: number | null = null;
  protected _error: string | undefined;

  // ── Reconnection ──────────────────────────────────────────────────────────

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2_000;
  private readonly maxReconnectDelay = 60_000;

  get connected(): boolean {
    return this._connected;
  }

  // ── Price handler registration ────────────────────────────────────────────

  onPrice(handler: PriceHandler): void {
    this.handlers.add(handler);
  }

  protected emit(update: PriceUpdate): void {
    this._lastUpdateAt = Date.now();
    this._error = undefined;
    for (const h of this.handlers) {
      try {
        h(update);
      } catch (err) {
        logger.error({ err, provider: this.name }, "Price handler threw");
      }
    }
  }

  // ── Connection lifecycle helpers ──────────────────────────────────────────

  protected onConnected(): void {
    this._connected = true;
    this._error = undefined;
    this.reconnectDelay = 2_000; // reset backoff
    logger.info({ provider: this.name }, "Provider connected");
  }

  protected onDisconnected(reason?: string): void {
    this._connected = false;
    if (reason) {
      logger.warn({ provider: this.name, reason }, "Provider disconnected");
    }
    this.scheduleReconnect();
  }

  protected onError(err: unknown): void {
    this._error = err instanceof Error ? err.message : String(err);
    logger.error({ err, provider: this.name }, "Provider error");
  }

  protected scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  protected cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Abstract lifecycle ────────────────────────────────────────────────────

  abstract connect(): void;
  abstract disconnect(): void;
  abstract subscribe(opeFxSymbol: string): void;
  abstract unsubscribe(opeFxSymbol: string): void;

  // ── Status ────────────────────────────────────────────────────────────────

  getStatus(): ProviderStatus {
    return {
      name: this.name,
      connected: this._connected,
      requiresApiKey: this.requiresApiKey(),
      apiKeyPresent: this.hasApiKey(),
      subscribedCount: this.symbolMap.size,
      lastUpdateAt: this._lastUpdateAt,
      error: this._error,
    };
  }

  /** Override to return true when this provider needs an API key to connect. */
  protected requiresApiKey(): boolean { return false; }
  /** Override to return false when the required key is absent from env. */
  protected hasApiKey(): boolean { return true; }
}
