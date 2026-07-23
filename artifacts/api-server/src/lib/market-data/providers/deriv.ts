/**
 * Deriv (Binary.com) WebSocket provider — Synthetic Indices.
 *
 * canHandle: any symbol matching the DERIV_PATTERNS set (R_10, R_75,
 * BOOM1000, CRASH500, 1HZ100V, JD75, STEP_INDEX, RANGE_BREAK_*, …).
 *
 * To replace this provider: implement IMarketProvider with the same canHandle()
 * contract and swap the entry in engine.ts. Nothing else changes.
 *
 * Feed: Deriv public WebSocket API (wss://ws.binaryws.com/websockets/v3)
 * Auth: none — app_id=1 is the public open app ID.
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import { DERIV_PATTERNS } from "../symbol-data.js";

const APP_ID = process.env["DERIV_APP_ID"] ?? "1";
const WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;

export class DerivProvider extends BaseProvider {
  readonly name = "deriv";
  private ws: WebSocket | null = null;

  // ── Routing contract ───────────────────────────────────────────────────────

  canHandle(opeFxSymbol: string): boolean {
    const upper = opeFxSymbol.toUpperCase().trim();
    return DERIV_PATTERNS.some((p) => p.test(upper));
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  connect(): void {
    if (this._connected || this.ws) return;

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      this.onConnected();
      for (const sym of this.symbolMap.keys()) {
        this.sendTicks(sym);
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (msg["msg_type"] === "tick") {
          const tick = msg["tick"] as Record<string, unknown> | undefined;
          if (!tick) return;

          const sym = tick["symbol"] as string;
          const ask = parseFloat(tick["ask"] as string);
          const bid = parseFloat(tick["bid"] as string);
          const quote = parseFloat(tick["quote"] as string);

          // Deriv sometimes omits bid/ask for synthetics — fall back to quote
          const b = isNaN(bid) ? quote : bid;
          const a = isNaN(ask) ? quote : ask;
          if (isNaN(b) && isNaN(a)) return;

          const opeSym = this.symbolMap.get(sym) ?? sym;
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
          this.onError(new Error((err?.["message"] as string) ?? "Deriv error"));
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
    // Deriv uses its own symbol names directly (e.g. "R_75")
    const sym = opeFxSymbol.toUpperCase();
    if (this.symbolMap.has(sym)) return;
    this.symbolMap.set(sym, opeFxSymbol);
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendTicks(sym);
    }
  }

  unsubscribe(opeFxSymbol: string): void {
    const sym = opeFxSymbol.toUpperCase();
    this.symbolMap.delete(sym);
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ forget_all: "ticks", symbol: sym }));
    }
  }

  private sendTicks(providerSymbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ ticks: providerSymbol, subscribe: 1 }));
  }
}
