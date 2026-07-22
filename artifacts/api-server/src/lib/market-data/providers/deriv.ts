/**
 * Deriv (Binary.com) WebSocket provider — Synthetic Indices.
 * Completely free, no API key required.
 * Official public API: wss://ws.binaryws.com/websockets/v3?app_id=1
 *
 * Supported: R_10, R_25, R_50, R_75, R_100, BOOM/CRASH indices,
 *            1HZ volatility, Jump indices (JD), Step index, etc.
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import type { ProviderName } from "../types.js";

const APP_ID = process.env["DERIV_APP_ID"] ?? "1";
const WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;

export class DerivProvider extends BaseProvider {
  readonly name: ProviderName = "deriv";
  private ws: WebSocket | null = null;

  connect(): void {
    if (this._connected || this.ws) return;

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      this.onConnected();
      // Re-subscribe to all tracked symbols
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

          // Deriv sometimes omits bid/ask for synthetics — use quote for both
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
            provider: "deriv",
          });
        }

        if (msg["msg_type"] === "error") {
          const err = msg["error"] as Record<string, unknown> | undefined;
          this.onError(new Error((err?.["message"] as string) ?? "Deriv error"));
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
      this.ws.send(
        JSON.stringify({
          forget_all: "ticks",
          symbol: sym,
        }),
      );
    }
  }

  private sendTicks(providerSymbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        ticks: providerSymbol,
        subscribe: 1,
      }),
    );
  }
}
