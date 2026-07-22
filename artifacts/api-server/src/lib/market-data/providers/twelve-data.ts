/**
 * Twelve Data WebSocket provider — Indices (US30, NAS100, SPX500, etc.).
 * Free tier allows up to 8 symbols per connection.
 * Requires TWELVE_DATA_API_KEY (sign up at twelvedata.com — free).
 *
 * WebSocket endpoint: wss://ws.twelvedata.com/v1/quotes/price?apikey={key}
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import { TWELVEDATA_TO_OPEFX } from "../symbol-map.js";
import type { ProviderName } from "../types.js";

const WS_BASE = "wss://ws.twelvedata.com/v1/quotes/price";

export class TwelveDataProvider extends BaseProvider {
  readonly name: ProviderName = "twelve-data";
  private ws: WebSocket | null = null;
  private readonly apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env["TWELVE_DATA_API_KEY"] ?? "";
  }

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
      const syms = [...this.symbolMap.keys()];
      if (syms.length > 0) this.sendSubscribe(syms);
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (msg["event"] === "price") {
          const provSym = msg["symbol"] as string;
          const price = parseFloat(String(msg["price"]));
          if (!provSym || isNaN(price)) return;

          const opeSym =
            this.symbolMap.get(provSym) ??
            TWELVEDATA_TO_OPEFX[provSym] ??
            provSym;

          this.emit({
            symbol: opeSym,
            bid: price,
            ask: price,
            mid: price,
            timestamp: Date.now(),
            provider: "twelve-data",
          });
        }

        if (msg["event"] === "subscribe-status") {
          // Log subscription acknowledgement (may contain errors per symbol)
          const status = msg["status"] as string;
          if (status === "error") {
            this.onError(new Error(String(msg["message"] ?? "Twelve Data subscription error")));
          }
        }
      } catch {
        // ignore
      }
    });

    ws.on("close", () => {
      this._connected = false;
      this.ws = null;
      this.onDisconnected("stream closed");
    });

    ws.on("error", (err) => {
      this.onError(err);
    });
  }

  disconnect(): void {
    this.cancelReconnect();
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  subscribe(opeFxSymbol: string): void {
    // opeFxSymbol e.g. "US30"; providerSymbol e.g. "DJI"
    // The engine already mapped to providerSymbol via classifySymbol
    // but subscribe() receives the OPE-FX symbol — we need the provider symbol
    // The engine stores the providerSymbol when it calls subscribe
    // So here opeFxSymbol may actually be the providerSymbol already.
    // We store both directions to be safe.
    const provSym = opeFxSymbol; // engine passes providerSymbol here
    if (this.symbolMap.has(provSym)) return;
    this.symbolMap.set(provSym, opeFxSymbol);

    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe([provSym]);
    }
  }

  unsubscribe(opeFxSymbol: string): void {
    const provSym = opeFxSymbol;
    this.symbolMap.delete(provSym);

    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: "unsubscribe",
          params: { symbols: provSym },
        }),
      );
    }
  }

  private sendSubscribe(provSyms: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        action: "subscribe",
        params: { symbols: provSyms.join(",") },
      }),
    );
  }
}
