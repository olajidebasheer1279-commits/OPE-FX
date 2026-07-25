---
name: Imported OPE-FX setup
description: Development startup requirements for a fresh OPE-FX import
---

Fresh OPE-FX imports can have a reachable but empty Replit development database. The API process still starts, but its alert and market-data background services log missing-table errors until the existing Drizzle schema is pushed.

**Why:** Background services query the alert tables during startup, so a successful server bind does not prove the development database is initialized.

**How to apply:** After dependencies and required secrets are available, run the repository's existing development schema push before relying on API background-service logs: `pnpm --filter @workspace/db run push`.

Imported artifact metadata may be present before its managed workflows are registered in the live workspace. Check the workflow registry before creating fallbacks; once registered, use the exact managed artifact workflow names and remove any temporary duplicates.

**Why:** A fallback workflow can start without artifact-injected environment such as `PORT`, while the managed workflow supplies the correct routing and service configuration.

**How to apply:** Prefer `artifacts/ope-fx: web` and `artifacts/api-server: API Server` after registration; only configure temporary workflows when those exact managed names are unavailable.