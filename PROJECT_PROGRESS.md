# OPE-FX Project Progress

- [x] Foundation
- [x] Authentication (Clerk wired; profile managed via Clerk UserProfile in Settings)
- [x] Database (all 9 tables created + updated: Users, Accounts, Trades, Journals, Reviews, Rules, Notifications, Uploads, Achievements)
- [x] Dashboard
- [x] Trade Log
- [x] Journal
- [x] Rules
- [x] Trade Details Page (Prompt #4)
- [x] Mobile Polish & UI Fixes (Prompt #4)
- [x] Bug Fix Pass (Bug Fix Prompt)
  - Journal: 404 (no entry for date) no longer shows "Failed to load this entry" — empty form shown correctly
  - Image upload: provisioned Replit Object Storage; images now persist across refresh/logout
  - Image display: fixed URL resolution from /api/objects/… to /api/storage/objects/… (correct route)
  - Dashboard stat cards: responsive text with truncate prevents overflow on narrow 2-col mobile grid
  - Milestone Progress: flex-wrap prevents currency label overflow on small screens
- [x] Analytics Fix (Prompt #5A)
  - Fixed breakeven trade classification: pnl === 0 is no longer counted as a loss
  - Added wins, losses, breakeven, winRate, avgRR, totalPnl, startingBalance, currentBalance to analytics summary response
  - Analytics page now shows a 6-card summary row: Win Rate, Avg R:R, Total P&L, Balance, Closed Trades, Hold Time
  - Balance fix: trades create/update/delete now call `recalculateBalance()` (full recompute from startingBalance + sum(PnL)) instead of incremental updates — prevents drift
- [x] Settings Page (Prompt #5B)
  - Added defaultRiskPercent, defaultLotSize, accountType, timezone columns to accounts table
  - GET /account + PATCH /account routes
  - Settings page: Account tab (name, broker, type, currency, timezone, starting/current balance with AlertDialog override confirmation), Trading Defaults tab (risk %, lot size), Profile tab (Clerk UserProfile embed), Export tab (CSV download)
- [x] Trading Assistant Page (Prompt #5C)
  - GET /assistant/summary route: pre-trade checklist (from rules), today's journal plan, recent stats (last 20 closed trades), smart warnings, coach's suggestions
  - Assistant.tsx: trade-readiness banner (green/red), 4 stat cards (Win Rate, Avg R:R, Streak, P&L), pre-trade checklist with interactive checkboxes + per-category grouping + progress bar, daily plan from journal, smart warnings with severity levels, coach's suggestions, psychology reminders
- [x] Notifications System (Prompt #5D)
  - notifications table already existed; added full CRUD API routes: GET /notifications, PATCH /notifications/:id/read, POST /notifications/read-all, DELETE /notifications/:id, POST /notifications/generate
  - Auto-generation: journal reminder, weekly review reminder, win streak ≥ 3, loss streak ≥ 3, risk alert (avg risk > 3%), deduplication with recency check
  - Header bell icon now shows unread badge count, opens a Popover dropdown with mark-read, mark-all-read, and delete actions
- [x] Reviews
- [x] Analytics
- [ ] Testing (E2E / manual test pass)
- [ ] Production Ready

## API Endpoints (all require Clerk JWT auth)

### Account
- GET /api/account — account + profile settings
- PATCH /api/account — update account/profile/trading defaults

### Notifications
- GET /api/notifications — list (newest first, limit 50)
- PATCH /api/notifications/:id/read — mark one as read
- POST /api/notifications/read-all — mark all as read
- DELETE /api/notifications/:id — delete one
- POST /api/notifications/generate — auto-generate smart notifications

### Assistant
- GET /api/assistant/summary — checklist, daily plan, recent stats, warnings, suggestions

### Previously built
- GET/POST /api/trades, GET/PATCH/DELETE /api/trades/:id
- GET /api/dashboard/summary
- GET/POST /api/journals, GET/PUT /api/journals/:date
- GET/POST /api/rules, PATCH/DELETE /api/rules/:id
- GET/POST /api/reviews, GET/PATCH/DELETE /api/reviews/:id
- GET /api/analytics/summary, GET /api/analytics/opr-score
- POST /api/storage/upload-url, GET /api/storage/objects/:path

## Notes

- Phase 5 (Prompt #05) complete: analytics/balance fixes, Settings page, Trading Assistant page, Notifications system.
- Foundation (Prompt #1), Dashboard (Prompt #2), Trade Log/Journal/Rules (Prompt #3) are complete.
- Prompt #4 (Mobile Polish + Trade Details + UI Fixes) is complete.
- TypeScript typecheck passes clean (`tsc --noEmit`).
- DB schema pushed after accounts table column additions (defaultRiskPercent, defaultLotSize, accountType, timezone).
- OpenAPI spec updated and codegen re-run; all new endpoints have generated React Query hooks in @workspace/api-client-react.
- Auth: Clerk (email + Google) is fully wired for sign-in/sign-up, session handling, and route protection.
