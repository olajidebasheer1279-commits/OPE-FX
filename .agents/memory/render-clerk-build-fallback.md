---
name: Render Clerk build fallback
description: Production frontend startup behavior when Clerk build variables differ
---

The OPE-FX frontend must receive a Clerk publishable key during the Vite build. Render may provide `CLERK_PUBLISHABLE_KEY` without duplicating it as `VITE_CLERK_PUBLISHABLE_KEY`; the Vite config therefore embeds the former as a fallback. If neither exists, the React tree renders a visible configuration message rather than throwing before mount.

**Why:** Vite replaces frontend environment variables at build time. An empty Clerk key caused `App.tsx` to throw before React mounted, producing a blank page even though the JS bundle and API server were healthy.

**How to apply:** For production build failures that show a blank page, inspect the generated bundle for the Clerk key before investigating API calls or service-worker state. Keep the fallback limited to publishable keys; never expose Clerk secret keys.