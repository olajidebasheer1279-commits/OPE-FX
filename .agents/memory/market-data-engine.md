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
| Synthetic   | Deriv         | none (public market-data endpoint) | wss://api.derivws.com/trading/v1/options/ws/public |
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

## Current provider limitation
Twelve Data’s WebSocket accepts the configured key, but the mapped equity-index symbols are not available on the current account: `DJI` is invalid, while `NDX` and `SPX` require a higher plan. The provider must not be treated as tick-verified until index coverage is enabled or an approved symbol mapping is supplied.

**Why:** A live socket handshake alone does not prove subscription availability; representative subscription probes showed explicit rejection for the configured index symbols.

**How to apply:** When restoring monitoring, verify at least one symbol per provider and distinguish connection success from subscription/tick success.

## Deriv 1-second Volatility symbols
Deriv names the active 1-second Volatility indices `1HZ10V`, `1HZ15V`, `1HZ25V`, `1HZ30V`, `1HZ50V`, `1HZ75V`, and `1HZ100V`; user-facing labels need Synthetic-only canonicalization before routing.

**Why:** Alerts created from the UI were stored as labels such as `VOLATILITY 15 (1S)`, which Deriv cannot subscribe to even though `1HZ15V` is valid and live.

**How to apply:** Preserve user-facing alert labels where needed, but canonicalize these aliases at alert cache, subscription, provider routing, and tick evaluation boundaries.

## Credential naming compatibility
The Twelve Data provider accepts both `TWELVE_DATA_API_KEY` (documented name) and `TWELVEDATA_API_KEY` (compact deployment name).

**Why:** Existing Replit setups may already store the compact name, while the provider documentation uses the underscored name.

**How to apply:** Check both names before requesting another Twelve Data credential or changing an existing deployment.

## Render background monitoring
Render must run the combined Express API as an always-on web service; the backend starts providers and alert evaluation without requiring any SSE client.

**Why:** SSE is only a browser notification channel. Provider sockets, the 30-second subscription/cache refreshes, and database alert writes all live in the API process.

**How to apply:** Keep the Render start command pointed at the API bundle and configure the provider credentials there; never gate engine startup on frontend mount or client connection count.
