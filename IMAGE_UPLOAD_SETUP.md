# OPE-FX — Image Upload Setup Guide

Trade screenshots (Before/After) are stored using **Replit Object Storage** (Google Cloud Storage, managed by Replit). This guide explains how to configure image uploads in any environment.

---

## How It Works

```
Browser → POST /api/storage/uploads/request-url  (metadata only)
        ← { uploadURL, objectPath }

Browser → PUT <uploadURL>                         (file bytes → GCS directly)

Browser → GET /api/storage/objects/<objectPath>   (served via API proxy)
```

1. The frontend asks the API server for a **presigned PUT URL**.
2. The browser uploads the file **directly to Google Cloud Storage** using that URL.
3. The `objectPath` (e.g. `/objects/uploads/<uuid>`) is saved in the database on the trade record.
4. When displaying the trade, the API server streams the image back via `/api/storage/objects/*`.

No image data passes through the Express server — only metadata and signed URLs.

---

## Storage Provider

| Property | Value |
|----------|-------|
| Provider | Google Cloud Storage (via Replit Object Storage) |
| Auth method | Replit sidecar at `http://127.0.0.1:1106` (auto-managed) |
| Bucket naming | `replit-objstore-<workspace-uuid>` |
| Upload path | `<bucket>/.private/uploads/<uuid>` |
| Serve path | `GET /api/storage/objects/uploads/<uuid>` |

---

## Required Environment Variables

These are set **automatically** when you call `setupObjectStorage()`. You never need to set them by hand on Replit.

| Variable | Description | Example |
|----------|-------------|---------|
| `PRIVATE_OBJECT_DIR` | GCS path prefix for uploaded objects | `/replit-objstore-<id>/.private` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | GCS path prefix for public assets | `/replit-objstore-<id>/public` |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | The GCS bucket ID | `replit-objstore-<id>` |

> **These variables are workspace-specific.** Each Replit workspace has its own bucket. They are never committed to git.

---

## Setup Instructions

### New Replit Workspace (after GitHub clone or fork)

1. Open this project in Replit.
2. Open the **Replit Agent** and run:

```javascript
const result = await setupObjectStorage();
console.log(result);
```

Or ask the Agent: *"Set up object storage for image uploads"*.

3. Restart the API Server workflow. The three env vars are now set automatically.
4. Image uploads will work immediately.

That's it — no manual configuration needed.

### Existing Workspace (already working)

No action required. The bucket is provisioned and env vars are set.

### Production Deployment (Replit Deployments)

Replit Deployments automatically carry the same Object Storage secrets into production. After publishing, image uploads work without any extra steps.

---

## Upload Endpoint

```
POST /api/storage/uploads/request-url
Authorization: Clerk session cookie (automatic in browser)
Content-Type: application/json

{
  "name": "screenshot.png",
  "size": 204800,
  "contentType": "image/png"
}

→ 200 OK
{
  "uploadURL": "https://storage.googleapis.com/replit-objstore-<id>/.private/uploads/<uuid>?X-Goog-Signature=...",
  "objectPath": "/objects/uploads/<uuid>",
  "metadata": { "name": "...", "size": ..., "contentType": "..." }
}
```

- The `uploadURL` is a **presigned PUT URL** valid for 15 minutes.
- The `objectPath` is what gets stored in the database (`trades.beforeImage`, `trades.afterImage`).
- To serve the image: `GET /api/storage/objects/uploads/<uuid>` (no auth required — route is intentionally public for image display).

---

## Error Handling

| HTTP Status | Code | Meaning |
|-------------|------|---------|
| `400` | — | Invalid request body |
| `401` | — | Not authenticated (Clerk session missing) |
| `500` | — | Storage error (sidecar returned error) |
| `503` | `STORAGE_NOT_CONFIGURED` | `PRIVATE_OBJECT_DIR` not set — run `setupObjectStorage()` |

When storage returns a `503`, the frontend shows a toast: *"Image upload failed: Image storage is not configured…"*. The rest of the application continues to work normally — only screenshot uploads are affected.

---

## Troubleshooting

### "Image upload failed" toast in the app

**Check 1 — Are the env vars set?**

```bash
printenv | grep -E "PRIVATE_OBJECT|PUBLIC_OBJECT|DEFAULT_OBJECT"
```

If empty → run `setupObjectStorage()` in the Replit Agent, then restart the API Server workflow.

**Check 2 — Is the sidecar running?**

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:1106/health
```

Expected: `404` (sidecar is alive; it doesn't expose a `/health` route, but a non-connection-refused response means it's running). If you get `curl: (7) Failed to connect` — the workspace may not have Object Storage enabled. Contact Replit support.

**Check 3 — Check API server logs**

Look for `STORAGE_NOT_CONFIGURED` or `Error generating upload URL` in the API Server workflow logs.

### Images show as broken after GitHub clone

This is expected. Each workspace has its own bucket. After cloning:
1. Run `setupObjectStorage()` to provision a new bucket.
2. Restart the API Server workflow.
3. New uploads will work. **Previously uploaded images from the old workspace are not migrated** — they lived in the original workspace's bucket.

### Images disappeared after re-opening the project

This should not happen on the same workspace. If it does:
1. Check the env vars (`printenv | grep PRIVATE_OBJECT_DIR`).
2. If the env var is still set but images are 404, the bucket may have been deleted. Run `setupObjectStorage()` again (idempotent — if bucket exists, it returns `alreadySetUp: true`).

### Upload works but image doesn't display

The `objectPath` stored in the database must start with `/objects/`. Check the trade record in the database:

```sql
SELECT id, before_image, after_image FROM trades WHERE before_image IS NOT NULL LIMIT 5;
```

Valid: `/objects/uploads/some-uuid`  
Invalid: `https://storage.googleapis.com/...` (full GCS URL — the normalizer should have converted it)

If you see full GCS URLs, they are from an old upload before the normalizer was in place. They will not resolve through the proxy. Update them manually or re-upload.

---

## Non-Replit Deployment

OPE-FX is designed for Replit. The sidecar-based auth (`http://127.0.0.1:1106`) is Replit-specific. Running outside Replit requires replacing the GCS auth in `artifacts/api-server/src/lib/objectStorage.ts` with standard service account credentials:

1. Create a GCS bucket and a service account with `Storage Object Admin` role.
2. Download the service account JSON key.
3. Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` in your environment.
4. Set `PRIVATE_OBJECT_DIR=/<your-bucket>/.private` and `PUBLIC_OBJECT_SEARCH_PATHS=/<your-bucket>/public`.
5. Replace the `objectStorageClient` initialization in `objectStorage.ts` with `new Storage()` (no explicit credentials — it reads `GOOGLE_APPLICATION_CREDENTIALS` automatically).

---

## File Reference

| File | Purpose |
|------|---------|
| `artifacts/api-server/src/lib/objectStorage.ts` | GCS client, presigned URL generation, object serving |
| `artifacts/api-server/src/lib/objectAcl.ts` | ACL policy framework |
| `artifacts/api-server/src/routes/storage.ts` | Upload + serve Express routes |
| `lib/object-storage-web/src/use-upload.ts` | Frontend upload hook (`useUpload`) |
| `artifacts/ope-fx/src/components/trades/TradeFormDialog.tsx` | `ScreenshotField` component |
| `artifacts/ope-fx/src/pages/TradeDetails.tsx` | Image display (`resolveImageUrl`) |
