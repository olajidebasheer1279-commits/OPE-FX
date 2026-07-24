---
name: Render Clerk build fallback
description: Production frontend startup behavior when Clerk build variables differ
---

The OPE-FX frontend must receive a Clerk publishable key during the Vite build. Render may provide `CLERK_PUBLISHABLE_KEY` without duplicating it as `VITE_CLERK_PUBLISHABLE_KEY`; the Vite config therefore embeds the former as a fallback. If neither exists, the React tree renders a visible configuration message rather than throwing before mount.

**Why:** Vite replaces frontend environment variables at build time. An empty Clerk key caused `App.tsx` to throw before React mounted, producing a blank page even though the JS bundle and API server were healthy.

**How to apply:** For production build failures that show a blank page, inspect the generated bundle and live browser requests for the Clerk key and proxy URL before investigating API calls or service-worker state. On the combined Render service, use the same-origin `/api/__clerk` proxy; never expose Clerk secret keys.

The Render frontend previously received an external `VITE_CLERK_PROXY_URL` pointing at `clerk.ope-fx.onrender.com`. That host failed TLS with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`, causing Clerk's `failed_to_load_clerk_js` exception during startup. Production now forces the proxy URL to the current app origin.

**Why:** A stale custom Clerk proxy hostname can prevent Clerk from loading before the application routes render, leaving only the dark page background even when the app's own assets are healthy.