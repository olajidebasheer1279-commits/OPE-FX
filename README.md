# OPE-FX

A professional trading journal for Forex and synthetic-indices traders, focused on discipline, consistency, psychology, risk management, and analytics.

## Stack

React + TypeScript + Vite + TailwindCSS + shadcn/ui + TanStack Query + React Hook Form + Zod on the frontend; Node.js + Express + Drizzle ORM + PostgreSQL on the backend; Clerk for authentication; Recharts for data visualization.

## Getting started

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, the Clerk keys, and `SESSION_SECRET` (see the environment secrets tooling — these are managed as Replit secrets, not plain `.env` files, in this workspace).
2. Install dependencies: `pnpm install`
3. Push the database schema: `pnpm --filter @workspace/db run push`
4. Start the services (each has its own Replit workflow):
   - API: `pnpm --filter @workspace/api-server run dev`
   - Web app: `pnpm --filter @workspace/ope-fx run dev`

## Project status

See `PROJECT_PROGRESS.md` for the current feature checklist. Foundation and Dashboard are complete; Trade Log, Journal, Reviews, Rules, Analytics, and Trading Assistant are upcoming.

## More detail

See `replit.md` for architecture decisions, repo map, and gotchas.
