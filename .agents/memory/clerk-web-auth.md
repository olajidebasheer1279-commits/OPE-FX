---
name: External Clerk web authentication
description: External Clerk sessions require an API secret from the exact publishable-key instance; web requests must rely on same-origin cookies.
---

The API secret must belong to the exact external Clerk instance that issues the frontend publishable key and session cookie. For this project, web authentication is cookie-based; adding a browser bearer-token bridge can make Clerk reject the request even when the cookie is valid.

**Why:** The app returned 401s until the matching external secret was securely replaced and the web bearer transport was removed; the API then accepted the signed-in browser session.

**How to apply:** When protected web routes fail, verify the Clerk instance/secret pairing and keep generated/native web requests on `credentials: "include"` without registering `getToken()` as a bearer transport. Reserve explicit bearer tokens for non-browser clients.