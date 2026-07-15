---
name: Dashboard/aggregate endpoint empty states
description: How to shape aggregate stats endpoints (dashboards, summaries) so empty data doesn't become a frontend special case.
---

For aggregate endpoints (dashboard summaries, stats rollups) that depend on a chain of optional resources (e.g. user -> account -> trades), design the "nothing exists yet" path to return the same well-formed shape as the populated path, with zeroed/default values, rather than a 404 or a differently-shaped payload.

**Why:** This lets the frontend implement one empty-state UI driven by a single flag (e.g. `totalTrades === 0`) instead of handling "no account", "no trades", and "normal" as three different response shapes.

**How to apply:** When a user's first dependent resource (e.g. their trading account) doesn't exist yet, fall back to sensible defaults (e.g. a default starting balance) for balance/goal fields rather than erroring, and return empty arrays for any list fields (recent trades, equity curve).
