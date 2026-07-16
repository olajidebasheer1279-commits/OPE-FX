---
name: Image upload dual-backend
description: Two storage backends for trade screenshots; Cloudinary is portable, Replit Object Storage is per-workspace only.
---

## Architecture
ScreenshotField in TradeFormDialog uses direct fetch (NOT the useUpload hook) so it can handle two response shapes from POST /api/storage/uploads/request-url.

## Backend selection (runtime, env-var driven)
- `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` all set → Cloudinary
- Otherwise → Replit Object Storage sidecar (needs PRIVATE_OBJECT_DIR set via setupObjectStorage())

## Cloudinary flow
1. Server generates SHA-1 signature over sorted params (folder, timestamp) + api_secret — no SDK, uses Node built-in crypto.
2. Client POSTs FormData to Cloudinary upload endpoint; receives `secure_url`.
3. `secure_url` stored in DB. Served directly from Cloudinary CDN.

## GCS/Replit flow
1. Server generates presigned PUT URL via sidecar at http://127.0.0.1:1106.
2. Client PUTs file bytes to presigned URL.
3. `/objects/uploads/<uuid>` path stored in DB. Served via /api/storage/objects/* proxy.

## Display layer
resolveImageUrl in TradeFormDialog and TradeDetails:
- `/objects/...` → prefixed with `/api/storage` (GCS proxy)
- anything else → used as-is (Cloudinary full URL)
No display code changes needed when switching backends.

## Portability
- Cloudinary: same 3 env vars work across any workspace, any platform. Old images always accessible.
- Replit Object Storage: each workspace gets a new bucket. Old workspace images inaccessible after move.
- Both backends can coexist: Cloudinary wins if configured; GCS proxy still serves existing /objects/ paths.

**Why:** useUpload hook only does presigned PUT; Cloudinary needs POST FormData. Direct fetch was the minimal change to support both without modifying the shared hook.

## GitHub push
Remote https://github.com/olajidebasheer1279-commits/OPE-FX requires a PAT embedded in the URL:
`git remote set-url origin https://<PAT>@github.com/olajidebasheer1279-commits/OPE-FX.git`
then `git push origin main --tags`
