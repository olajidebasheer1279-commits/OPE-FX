/**
 * Finnhub WebSocket provider — Forex & Metals.
 *
 * canHandle: any 6-letter OPE-FX symbol whose base is not a crypto currency.
 * This covers all major and minor forex pairs (EURUSD, GBPJPY, …) and
 * precious metals (XAUUSD, XAGUSD, …).
 *
 * To replace this provider: implement IMarketProvider, cover the same
 * canHandle() contract, and swap the entry in engine.ts. Nothing else changes.
 *
 * Feed: OANDA via Finnhub WebSocket (wss://ws.finnhub.io?token={key})
 * Auth: FINNHUB_API_KEY environment variable (free plan at finnhub.io)
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import {
  CRYPTO_BASES,
  toFinnhubSymbol,
  fromFinnhubSymbol,
} from "../symbol-data.js";

const WS_BASE = "wss://ws.finnhub.io";

// Approximate half-spread in quote currency units (used to synthesise bid/ask
// from trade price, since Finnhub streams trades, not quotes).
function halfSpread(quoteCode: string): number {
  return quoteCode === "JPY" ? 0.005 : 0.000005;
}

export class FinnhubProvider extends BaseProvider {
  readonly name = "finnhub";
  private ws: WebSocket | null = null;
  private readonly apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env["FINNHUB_API_KEY"] ?? "";
  }

  // ── Routing contract ───────────────────────────────────────────────────────

  canHandle(opeFxSymbol: string): boolean {
    // When no API key is set this provider cannot connect; yield to the
    // DerivForexProvider fallback so that Forex alerts still fire.
    if (!this.apiKey) return false;
    const s = opeFxSymbol.toUpperCase().replace("/", "");
    // Must be exactly 6 letters (e.g. EURUSD, XAUUSD) — no digits, no underscores
    if (s.length !== 6 || !/^[A-Z]{6}$/.test(s)) return false;
    // Exclude crypto bases (BTCUSD, ETHUSD, etc.) — those go to Kraken
    return !CRYPTO_BASES.has(s.slice(0, 3));
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  protected override requiresApiKey(): boolean { return true; }
  protected override hasApiKey(): boolean { return this.apiKey.length > 0; }

  connect(): void {
    if (!this.apiKey) {
      this._error = "FINNHUB_API_KEY not set — Forex/Metals alerts disabled";
      return;
    }
    if (this._connected || this.ws) return;

    const ws = new WebSocket(`${WS_BASE}?token=${this.apiKey}`);
    this.ws = ws;

    ws.on("open", () => {
      this.onConnected();
      for (const provSym of this.symbolMap.keys()) {
        this.sendSubscribe(provSym);
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (msg["type"] === "trade") {
          const trades = msg["data"] as Array<Record<string, unknown>> | undefined;
          if (!Array.isArray(trades)) return;

          // Aggregate: use the last trade price per symbol
          const latest = new Map<string, number>();
          for (const t of trades) {
            const s = t["s"] as string;
            const p = t["p"] as number;
            if (s && typeof p === "number") latest.set(s, p);
          }

          for (const [provSym, price] of latest) {
            const quote = provSym.slice(-3); // e.g. "USD" from "OANDA:EUR_USD"
            const hs = halfSpread(quote);
            const opeSym = this.symbolMap.get(provSym) ?? fromFinnhubSymbol(provSym);
            this.emit({
              symbol: opeSym,
              bid: price - hs,
              ask: price + hs,
              mid: price,
              timestamp: Date.now(),
              provider: this.name,
            });
          }
        }
        if (msg["type"] === "error") {
          this.onError(new Error(String(msg["msg"] ?? "Finnhub error")));
        }
      } catch { /* ignore malformed frames */ }
    });

    ws.on("close", () => {
      this._connected = false;
      this.ws = null;
      this.onDisconnected("stream closed");
    });

    ws.on("error", (err) => { this.onError(err); });
  }

  disconnect(): void {
    this.cancelReconnect();
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  // ── Subscription ──────────────────────────────────────────────────────────

  subscribe(opeFxSymbol: string): void {
    const provSym = toFinnhubSymbol(opeFxSymbol);
    if (this.symbolMap.has(provSym)) return;
    this.symbolMap.set(provSym, opeFxSymbol.toUpperCase().replace("/", ""));
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(provSym);
    }
  }

  unsubscribe(opeFxSymbol: string): void {
    const provSym = toFinnhubSymbol(opeFxSymbol);
    this.symbolMap.delete(provSym);
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", symbol: provSym }));
    }
  }

  private sendSubscribe(providerSymbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "subscribe", symbol: providerSymbol }));
  }
}
