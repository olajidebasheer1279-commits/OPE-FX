/**
 * Kraken WebSocket v2 provider — Crypto prices.
 *
 * canHandle: any OPE-FX symbol whose base (everything before "USD"/"USDT")
 * is a known cryptocurrency (BTCUSD, ETHUSD, SOLUSD, …).
 *
 * To replace this provider: implement IMarketProvider with the same canHandle()
 * contract and swap the entry in engine.ts. Nothing else changes.
 *
 * Feed: Kraken public WebSocket v2 (wss://ws.kraken.com/v2)
 * Auth: none — no API key required, no geo-restrictions.
 */
import WebSocket from "ws";
import { BaseProvider } from "./base.js";
import { CRYPTO_BASES, toKrakenSymbol, fromKrakenSymbol } from "../symbol-data.js";
import { logger } from "../../logger.js";

const WS_URL = "wss://ws.kraken.com/v2";

interface KrakenTickerData {
  symbol: string;
  bid: number;
  ask: number;
}

export class KrakenProvider extends BaseProvider {
  readonly name = "kraken";
  private ws: WebSocket | null = null;

  // ── Routing contract ───────────────────────────────────────────────────────

  canHandle(opeFxSymbol: string): boolean {
    const upper = opeFxSymbol.toUpperCase();
    let base: string;
    if (upper.endsWith("USDT")) base = upper.slice(0, -4);
    else if (upper.endsWith("USD")) base = upper.slice(0, -3);
    else return false;
    return CRYPTO_BASES.has(base);
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  connect(): void {
    if (this._connected || this.ws) return;

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      this.onConnected();
      const krakenSyms = [...this.symbolMap.keys()];
      if (krakenSyms.length > 0) this.sendSubscribe(krakenSyms);
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

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
              provider: this.name,
            });
          }
        }

        if (msg["method"] === "subscribe" && msg["success"] === false) {
          logger.warn(
            { msg, provider: this.name },
            "Kraken subscription rejected — symbol may not be listed",
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

  subscribe(opeFxSymbol: string): void {
    const krakenSym = toKrakenSymbol(opeFxSymbol);
    if (!krakenSym) return;
    if (this.symbolMap.has(krakenSym)) return;
    this.symbolMap.set(krakenSym, opeFxSymbol.toUpperCase());
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
