/**
 * Twelve Data WebSocket provider — Equity Indices.
 *
 * canHandle: any symbol present in INDEX_TO_TWELVEDATA (US30, NAS100,
 * SPX500, UK100, DE40, JP225, …).
 *
 * To replace this provider: implement IMarketProvider with the same canHandle()
 * contract and swap the entry in engine.ts. Nothing else changes.
 *
 * Feed: Twelve Data WebSocket (wss://ws.twelvedata.com/v1/quotes/price)
 * Auth: TWELVE_DATA_API_KEY (free plan: up to 8 symbols simultaneously)
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import {
  INDEX_TO_TWELVEDATA,
  TWELVEDATA_TO_OPEFX,
  toTwelveDataSymbol,
} from "../symbol-data.js";

const WS_BASE = "wss://ws.twelvedata.com/v1/quotes/price";

export class TwelveDataProvider extends BaseProvider {
  readonly name = "twelve-data";
  private ws: WebSocket | null = null;
  private readonly apiKey: string;

  constructor() {
    super();
    // Support both the documented provider name and the compact name used by
    // existing deployments.
    this.apiKey =
      process.env["TWELVE_DATA_API_KEY"] ??
      process.env["TWELVEDATA_API_KEY"] ??
      "";
  }

  // ── Routing contract ───────────────────────────────────────────────────────

  canHandle(opeFxSymbol: string): boolean {
    return !!INDEX_TO_TWELVEDATA[opeFxSymbol.toUpperCase()];
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  protected override requiresApiKey(): boolean { return true; }
  protected override hasApiKey(): boolean { return this.apiKey.length > 0; }

  connect(): void {
    if (!this.apiKey) {
      this._error = "TWELVE_DATA_API_KEY not set — Indices alerts disabled";
      return;
    }
    if (this._connected || this.ws) return;

    const ws = new WebSocket(`${WS_BASE}?apikey=${this.apiKey}`);
    this.ws = ws;

    ws.on("open", () => {
      this.onConnected();
      const tdSyms = [...this.symbolMap.keys()];
      if (tdSyms.length > 0) this.sendSubscribe(tdSyms);
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (msg["event"] === "price") {
          const tdSym = msg["symbol"] as string;
          const price = parseFloat(String(msg["price"]));
          if (!tdSym || isNaN(price)) return;

          const opeSym =
            this.symbolMap.get(tdSym) ??
            TWELVEDATA_TO_OPEFX[tdSym] ??
            tdSym;

          this.emit({
            symbol: opeSym,
            bid: price,
            ask: price,
            mid: price,
            timestamp: Date.now(),
            provider: this.name,
          });
        }

        if (msg["event"] === "subscribe-status" && msg["status"] === "error") {
          this.onError(
            new Error(String(msg["message"] ?? "Twelve Data subscription error")),
          );
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

  /**
   * Receives the OPE-FX symbol (e.g. "US30") and translates internally
   * to the Twelve Data stream symbol ("DJI"). The engine always passes the
   * OPE-FX symbol — translation is this provider's responsibility.
   */
  subscribe(opeFxSymbol: string): void {
    const upper = opeFxSymbol.toUpperCase();
    const tdSym = toTwelveDataSymbol(upper); // "US30" → "DJI"
    if (this.symbolMap.has(tdSym)) return;
    this.symbolMap.set(tdSym, upper); // key: tdSym, value: opeFxSymbol
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe([tdSym]);
    }
  }

  unsubscribe(opeFxSymbol: string): void {
    const tdSym = toTwelveDataSymbol(opeFxSymbol.toUpperCase());
    this.symbolMap.delete(tdSym);
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({ action: "unsubscribe", params: { symbols: tdSym } }),
      );
    }
  }

  private sendSubscribe(tdSyms: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        action: "subscribe",
        params: { symbols: tdSyms.join(",") },
      }),
    );
  }
}
