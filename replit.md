# OPE-FX

A professional-grade trading journal and analytics platform for Forex, Metals, and Indices.

## Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS v4, shadcn/ui, TanStack Query v5, Wouter
- **Backend**: Express 5, TypeScript, Pino logging
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Clerk
- **Storage**: Replit Object Storage + Cloudinary (screenshots)
- **Market Data**: Finnhub, Twelve Data, Kraken, Deriv

## Project Structure

```
artifacts/
  ope-fx/          # React frontend (preview path: /)
  api-server/      # Express backend (preview path: /api)
  mockup-sandbox/  # UI component sandbox (preview path: /__mockup)
lib/
  calc-engine/     # Shared trade/risk calculation logic
  db/              # PostgreSQL schema, migrations, Drizzle client
  object-storage-web/  # Frontend helpers for Replit Object Storage
```

## Running the App

All three services start automatically via configured workflows:

| Workflow | Command |
|---|---|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` |
| `artifacts/ope-fx: web` | `pnpm --filter @workspace/ope-fx run dev` |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` |

## Database

Schema is managed with Drizzle ORM. To push schema changes:

```bash
pnpm --filter @workspace/db push
```

## Required Secrets

| Secret | Purpose |
|---|---|
| `CLERK_SECRET_KEY` | Backend Clerk auth |
| `CLERK_PUBLISHABLE_KEY` | Backend Clerk auth |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend Clerk auth |
| `FINNHUB_API_KEY` | Market data |
| `TWELVE_DATA_API_KEY` | Market data |
| `VAPID_PUBLIC_KEY` | Web push notifications |
| `VAPID_PRIVATE_KEY` | Web push notifications |
| `VAPID_SUBJECT` | Web push notifications (mailto: URL) |
| `CLOUDINARY_CLOUD_NAME` | Screenshot storage |
| `CLOUDINARY_API_KEY` | Screenshot storage |
| `CLOUDINARY_API_SECRET` | Screenshot storage |
| `SESSION_SECRET` | Session signing |

`DATABASE_URL` is managed automatically by Replit.

## User Preferences

- Ask for secrets one at a time using the secure Replit secrets flow, never list them all at once.
