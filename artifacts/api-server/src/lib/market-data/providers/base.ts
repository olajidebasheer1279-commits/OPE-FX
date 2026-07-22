import type { PriceHandler, PriceUpdate, ProviderName, ProviderStatus } from "../types.js";
import { logger } from "../../logger.js";

export abstract class BaseProvider {
  abstract readonly name: ProviderName;

  protected handlers = new Set<PriceHandler>();
  /** Map: providerSymbol → opeFxSymbol */
  protected symbolMap = new Map<string, string>();
  protected _connected = false;
  protected _lastUpdateAt: number | null = null;
  protected _error: string | undefined;

  // ── Reconnection bookkeeping ──────────────────────────────────────────────
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private readonly maxReconnectDelay = 60_000;

  get connected(): boolean {
    return this._connected;
  }

  /** Register a price handler (idempotent). */
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

  protected onConnected(): void {
    this._connected = true;
    this._error = undefined;
    this.reconnectDelay = 2000; // reset backoff
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

  abstract connect(): void;
  abstract disconnect(): void;
  /** Subscribe to a symbol (OPE-FX canonical form). */
  abstract subscribe(opeFxSymbol: string): void;
  abstract unsubscribe(opeFxSymbol: string): void;

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

  protected requiresApiKey(): boolean { return false; }
  protected hasApiKey(): boolean { return true; }
}
