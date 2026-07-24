---
name: Imported OPE-FX setup
description: Development startup requirements for a fresh OPE-FX import
---

Fresh OPE-FX imports can have a reachable but empty Replit development database. The API process still starts, but its alert and market-data background services log missing-table errors until the existing Drizzle schema is pushed.

**Why:** Background services query the alert tables during startup, so a successful server bind does not prove the development database is initialized.

**How to apply:** After dependencies and required secrets are available, run the repository's existing development schema push before relying on API background-service logs: `pnpm --filter @workspace/db run push`.