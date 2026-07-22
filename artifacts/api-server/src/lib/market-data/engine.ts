/**
 * MarketDataEngine — manages all price providers, handles symbol→provider
 * routing, and maintains a last-known price cache.
 *
 * Startup:
 *   1. connect() all providers
 *   2. Load active alert symbols from DB → subscribe each to its provider
 *   3. Refresh subscriptions every 30 s
 */
import { eq } from "drizzle-orm";
import { db, alertsTable } from "@workspace/db";
import { logger } from "../logger.js";
import { classifySymbol } from "./symbol-map.js";
import { KrakenProvider } from "./providers/kraken.js";
import { DerivProvider } from "./providers/deriv.js";
import { FinnhubProvider } from "./providers/finnhub.js";
import { TwelveDataProvider } from "./providers/twelve-data.js";
import type { PriceHandler, PriceUpdate, ProviderStatus } from "./types.js";

class MarketDataEngine {
  private readonly providers = {
    finnhub: new FinnhubProvider(),
    kraken: new KrakenProvider(),
    deriv: new DerivProvider(),
    "twelve-data": new TwelveDataProvider(),
  } as const;

  /** Last price received per OPE-FX symbol */
  private priceCache = new Map<string, PriceUpdate>();

  /** OPE-FX symbols currently subscribed */
  private subscribedSymbols = new Set<string>();

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ── Start / Stop ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Connect all providers
    for (const p of Object.values(this.providers)) {
      p.connect();
    }

    // Initial subscription load
    await this.refreshSubscriptions();

    // Refresh every 30 s to pick up newly created / deleted alerts
    this.refreshTimer = setInterval(() => {
      void this.refreshSubscriptions();
    }, 30_000);
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const p of Object.values(this.providers)) {
      p.disconnect();
    }
  }

  // ── Price handlers ──────────────────────────────────────────────────────────

  onPrice(handler: PriceHandler): void {
    for (const p of Object.values(this.providers)) {
      p.onPrice((update) => {
        this.priceCache.set(update.symbol, update);
        handler(update);
      });
    }
  }

  getLastPrice(symbol: string): PriceUpdate | undefined {
    return this.priceCache.get(symbol.toUpperCase());
  }

  // ── Subscription management ─────────────────────────────────────────────────

  /** Ensure a single OPE-FX symbol is subscribed immediately. */
  ensureSubscribed(opeFxSymbol: string): void {
    if (this.subscribedSymbols.has(opeFxSymbol.toUpperCase())) return;
    this.subscribeSymbol(opeFxSymbol);
  }

  private subscribeSymbol(opeFxSymbol: string): void {
    const upper = opeFxSymbol.toUpperCase();
    const classification = classifySymbol(upper);
    if (!classification) {
      logger.warn({ symbol: upper }, "Cannot classify symbol — skipping");
      return;
    }

    const provider = this.providers[classification.provider];

    // For Twelve Data, pass the provider symbol (e.g. "DJI" not "US30")
    // For others, pass the OPE-FX symbol
    const symbolToPass =
      classification.provider === "twelve-data"
        ? classification.providerSymbol
        : upper;

    provider.subscribe(symbolToPass);
    this.subscribedSymbols.add(upper);

    logger.debug(
      { symbol: upper, provider: classification.provider },
      "Subscribed to symbol",
    );
  }

  private unsubscribeSymbol(opeFxSymbol: string): void {
    const upper = opeFxSymbol.toUpperCase();
    const classification = classifySymbol(upper);
    if (!classification) return;

    const provider = this.providers[classification.provider];
    const symbolToPass =
      classification.provider === "twelve-data"
        ? classification.providerSymbol
        : upper;

    provider.unsubscribe(symbolToPass);
    this.subscribedSymbols.delete(upper);
    this.priceCache.delete(upper);
  }

  /** Load all enabled price-type alerts from DB and sync subscriptions. */
  private async refreshSubscriptions(): Promise<void> {
    try {
      const rows = await db
        .select({ symbol: alertsTable.symbol })
        .from(alertsTable)
        .where(eq(alertsTable.isEnabled, true));

      const needed = new Set<string>(
        rows
          .map((r) => r.symbol.toUpperCase())
          .filter((s) => !!classifySymbol(s)),
      );

      // Subscribe to new symbols
      for (const sym of needed) {
        if (!this.subscribedSymbols.has(sym)) {
          this.subscribeSymbol(sym);
        }
      }

      // Unsubscribe from symbols no longer needed
      for (const sym of this.subscribedSymbols) {
        if (!needed.has(sym)) {
          this.unsubscribeSymbol(sym);
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to refresh market subscriptions");
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  getStatuses(): ProviderStatus[] {
    return Object.values(this.providers).map((p) => p.getStatus());
  }

  getSubscribedSymbols(): string[] {
    return [...this.subscribedSymbols];
  }
}

export const marketEngine = new MarketDataEngine();
