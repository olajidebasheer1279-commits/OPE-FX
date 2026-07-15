# OPE-FX — Professional Forex Trading Journal

A professional-grade trading journal and analytics cockpit for disciplined Forex, Metals, Indices, and Synthetic Indices traders.

---

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | Real-time P&L, current balance, win rate, recent trades |
| **Trade Log** | Log every trade with entry/exit/SL/TP, screenshots, notes |
| **Universal Calc Engine** | Correct pip/PnL for Forex, Metals, Indices, Synthetic Indices |
| **Risk % Mode** | Enter a target risk % → app computes the correct lot size |
| **Journal** | Daily mood/discipline journal with ratings and reflection |
| **Reviews** | Weekly/monthly performance reviews with structured analysis |
| **Rules** | Trading playbook with compliance tracking |
| **Analytics** | Deep performance analysis — equity curve, monthly P&L, pair stats |
| **OPR Score** | OPE Performance Rating: weighted 6-factor scoring system |
| **Trading Assistant** | Pre-trade checklist, smart warnings, coaching suggestions |
| **Notifications** | Streak alerts, risk warnings, daily journal reminders |
| **Backup & Restore** | Full data export (CSV / PDF / JSON) and import |
| **Settings** | Account details, broker, currency, timezone, trading defaults |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite 7 |
| UI Components | shadcn/ui + Radix UI + Tailwind CSS v4 |
| Backend | Express 5 + TypeScript |
| Database | PostgreSQL (Replit managed) + Drizzle ORM |
| Auth | Clerk (Replit-managed tenant) |
| Client State | TanStack Query v5 |
| Routing | Wouter |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Calculation Engine | `@workspace/calc-engine` (custom, zero-dependency) |
| Object Storage | Replit Object Storage (trade screenshots) |
| API Client | Orval-generated (OpenAPI → TypeScript + React Query) |
| Package Manager | pnpm workspaces (monorepo) |

---

## Folder Structure

```
.
├── artifacts/
│   ├── api-server/          Express API (port $PORT, proxied at /api)
│   │   └── src/
│   │       ├── routes/      One file per resource (trades, journals, backup…)
│   │       ├── lib/         Business logic (trades.ts, analytics.ts, dashboard.ts…)
│   │       └── middlewares/ requireAuth.ts (Clerk JWT guard)
│   └── ope-fx/              React + Vite frontend (port $PORT, proxied at /ope-fx)
│       └── src/
│           ├── pages/       One file per route (Dashboard, TradeLog, Analytics…)
│           ├── components/  Shared UI components + ErrorBoundary
│           └── lib/         queryClient, utilities
├── lib/
│   ├── calc-engine/         Universal PnL / pip / risk calculation engine
│   ├── api-client-react/    Orval-generated React Query hooks + customFetch
│   ├── api-spec/            openapi.yaml + orval config
│   ├── api-zod/             Zod schemas derived from OpenAPI
│   ├── db/                  Drizzle schema + migrations
│   └── object-storage-web/  Replit Object Storage helpers for the browser
├── PROJECT_PROGRESS.md      Feature completion tracker
└── README.md                This file
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+
- A PostgreSQL database (Replit's managed DB or any PostgreSQL instance)
- A [Clerk](https://clerk.com/) application (or use Replit's managed Clerk integration)

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/olajidebasheer1279-commits/OPE-FX.git
cd OPE-FX

# 2. Install all workspace dependencies
pnpm install

# 3. Set environment variables (see section below)

# 4. Push the database schema
pnpm --filter @workspace/db run push

# 5. Build shared libraries
pnpm run typecheck:libs

# 6. Start the API server
pnpm --filter @workspace/api-server run dev

# 7. In another terminal, start the frontend
pnpm --filter @workspace/ope-fx run dev
```

---

## Environment Variables

Create a `.env` file (or set secrets in Replit) with the following:

### API Server

| Variable | Description |
|----------|-------------|
| `PORT` | Port for the Express server (set by Replit automatically) |
| `DATABASE_URL` | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Clerk secret key (from your Clerk dashboard) |
| `SESSION_SECRET` | Random secret string for session signing |

