/**
 * Finnhub WebSocket provider — Forex & Metals.
 * Free tier. Requires FINNHUB_API_KEY (sign up at finnhub.io — free).
 *
 * Symbols are sent as OANDA:EUR_USD, OANDA:XAU_USD, etc.
 * Finnhub streams "trade" events; we construct a synthetic bid/ask
 * by treating the last trade price as mid and applying a 1-pip spread.
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import { finnhubToOpeFx } from "../symbol-map.js";
import type { ProviderName } from "../types.js";

const WS_BASE = "wss://ws.finnhub.io";

// Approximate pip sizes for spread estimation
const PIP_SIZE: Record<string, number> = {
  JPY: 0.01,
  default: 0.00001,
};

function halfSpread(providerSymbol: string): number {
  const quote = providerSymbol.slice(-3);
  return (PIP_SIZE[quote] ?? PIP_SIZE["default"]) * 0.5;
}

export class FinnhubProvider extends BaseProvider {
  readonly name: ProviderName = "finnhub";
  private ws: WebSocket | null = null;
  private readonly apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env["FINNHUB_API_KEY"] ?? "";
  }

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
      // Re-subscribe to all tracked symbols
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

          // Aggregate: use the last trade for each symbol
          const latest = new Map<string, number>();
          for (const t of trades) {
            const s = t["s"] as string;
            const p = t["p"] as number;
            if (s && typeof p === "number") latest.set(s, p);
          }

          for (const [provSym, price] of latest) {
            const hs = halfSpread(provSym);
            const opeSym = this.symbolMap.get(provSym) ?? finnhubToOpeFx(provSym);
            this.emit({
              symbol: opeSym,
              bid: price - hs,
              ask: price + hs,
              mid: price,
              timestamp: Date.now(),
              provider: "finnhub",
            });
          }
        }

        if (msg["type"] === "error") {
          this.onError(new Error(String(msg["msg"] ?? "Finnhub error")));
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
    const upper = opeFxSymbol.toUpperCase().replace("/", "");
    if (upper.length !== 6) return;
    const provSym = `OANDA:${upper.slice(0, 3)}_${upper.slice(3)}`;
    if (this.symbolMap.has(provSym)) return;
    this.symbolMap.set(provSym, opeFxSymbol);

    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(provSym);
    }
  }

  unsubscribe(opeFxSymbol: string): void {
    const upper = opeFxSymbol.toUpperCase().replace("/", "");
    if (upper.length !== 6) return;
    const provSym = `OANDA:${upper.slice(0, 3)}_${upper.slice(3)}`;
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
