---
name: Preview auth verification
description: Limitation of the available app-preview browser when testing existing Clerk sessions
---

The app-preview screenshot/checker runs in an isolated browser context and does not inherit the user's existing Clerk session. Its protected API requests therefore return 401 even when the user reports being signed in in their own browser.

**Why:** Treating those isolated 401 responses as proof that the user's authenticated session is broken leads to incorrect fixes and can result in weakening route protection.

**How to apply:** Use the isolated preview to verify signed-out routing, build/runtime health, and public endpoints. For authenticated verification, rely on an interactive session that can retain the user's Clerk login or ask the user to verify after the auth transport fix; do not claim authenticated success from preview screenshots alone.