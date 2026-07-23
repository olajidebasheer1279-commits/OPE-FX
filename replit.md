# OPE-FX — Professional Forex Trading Journal

A full-stack trading journal and analytics cockpit for disciplined Forex, Metals, Indices, and Synthetic Indices traders.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS (shadcn/ui) |
| Backend | Express 5 (Node.js ESM) |
| Database | PostgreSQL via Drizzle ORM |
| Auth | Clerk |
| Image Storage | Cloudinary (+ Replit Object Storage fallback) |
| Monorepo | pnpm workspaces |

## Running the app

The imported project is configured with managed Replit workflows:

- **OPE-FX (frontend)** — `pnpm --filter @workspace/ope-fx run dev` → port 19427
- **API Server** — `pnpm --filter @workspace/api-server run dev` → port 8080
- **Canvas preview** — `pnpm --filter @workspace/mockup-sandbox run dev` → port 8081

Install dependencies: `pnpm install`

Push DB schema: `pnpm --filter @workspace/db run push`

The public API health check is available at `/healthz` on the API service and
returns the current service status. The frontend is served at the root preview
path.

## Environment variables / secrets required

| Key | Notes |
|-----|-------|
| `DATABASE_URL` | Runtime-managed by Replit (auto-provisioned) |
| `CLERK_SECRET_KEY` | Secret — from Clerk dashboard |
| `CLERK_PUBLISHABLE_KEY` | From Clerk dashboard |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same value as `CLERK_PUBLISHABLE_KEY` |
| `SESSION_SECRET` | Secret — any random string |
| `CLOUDINARY_CLOUD_NAME` | For image uploads |
| `CLOUDINARY_API_KEY` | For image uploads |
| `CLOUDINARY_API_SECRET` | Secret — for image uploads |

## Project structure

```
artifacts/
  ope-fx/          React frontend (preview path: /)
  api-server/      Express API server (preview path: /api)
  mockup-sandbox/  Design mockup server
lib/
  api-client-react/  Orval-generated React Query hooks
  api-spec/          OpenAPI spec + Orval config
  api-zod/           Shared Zod validation schemas
  calc-engine/       Zero-dep trade metrics engine
  db/                Drizzle ORM schema + client
```

## User preferences

- Keep existing monorepo structure and pnpm workspace conventions
