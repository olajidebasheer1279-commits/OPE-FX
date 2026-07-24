---
name: Render Clerk build fallback
description: Production frontend startup behavior when Clerk build variables differ; Clerk proxy host_invalid blank page diagnosis
---

The OPE-FX frontend must receive a Clerk publishable key during the Vite build. Render may provide `CLERK_PUBLISHABLE_KEY` without duplicating it as `VITE_CLERK_PUBLISHABLE_KEY`; the Vite config therefore embeds the former as a fallback. If neither exists, the React tree renders a visible configuration message rather than throwing before mount.

**Why:** Vite replaces frontend environment variables at build time. An empty Clerk key caused `App.tsx` to throw before React mounted, producing a blank page even though the JS bundle and API server were healthy.

**How to apply:** For production build failures that show a blank page, inspect the generated bundle and live browser requests for the Clerk key and proxy URL before investigating API calls or service-worker state.

---

## Clerk Proxy: do NOT hardcode the proxy URL for dev instances

**Rule:** `clerkProxyUrl` in `App.tsx` must be `configuredClerkProxyUrl || undefined` — never a hardcoded `${window.location.origin}/api/__clerk`.

**Why:** Development Clerk instances (`pk_test_*`) return `{"code":"host_invalid"}` (HTTP 400) from `/v1/environment` when a `Clerk-Proxy-Url` header is sent for a domain not registered with that instance. `ClerkProvider` never reaches "loaded" state, so every `<Show when="signed-in/signed-out">` renders nothing → blank dark page. This was the root cause of the blank-page regression on ope-fx.onrender.com.

**Confirmed via:** `curl https://ope-fx.onrender.com/api/__clerk/v1/environment` → `{"errors":[{"code":"host_invalid",...}]}`.

**How to apply:** Only set `proxyUrl` on `ClerkProvider` when `VITE_CLERK_PROXY_URL` is explicitly configured (e.g. for a custom domain with a live `pk_live_` key). For `pk_test_` instances, no proxy URL is needed — Clerk communicates directly with its own CDN (`*.clerk.accounts.dev`).

The Clerk proxy middleware in `api-server` can remain mounted — it is a no-op when the frontend sends no proxy URL.
