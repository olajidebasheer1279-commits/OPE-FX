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

/**
 * How long to pause after Finnhub returns a 429 / rate-limit signal.
 * 10 minutes is well within free-plan reset windows and avoids repeated
 * ban escalation. During this window the engine re-routes Forex/Metals
 * symbols to DerivForexProvider automatically.
 */
const RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1_000;

/** Returns true if the error message indicates a rate-limit condition. */
function isRateLimitError(msg: string): boolean {
  return /429|too many requests|rate.?limit/i.test(msg);
}

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

    // ── HTTP-level 429 during WebSocket upgrade ────────────────────────────
    // When the server rejects the upgrade with 429, `ws` emits
    // `unexpected-response` (if a listener is registered) instead of `error`.
    ws.on("unexpected-response", (_req, res) => {
      if (res.statusCode === 429) {
        const retryAfterHeader = parseInt(res.headers["retry-after"] ?? "", 10);
        const backoff = isNaN(retryAfterHeader)
          ? RATE_LIMIT_BACKOFF_MS
          : Math.max(retryAfterHeader * 1_000, RATE_LIMIT_BACKOFF_MS);
        res.resume(); // drain the response body so the socket can close cleanly
        this.onRateLimited(backoff);
      } else {
        this.onError(new Error(`Finnhub unexpected HTTP ${res.statusCode ?? "?"}`));
        res.resume();
      }
    });

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
          // Finnhub sends rate-limit signals as WS-level error frames too
          const errText = String(msg["msg"] ?? msg["message"] ?? "Finnhub error");
          if (isRateLimitError(errText)) {
            this.onRateLimited(RATE_LIMIT_BACKOFF_MS);
          } else {
            this.onError(new Error(errText));
          }
        }
      } catch { /* ignore malformed frames */ }
    });

    ws.on("close", () => {
      this._connected = false;
      this.ws = null;
      this.onDisconnected("stream closed");
    });

    ws.on("error", (err) => {
      // Catch connection-level 429s that surface as error events when there
      // is no `unexpected-response` listener or the WS library routes them here.
      const msg = err instanceof Error ? err.message : String(err);
      if (isRateLimitError(msg) || msg.includes("429")) {
        this.onRateLimited(RATE_LIMIT_BACKOFF_MS);
      } else {
        this.onError(err);
      }
    });
  }

  disconnect(): void {
    this.cancelReconnect();
    // Use terminate() rather than close() so this is safe to call in any
    // readyState — including CONNECTING (e.g. when a 429 arrives before the
    // WebSocket handshake completes). close() throws in that state.
    this.ws?.terminate();
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
