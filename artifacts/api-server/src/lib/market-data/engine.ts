/**
 * MarketDataEngine — orchestrates all market data providers.
 *
 * The engine knows nothing about specific providers. It holds an ordered list
 * of IMarketProvider instances and routes each OPE-FX symbol to the first
 * provider whose canHandle() returns true.
 *
 * ── To replace a provider ────────────────────────────────────────────────────
 *   1. Create a new class implementing IMarketProvider (or extending BaseProvider).
 *   2. Swap the entry in the `providers` array below.
 *   3. Done — the alert engine, routes, and frontend are unaffected.
 *
 * ── To add a new asset class ─────────────────────────────────────────────────
 *   1. Add symbol data to symbol-data.ts.
 *   2. Create a new provider class with a canHandle() that covers the new symbols.
 *   3. Append it to the `providers` array below.
 *   4. Done.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { eq } from "drizzle-orm";
import { db, alertsTable } from "@workspace/db";
import { logger } from "../logger.js";
import type { IMarketProvider, PriceHandler, PriceUpdate, ProviderStatus } from "./types.js";
import { toDerivSymbol } from "./symbol-data.js";

// ── Provider implementations ──────────────────────────────────────────────────
// This is the ONLY place in the codebase that imports concrete provider classes.
// Every other module depends only on IMarketProvider.
import { DerivProvider } from "./providers/deriv.js";
import { TwelveDataProvider } from "./providers/twelve-data.js";
import { KrakenProvider } from "./providers/kraken.js";
import { FinnhubProvider } from "./providers/finnhub.js";
import { DerivForexProvider } from "./providers/deriv-forex.js";

class MarketDataEngine {
  /**
   * Ordered provider list. The engine calls canHandle() on each in order and
   * picks the first match. Order matters only when two providers could both
   * return true for the same symbol — in the current set there is no overlap,
   * so order is for documentation clarity only.
   */
  private readonly providers: IMarketProvider[] = [
    new DerivProvider(),       // Synthetic indices (R_75, BOOM1000, CRASH500 …)
    new TwelveDataProvider(),  // Equity indices    (US30, NAS100, SPX500 …)
    new KrakenProvider(),      // Crypto            (BTCUSD, ETHUSD, SOLUSD …)
    new FinnhubProvider(),     // Forex + Metals    (EURUSD, XAUUSD …) — preferred when API key present
    new DerivForexProvider(),  // Forex + Metals fallback via Deriv public WS (no key required)
  ];

  /** Last price received per OPE-FX symbol (uppercase key). */
  private priceCache = new Map<string, PriceUpdate>();

  /** OPE-FX symbols currently subscribed (uppercase). */
  private subscribedSymbols = new Set<string>();

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    for (const p of this.providers) p.connect();
    await this.refreshSubscriptions();
    this.refreshTimer = setInterval(() => void this.refreshSubscriptions(), 30_000);
  }

  stop(): void {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    for (const p of this.providers) p.disconnect();
  }

  // ── Price fan-out ─────────────────────────────────────────────────────────

  onPrice(handler: PriceHandler): void {
    for (const p of this.providers) {
      p.onPrice((update) => {
        this.priceCache.set(update.symbol.toUpperCase(), update);
        handler(update);
      });
    }
  }

  getLastPrice(symbol: string): PriceUpdate | undefined {
    return this.priceCache.get(symbol.toUpperCase());
  }

  // ── Subscription management ───────────────────────────────────────────────

  /** Immediately subscribe opeFxSymbol if not already subscribed. */
  ensureSubscribed(opeFxSymbol: string): void {
    const canonical = toDerivSymbol(opeFxSymbol).toUpperCase();
    if (!this.subscribedSymbols.has(canonical)) {
      this.subscribeSymbol(canonical);
    }
  }

  private findProvider(opeFxSymbol: string): IMarketProvider | undefined {
    return this.providers.find((p) => p.canHandle(opeFxSymbol));
  }

  private subscribeSymbol(opeFxSymbol: string): void {
    const upper = toDerivSymbol(opeFxSymbol).toUpperCase();
    const provider = this.findProvider(upper);
    if (!provider) {
      logger.warn({ symbol: upper }, "No provider can handle symbol — skipping");
      return;
    }
    // Always pass the OPE-FX symbol; each provider translates internally.
    provider.subscribe(upper);
    this.subscribedSymbols.add(upper);
    logger.debug({ symbol: upper, provider: provider.name }, "Subscribed to symbol");
  }

  private unsubscribeSymbol(opeFxSymbol: string): void {
    const upper = toDerivSymbol(opeFxSymbol).toUpperCase();
    const provider = this.findProvider(upper);
    if (provider) provider.unsubscribe(upper);
    this.subscribedSymbols.delete(upper);
    this.priceCache.delete(upper);
  }

  /**
   * Sync subscriptions with the current set of enabled alerts in the DB.
   * Runs every 30 s and on startup. New alerts are picked up automatically;
   * deleted or disabled alerts are unsubscribed.
   */
  private async refreshSubscriptions(): Promise<void> {
    try {
      const rows = await db
        .select({ symbol: alertsTable.symbol })
        .from(alertsTable)
        .where(eq(alertsTable.isEnabled, true));

      const needed = new Set<string>(
        rows
          .map((r) => toDerivSymbol(r.symbol).toUpperCase())
          .filter((s) => !!this.findProvider(s)),
      );

      for (const sym of needed) {
        if (!this.subscribedSymbols.has(sym)) this.subscribeSymbol(sym);
      }
      for (const sym of this.subscribedSymbols) {
        if (!needed.has(sym)) this.unsubscribeSymbol(sym);
      }
    } catch (err) {
      logger.error({ err }, "Failed to refresh market subscriptions");
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  getStatuses(): ProviderStatus[] {
    return this.providers.map((p) => p.getStatus());
  }

  getSubscribedSymbols(): string[] {
    return [...this.subscribedSymbols];
  }
}

export const marketEngine = new MarketDataEngine();
