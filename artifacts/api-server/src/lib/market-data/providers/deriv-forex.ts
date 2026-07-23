/**
 * DerivForexProvider — Forex & Metals via the Deriv public WebSocket API.
 *
 * This provider is the fallback for all 6-letter non-crypto pairs (EURUSD,
 * GBPAUD, XAUUSD, …) when no FINNHUB_API_KEY is present.  When Finnhub IS
 * configured it takes priority (its canHandle() returns true first), so this
 * provider is silently skipped.
 *
 * Feed: Deriv public market-data WebSocket
 * (wss://api.derivws.com/trading/v1/options/ws/public)
 * Auth: none — this endpoint is intended for public market data.
 *
 * Symbol translation:
 *   OPE-FX "GBPAUD"  →  Deriv "frxGBPAUD"
 *   Deriv  "frxGBPAUD" →  OPE-FX "GBPAUD"
 *
 * Metals (XAUUSD, XAGUSD) also use the frx prefix on Deriv and work the same way.
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import { CRYPTO_BASES } from "../symbol-data.js";

const WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public";

export class DerivForexProvider extends BaseProvider {
  readonly name = "deriv-forex";
  private ws: WebSocket | null = null;

  // ── Routing contract ───────────────────────────────────────────────────────

  canHandle(opeFxSymbol: string): boolean {
    const s = opeFxSymbol.toUpperCase().replace("/", "");
    // Must be exactly 6 letters — same rule as Finnhub
    if (s.length !== 6 || !/^[A-Z]{6}$/.test(s)) return false;
    // Exclude crypto bases (those go to Kraken)
    return !CRYPTO_BASES.has(s.slice(0, 3));
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  connect(): void {
    if (this._connected || this.ws) return;

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      this.onConnected();
      // Re-subscribe for any symbols that were queued before the connection opened
      for (const provSym of this.symbolMap.keys()) {
        this.sendTicks(provSym);
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (msg["msg_type"] === "tick") {
          const tick = msg["tick"] as Record<string, unknown> | undefined;
          if (!tick) return;

          const provSym = tick["symbol"] as string;   // e.g. "frxGBPAUD"
          const ask  = parseFloat(tick["ask"]   as string);
          const bid  = parseFloat(tick["bid"]   as string);
          const quote = parseFloat(tick["quote"] as string);

          const b = isNaN(bid) ? quote : bid;
          const a = isNaN(ask) ? quote : ask;
          if (isNaN(b) && isNaN(a)) return;

          // Look up canonical OPE-FX symbol from our map, or strip the "frx" prefix
          const opeSym =
            this.symbolMap.get(provSym) ??
            provSym.replace(/^frx/i, "").toUpperCase();

          this.emit({
            symbol: opeSym,
            bid: b,
            ask: a,
            mid: (b + a) / 2,
            timestamp: Date.now(),
            provider: this.name,
          });
        }

        if (msg["msg_type"] === "error") {
          const err = msg["error"] as Record<string, unknown> | undefined;
          // Silently skip unknown symbols rather than killing the connection
          const code = err?.["code"] as string | undefined;
          if (code !== "InvalidSymbol" && code !== "RateLimit") {
            this.onError(new Error((err?.["message"] as string) ?? "Deriv error"));
          }
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
    const upper = opeFxSymbol.toUpperCase().replace("/", "");
    const provSym = `frx${upper}`; // GBPAUD → frxGBPAUD
    if (this.symbolMap.has(provSym)) return;
    this.symbolMap.set(provSym, upper);  // frxGBPAUD → GBPAUD
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendTicks(provSym);
    }
  }

  unsubscribe(opeFxSymbol: string): void {
    const upper = opeFxSymbol.toUpperCase().replace("/", "");
    const provSym = `frx${upper}`;
    this.symbolMap.delete(provSym);
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ forget_all: "ticks", symbol: provSym }));
    }
  }

  private sendTicks(providerSymbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ ticks: providerSymbol, subscribe: 1 }));
  }
}
