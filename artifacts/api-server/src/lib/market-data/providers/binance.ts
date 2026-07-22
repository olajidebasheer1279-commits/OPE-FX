/**
 * Binance WebSocket provider — Crypto prices.
 * No API key required. Uses the combined stream endpoint with @bookTicker
 * (best bid/ask updated in real-time).
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import { binanceToOpeFx } from "../symbol-map.js";
import type { ProviderName } from "../types.js";

const WS_URL = "wss://stream.binance.com:9443/ws";

export class BinanceProvider extends BaseProvider {
  readonly name: ProviderName = "binance";
  private ws: WebSocket | null = null;
  private msgId = 1;

  connect(): void {
    if (this._connected || this.ws) return;

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      this.onConnected();
      // Re-subscribe to all tracked symbols after reconnect
      const streams = [...this.symbolMap.keys()];
      if (streams.length > 0) {
        this.sendSubscribe(streams);
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

        // bookTicker message
        if (msg["e"] === "bookTicker" || ("b" in msg && "a" in msg && "s" in msg)) {
          const stream = (msg["s"] as string ?? "").toLowerCase() + "";
          const provSym = (msg["s"] as string ?? "").toLowerCase();
          const opeSym = this.symbolMap.get(provSym) ?? binanceToOpeFx(provSym);
          const bid = parseFloat(msg["b"] as string);
          const ask = parseFloat(msg["a"] as string);
          if (isNaN(bid) || isNaN(ask)) return;
          this.emit({
            symbol: opeSym,
            bid,
            ask,
            mid: (bid + ask) / 2,
            timestamp: Date.now(),
            provider: "binance",
          });
          void stream; // used for clarity
        }
      } catch {
        // malformed frame, ignore
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
    // opeFxSymbol: "BTCUSD" → providerSymbol: "btcusdt"
    const upper = opeFxSymbol.toUpperCase();
    let provSym: string;
    if (upper.endsWith("USDT")) {
      provSym = upper.toLowerCase();
    } else if (upper.endsWith("USD")) {
      provSym = upper.slice(0, -3).toLowerCase() + "usdt";
    } else {
      provSym = upper.toLowerCase() + "usdt";
    }

    if (this.symbolMap.has(provSym)) return; // already subscribed
    this.symbolMap.set(provSym, opeFxSymbol);

    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe([provSym]);
    }
  }

  unsubscribe(opeFxSymbol: string): void {
    const upper = opeFxSymbol.toUpperCase();
    let provSym: string;
    if (upper.endsWith("USDT")) {
      provSym = upper.toLowerCase();
    } else if (upper.endsWith("USD")) {
      provSym = upper.slice(0, -3).toLowerCase() + "usdt";
    } else {
      provSym = upper.toLowerCase() + "usdt";
    }

    this.symbolMap.delete(provSym);

    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          method: "UNSUBSCRIBE",
          params: [`${provSym}@bookTicker`],
          id: this.msgId++,
        }),
      );
    }
  }

  private sendSubscribe(provSyms: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        method: "SUBSCRIBE",
        params: provSyms.map((s) => `${s}@bookTicker`),
        id: this.msgId++,
      }),
    );
  }
}
