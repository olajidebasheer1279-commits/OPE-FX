/**
 * Kraken WebSocket v2 provider — Crypto prices.
 * No API key required. No geo-restrictions.
 * URL: wss://ws.kraken.com/v2
 *
 * Subscribes to the "ticker" channel for real-time bid/ask.
 * Symbols: BTC/USD, ETH/USD, SOL/USD, XRP/USD, etc.
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import type { ProviderName } from "../types.js";
import { logger } from "../../logger.js";

const WS_URL = "wss://ws.kraken.com/v2";

/** OPE-FX symbol → Kraken symbol (e.g. BTCUSD → BTC/USD) */
function toKrakenSymbol(opeFxSymbol: string): string | null {
  const upper = opeFxSymbol.toUpperCase();
  let base: string;
  if (upper.endsWith("USDT")) {
    base = upper.slice(0, -4);
  } else if (upper.endsWith("USD")) {
    base = upper.slice(0, -3);
  } else {
    return null;
  }
  return `${base}/USD`;
}

/** Kraken symbol → OPE-FX canonical symbol (e.g. BTC/USD → BTCUSD) */
function fromKrakenSymbol(krakenSymbol: string): string {
  return krakenSymbol.replace("/", "");
}

interface KrakenTickerData {
  symbol: string;
  bid: number;
  ask: number;
  last?: number;
}

export class KrakenProvider extends BaseProvider {
  readonly name: ProviderName = "kraken";
  private ws: WebSocket | null = null;

  connect(): void {
    if (this._connected || this.ws) return;

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      this.onConnected();
      // Re-subscribe to all tracked symbols on reconnect
      const krakenSyms = [...this.symbolMap.keys()];
      if (krakenSyms.length > 0) {
        this.sendSubscribe(krakenSyms);
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

        // Ticker update or snapshot
        if (
          msg["channel"] === "ticker" &&
          (msg["type"] === "update" || msg["type"] === "snapshot")
        ) {
          const data = msg["data"] as KrakenTickerData[] | undefined;
          if (!Array.isArray(data)) return;

          for (const tick of data) {
            const bid = Number(tick.bid);
            const ask = Number(tick.ask);
            if (isNaN(bid) || isNaN(ask)) continue;

            const opeSym =
              this.symbolMap.get(tick.symbol) ?? fromKrakenSymbol(tick.symbol);

            this.emit({
              symbol: opeSym,
              bid,
              ask,
              mid: (bid + ask) / 2,
              timestamp: Date.now(),
              provider: "kraken",
            });
          }
        }

        // Log subscribe errors (symbol not available on Kraken)
        if (msg["method"] === "subscribe" && msg["success"] === false) {
          logger.warn(
            { msg, provider: "kraken" },
            "Kraken subscription rejected — symbol may not be listed",
          );
        }
      } catch {
        // ignore malformed frames
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
    const krakenSym = toKrakenSymbol(opeFxSymbol);
    if (!krakenSym) return;
    if (this.symbolMap.has(krakenSym)) return;
    this.symbolMap.set(krakenSym, opeFxSymbol);

    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe([krakenSym]);
    }
  }

  unsubscribe(opeFxSymbol: string): void {
    const krakenSym = toKrakenSymbol(opeFxSymbol);
    if (!krakenSym) return;
    this.symbolMap.delete(krakenSym);

    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          method: "unsubscribe",
          params: { channel: "ticker", symbol: [krakenSym] },
        }),
      );
    }
  }

  private sendSubscribe(krakenSyms: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        method: "subscribe",
        params: { channel: "ticker", symbol: krakenSyms },
      }),
    );
  }
}
