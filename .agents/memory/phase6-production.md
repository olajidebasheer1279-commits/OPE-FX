---
name: Phase 6 production patterns
description: Patterns established during the Phase 6 production hardening pass — backup route, QueryClient staleTime, ErrorBoundary, and pre-existing TS quirks fixed.
---

## Backup / Restore Route
- `GET /api/backup` and `POST /api/restore` live in `artifacts/api-server/src/routes/backup.ts`, registered in `routes/index.ts`.
- Frontend calls them via plain `fetch('/api/backup')` — Clerk session cookie is sent automatically (same-domain proxy).
- Restore is append-only; journals use `.onConflictDoNothing()` on the `(userId, date)` unique constraint.

**Why:** Keeps auth simple (no token management needed) and prevents accidental data loss on import.

## QueryClient staleTime
- Set to `30_000` ms in `artifacts/ope-fx/src/lib/queryClient.ts`.
- Prevents refetch storms on tab focus / component remount.

## ErrorBoundary
- `artifacts/ope-fx/src/components/ErrorBoundary.tsx` — class component (required for getDerivedStateFromError).
- Wraps `<WouterRouter>` in `App.tsx` — catches everything including Clerk/Query provider children.
- Shows Try Again (resets state) + Reload Page (full reload) buttons.
- Dev-only: renders error stack in a `<details>` block.

## Pre-existing TS errors fixed
- `account.ts`: Drizzle `.set()` cast — use `as Record<string, unknown>` instead of `Parameters<typeof db.update>[0]["set"]`.
- `assistant.ts`: `r.isChecked` → `r.completed` (rules table has no `isChecked` column).
- `notifications.ts`: Express 5 `req.params.id` is `string | string[]` — cast with `req.params["id"] as string`.
- `Settings.tsx`: `accountType` state must be `"live" | "demo" | "prop"` (matches Zod enum); `onValueChange` needs `(v) => setAccountType(v as ...)`.
