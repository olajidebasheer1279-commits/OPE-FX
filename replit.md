# OPE-FX

A professional trading journal for Forex and synthetic-indices traders, focused on discipline, consistency, psychology, risk management, and analytics.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (Replit-provisioned; `postgresql-16` module must be present in `.replit` modules)
- Auth: Replit-managed Clerk tenant (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`) — provisioned via `setupClerkWhitelabelAuth()`; no manual action needed
- All three services (web, API, mockup sandbox) run via their own Replit workflows; no manual start needed

## Bootstrap (first-time setup on a fresh Replit)

1. `pnpm install` — install all workspace dependencies
2. Ensure `postgresql-16` is listed in `.replit` modules (required for local DB commands)
3. Clerk secrets are auto-provisioned by Replit — no manual key entry needed
4. `pnpm --filter @workspace/db run push` — apply the Drizzle schema to the dev database
5. All three workflows (`artifacts/api-server: API Server`, `artifacts/ope-fx: web`, `artifacts/mockup-sandbox: Component Preview Server`) start automatically

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ope-fx` — React/Vite frontend (all pages, app shell, Clerk wiring)
- `artifacts/api-server` — Express API (routes in `src/routes`, dashboard aggregation logic in `src/lib/dashboard.ts`, Clerk middleware in `src/middlewares`)
- `lib/db/src/schema` — Drizzle schema, one file per table (users, accounts, trades, journals, reviews, rules, notifications, uploads, achievements)
- `lib/api-spec/openapi.yaml` — source of truth for the API contract; run codegen after editing
- `PROJECT_PROGRESS.md` — feature checklist tracked across build phases

## Architecture decisions

- Users table is keyed by the Clerk user id (text PK) and JIT-provisioned on first authenticated request (`requireAuth` middleware), rather than a separate serial id joined to an external auth id.
- The dashboard is a single aggregate endpoint (`GET /api/dashboard/summary`) computed on the fly from `accounts`/`trades` rather than a denormalized stats table — simplest correct approach at this data volume.
- A user with no trading account yet gets a well-formed zeroed `DashboardSummary` (not a 404/error), so the frontend's empty state is reachable without special-casing "no account" vs "no trades".
- Only Dashboard is fully functional per the phased spec; Trade Log, Journal, Reviews, Rules, Analytics, and Trading Assistant are placeholder pages inside the real app shell/routes, intentionally deferred to future prompts.

## Product

- Public landing page at `/`, redirects signed-in users to `/dashboard`.
- Clerk-backed auth (email + Google) with custom-branded sign-in/sign-up.
- App shell: header (search, balance, today's P/L, notifications, avatar) + sidebar nav, mobile hamburger/drawer + floating "New Trade" button.
- Dashboard: balance/P&L/win-rate/R:R stat cards, equity curve, outcome breakdown, goal progress, recent trades, quick actions, loading/error/empty states.
- Trade Log, Journal, Reviews, Rules, Analytics, and Trading Assistant are "coming soon" placeholders awaiting future prompts.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before using new hooks/schemas in the frontend or backend.
- After changing DB schema files, run `pnpm --filter @workspace/db run push` to apply to the dev database.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
