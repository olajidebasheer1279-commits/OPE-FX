---
name: Market Data Engine (Prompt 3)
description: Live market price feed architecture — providers, alert engine, SSE push. Built in Prompt 3.
---

# Market Data Engine

## Architecture
```
Providers → MarketDataEngine → AlertEngine → DB (alert_history + notifications) + SseBroadcaster → Frontend SSE
```

## Provider decisions (why Binance was dropped)
Binance.com returns HTTP 451 (geo-blocked) from Replit's US servers.
Switched to **Kraken** WebSocket v2 for crypto — no key required, no geo-restrictions.

## Provider map
| Market      | Provider      | Auth          | WS URL |
|-------------|---------------|---------------|--------|
| Forex       | Finnhub       | FINNHUB_API_KEY | wss://ws.finnhub.io?token={key} |
| Metals      | Finnhub       | FINNHUB_API_KEY | same |
| Crypto      | Kraken        | none          | wss://ws.kraken.com/v2 |
| Synthetic   | Deriv         | none (app_id=1) | wss://ws.binaryws.com/websockets/v3?app_id=1 |
| Indices     | Twelve Data   | TWELVE_DATA_API_KEY | wss://ws.twelvedata.com/v1/quotes/price?apikey={key} |

## Key files
- `artifacts/api-server/src/lib/market-data/` — engine, symbol-map, sse-broadcaster, providers/
- `artifacts/api-server/src/lib/alert-engine.ts` — evaluates price ticks vs DB alerts
- `artifacts/api-server/src/routes/market.ts` — GET /api/market/stream (SSE), /status, /price/:symbol
- `artifacts/ope-fx/src/hooks/useAlertStream.ts` — frontend SSE hook, toast + sound + browser notif
- Hook used in `AppLayout.tsx` (always active when signed in)

## Alert engine behavior
- Cooldown: 60s per alert (prevents tick flooding)
- `repeat: false` alerts are disabled in DB after first fire
- Cache refreshes every 30s; also invalidated on alert CRUD
- Engine immediately subscribes to new alert symbols via `marketEngine.ensureSubscribed()`

## Symbol classification (symbol-map.ts)
- Deriv: R_*, BOOM*, CRASH*, 1HZ*, JD*, STEP_INDEX, RANGE_BREAK
- Indices: US30→DJI, NAS100→NDX, SPX500→SPX, UK100→UKX, DE40→DAX, JP225→NKY, etc.
- Crypto: base must be in CRYPTO_BASES set; maps to Kraken BTC/USD format
- Forex/Metals: 6-char symbols → Finnhub OANDA:EUR_USD format

## Twelve Data index symbols (provider symbols)
DJI, NDX, SPX, UKX, DAX, NKY, AS51, CAC, HSI, FTSEMIB, IBEX, SX5E, SMI

## SSE events
- `connected` — sent on connection
- `alert_fired` — `{ alertId, symbol, condition, targetValue, price, message, sound, color }`
- `heartbeat` — every 25s to keep proxy alive

**Why:** Heartbeat keeps Replit proxy from timing out long-lived SSE connections.