### Frontend (`artifacts/ope-fx/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | Port for the Vite dev server (set by Replit automatically) |
| `BASE_PATH` | URL base path (e.g. `/ope-fx`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |

> **On Replit**: all environment variables are managed automatically via Replit Secrets and the managed Clerk integration. No `.env` files are needed.

---

## Image Upload (Object Storage)

Trade screenshot uploads use **Replit Object Storage**.

- **On Replit**: works out of the box — no configuration needed.
- **On other platforms**: configure Google Cloud Storage credentials:
  - `GOOGLE_APPLICATION_CREDENTIALS` — path to service account JSON
  - `GCS_BUCKET_NAME` — your GCS bucket name

See `artifacts/api-server/src/lib/objectStorage.ts` for the storage abstraction.

---

## API Endpoints

All endpoints require a valid Clerk session (cookie-based in the browser).

```
GET  /api/health                   Health check (public)

GET  /api/account                  Get account profile + settings
PATCH /api/account                 Update account profile + settings

GET  /api/dashboard/summary        Dashboard stats

GET  /api/trades                   List trades (filters: status, symbol, dateFrom, dateTo)
POST /api/trades                   Create trade
GET  /api/trades/:id               Get single trade
PATCH /api/trades/:id              Update trade
DELETE /api/trades/:id             Delete trade

GET  /api/journals                 List journal entries
POST /api/journals                 Create/update journal entry
GET  /api/journals/:date           Get journal entry by date (YYYY-MM-DD)
PUT  /api/journals/:date           Upsert journal entry

GET  /api/rules                    List rules
POST /api/rules                    Create rule
PATCH /api/rules/:id               Update rule
DELETE /api/rules/:id              Delete rule

GET  /api/reviews                  List reviews
POST /api/reviews                  Create review
GET  /api/reviews/:id              Get single review
PATCH /api/reviews/:id             Update review
DELETE /api/reviews/:id            Delete review

GET  /api/analytics/summary        Full analytics summary (dateFrom/dateTo filters)
GET  /api/analytics/opr            OPE Performance Rating (period filter)

GET  /api/assistant/summary        Pre-trade coaching summary

GET  /api/notifications            List notifications
PATCH /api/notifications/:id/read  Mark notification as read
POST /api/notifications/read-all   Mark all as read
DELETE /api/notifications/:id      Delete notification
POST /api/notifications/generate   Generate smart notifications

GET  /api/backup                   Export all data as JSON
POST /api/restore                  Import a JSON backup (append mode)

POST /api/storage/uploads/request-url  Request presigned upload URL
GET  /api/storage/objects/*        Serve stored object
```

---

## Deployment

### On Replit

Click **Publish** in the Replit workspace. The platform handles:
- HTTPS and domain assignment
- Environment variable injection
- PostgreSQL (production instance)
- Clerk (production keys)
- Object Storage

### Manual Deployment

1. Build the frontend: `pnpm --filter @workspace/ope-fx run build`
2. Build the API server: `pnpm --filter @workspace/api-server run build`
3. Run database migrations: `pnpm --filter @workspace/db run push`
4. Serve the API: `node artifacts/api-server/dist/index.mjs`
5. Serve the frontend static files from `artifacts/ope-fx/dist/public/` via a web server or CDN

---

## Calculation Engine

`lib/calc-engine` is a zero-dependency TypeScript package that computes all trade metrics correctly for every supported market:

```
PnL          = priceDiff × directionSign × contractSize × lotSize
pipValue     = contractSize × pipSize               (USD-quoted pairs)
pipValue     = contractSize × pipSize / entryPrice  (USD-base pairs, e.g. USD/JPY)
riskAmount   = slPips × pipValue × lotSize
potProfit    = tpPips × pipValue × lotSize
riskReward   = tpPips / slPips
```

The engine is shared between frontend (live preview in trade form) and backend (stored computed values).

---

## Security

- Every API endpoint is protected by `requireAuth` middleware (Clerk JWT)
- All database queries are scoped to `userId` — users cannot access each other's data
- Input validation via Zod schemas on every endpoint
- No sensitive data stored in the frontend

---

## License

Private — All rights reserved.
