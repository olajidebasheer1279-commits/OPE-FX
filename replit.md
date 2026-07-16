# OPE-FX

A professional-grade trading journal and analytics platform for tracking trade metrics (PnL, pip values, risk/reward) with a built-in calculation engine.

## Stack

- **Frontend** (`artifacts/ope-fx`): React + Vite, Tailwind CSS, Radix UI, TanStack Query, Wouter, Recharts
- **Backend** (`artifacts/api-server`): Node.js + Express, Drizzle ORM, Zod, Pino
- **Auth**: Clerk (`@clerk/react` on frontend, `@clerk/express` on backend)
- **Database**: PostgreSQL via Drizzle ORM (Replit managed — `DATABASE_URL` is auto-provided)
- **Storage**: Cloudinary (optional, for image uploads)
- **Monorepo**: pnpm workspaces + TypeScript

## How to run

Dependencies are installed at the monorepo root:

```bash
pnpm install
```

The two main services start automatically via managed workflows:

| Service | Workflow | Port |
|---------|----------|------|
| Frontend (ope-fx) | `artifacts/ope-fx: web` | 19427 → preview root `/` |
| API Server | `artifacts/api-server: API Server` | 8080 → `/api` |

## Environment variables

| Key | Where | Notes |
|-----|-------|-------|
| `CLERK_SECRET_KEY` | Secret | Clerk backend key (`sk_test_…`) |
| `CLERK_PUBLISHABLE_KEY` | Shared env | Clerk publishable key (`pk_test_…`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Shared env | Same key as above, exposed to Vite |
| `DATABASE_URL` | Runtime-managed | Auto-provided by Replit PostgreSQL |
| `CLOUDINARY_CLOUD_NAME` | Shared env | Optional — image upload |
| `CLOUDINARY_API_KEY` | Shared env | Optional — image upload |
| `CLOUDINARY_API_SECRET` | Secret | Optional — image upload |

## Database

Schema is managed by Drizzle ORM in `lib/db/src/schema/`. To push schema changes to the database:

```bash
pnpm --filter @workspace/db run push
```

## Shared libraries

| Package | Path | Purpose |
|---------|------|---------|
| `@workspace/calc-engine` | `lib/calc-engine` | Trade PnL / pip calculation engine |
| `@workspace/db` | `lib/db` | Drizzle schema + DB client |
| `@workspace/api-zod` | `lib/api-zod` | Shared Zod validation schemas |
| `@workspace/api-client-react` | `lib/api-client-react` | Generated TanStack Query hooks |
| `@workspace/object-storage-web` | `lib/object-storage-web` | Replit Object Storage client |

## User preferences

- Keep the existing monorepo structure and stack — do not restructure or migrate.
