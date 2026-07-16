# OPE-FX — Image Upload Setup Guide

Trade screenshots (Before/After) are stored in **persistent cloud storage**, not on the local filesystem. Two backends are supported. The backend is selected automatically based on which environment variables are present.

---

## Storage Backends

| Backend | When active | Portable across workspaces? | Files persist after workspace move? |
|---------|-------------|----------------------------|--------------------------------------|
| **Cloudinary** | `CLOUDINARY_CLOUD_NAME` is set | ✅ Yes — any environment | ✅ Yes — stored on Cloudinary CDN |
| **Replit Object Storage** | `PRIVATE_OBJECT_DIR` is set (Replit only) | ⚠️ Per-workspace | ❌ Images in old workspace bucket not accessible from new workspace |

**Recommendation:** Use Cloudinary for any setup that involves GitHub clones, multiple workspaces, or production deployments. Replit Object Storage is sufficient for a single permanent workspace.

---

## Backend 1 — Cloudinary (Recommended, Fully Portable)

### How it works

```
Browser → POST /api/storage/uploads/request-url   (JSON metadata)
        ← { uploadType: "cloudinary", uploadURL, apiKey, timestamp, signature, folder }

Browser → POST <uploadURL> (FormData: file + signing params → Cloudinary CDN)
        ← { secure_url: "https://res.cloudinary.com/..." }

Database ← stores secure_url string
Images   ← served directly from Cloudinary CDN (no server proxy)
```

### Setup

1. Create a free account at [cloudinary.com](https://cloudinary.com) (25 GB storage / 25 GB bandwidth free per month).
2. From your Cloudinary dashboard, copy your **Cloud name**, **API key**, and **API secret**.
3. Set these three environment variables (Replit → Secrets, or `.env`):

| Variable | Where to find it | Example |
|----------|-----------------|---------|
| `CLOUDINARY_CLOUD_NAME` | Dashboard → Settings → Account | `mycloud` |
| `CLOUDINARY_API_KEY` | Dashboard → Settings → API keys | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Dashboard → Settings → API keys | `abc123...` |

4. Restart the API Server workflow.
5. Upload a test screenshot on any trade — images will appear at `https://res.cloudinary.com/<cloud>/...`.

### Portability

Cloudinary credentials are just environment variables. After a GitHub clone or workspace move:
- Set the same three env vars in the new workspace / deployment
- All previously uploaded images remain accessible at the same Cloudinary URLs forever
- New uploads go to the same Cloudinary account

No bucket provisioning, no sidecar, no per-workspace setup.

---

## Backend 2 — Replit Object Storage (Replit-only)

### How it works

```
Browser → POST /api/storage/uploads/request-url   (JSON metadata)
        ← { uploadType: "gcs", uploadURL (presigned PUT), objectPath }

Browser → PUT <uploadURL> (file bytes → Google Cloud Storage directly)

Database ← stores objectPath (e.g. /objects/uploads/<uuid>)
Images   ← served via GET /api/storage/objects/<uuid>  (API proxy to GCS)
```

### Setup

In the Replit Agent, run **once per workspace**:

```javascript
const result = await setupObjectStorage();
console.log(result);
// { success: true, bucketId: "replit-objstore-<id>", secretKeys: [...] }
```

This provisions a GCS bucket and sets three env vars automatically:

| Variable | Description |
|----------|-------------|
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | GCS bucket name |
| `PRIVATE_OBJECT_DIR` | GCS path prefix for uploaded objects |
| `PUBLIC_OBJECT_SEARCH_PATHS` | GCS path prefix for public assets |

Then restart the API Server workflow.

### Limitation

Each Replit workspace gets a **separate GCS bucket**. When you clone the project to a new workspace, you must run `setupObjectStorage()` again, which creates a new bucket. Images uploaded in the original workspace are in the old bucket and **will not be accessible** from the new workspace.

For this reason, Cloudinary is strongly recommended for projects that will be shared, cloned, or deployed.

---

## Upload Endpoint

```
POST /api/storage/uploads/request-url
Authorization: Clerk session cookie (automatic in browser)
Content-Type: application/json

{ "name": "screenshot.png", "size": 204800, "contentType": "image/png" }
```

**Cloudinary response:**
```json
{
  "uploadType": "cloudinary",
  "uploadURL": "https://api.cloudinary.com/v1_1/<cloud>/image/upload",
  "apiKey": "...",
  "timestamp": 1700000000,
  "signature": "abc123...",
  "folder": "ope-fx-trades",
  "metadata": { "name": "...", "size": ..., "contentType": "..." }
}
```

**Replit Object Storage response:**
```json
{
  "uploadURL": "https://storage.googleapis.com/replit-objstore-<id>/...?X-Goog-Signature=...",
  "objectPath": "/objects/uploads/<uuid>",
  "metadata": { "name": "...", "size": ..., "contentType": "..." }
}
```

---

## Image Display

Both backends are handled transparently by the frontend:

```typescript
// TradeFormDialog.tsx / TradeDetails.tsx
function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/objects")) return `/api/storage${path}`;  // Replit GCS
  return path;                                                      // Cloudinary full URL
}
```

- **Cloudinary URLs** (`https://res.cloudinary.com/...`) are used directly — no proxy.
- **GCS paths** (`/objects/uploads/<uuid>`) are proxied through `/api/storage/objects/*`.

---

## Error Handling

| HTTP | Code | Meaning |
|------|------|---------|
| `400` | — | Invalid request body |
| `401` | — | Not authenticated |
| `500` | — | Storage runtime error |
| `503` | `STORAGE_NOT_CONFIGURED` | Neither Cloudinary nor Replit Object Storage is configured |

When no backend is configured the app shows a toast: *"Image upload failed: Image storage is not configured…"* The rest of the app continues to work normally.

---

## Troubleshooting

### "Image upload failed" toast

**Step 1 — Which backend is active?**
```bash
printenv | grep -E "CLOUDINARY_CLOUD_NAME|PRIVATE_OBJECT_DIR"
```
- If `CLOUDINARY_CLOUD_NAME` is set → Cloudinary is active. Check the API key and secret are correct.
- If `PRIVATE_OBJECT_DIR` is set → Replit Object Storage is active. Check the sidecar is running.
- If neither → run `setupObjectStorage()` in the Agent, or set the Cloudinary vars.

**Step 2 — Check API server logs**

Look for `STORAGE_NOT_CONFIGURED`, `Cloudinary upload failed`, or `Error generating upload URL` in the API Server workflow log.

**Step 3 — Cloudinary-specific**

- Verify the signature: the API server uses SHA-1 of alphabetically sorted `"folder=...&timestamp=..."` + api_secret. Check `CLOUDINARY_API_SECRET` is correct.
- Check Cloudinary dashboard → Media Library for uploaded files.
- Ensure the upload preset is not blocking the upload (if using an unsigned preset, remove it — the code uses signed uploads).

**Step 4 — Replit Object Storage-specific**

```bash
# Sidecar alive?
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:1106/health
# Expected: 404 (alive but no /health route)
```
If connection refused → run `setupObjectStorage()` and restart the API Server workflow.

### Images broken after GitHub clone / new workspace

- **Cloudinary**: set the same `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in the new workspace. All existing images remain accessible. ✅
- **Replit Object Storage**: run `setupObjectStorage()` in the new workspace. New uploads work; old images from the previous workspace bucket are not migrated.

### Old images stored as `/objects/...` paths not showing after switching to Cloudinary

Images stored as `/objects/...` paths in the database are still served through the Replit Object Storage proxy (`/api/storage/objects/*`). If the Replit Object Storage env vars are no longer set, those images will return 503. Options:

1. Keep `PRIVATE_OBJECT_DIR` set alongside the Cloudinary vars (both can coexist) so old images continue to resolve.
2. Re-upload the affected screenshots manually.

---

## File Reference

| File | Purpose |
|------|---------|
| `artifacts/api-server/src/lib/cloudinaryStorage.ts` | Cloudinary config detection + signature generation |
| `artifacts/api-server/src/lib/objectStorage.ts` | Replit GCS client, presigned URL generation, object serving |
| `artifacts/api-server/src/routes/storage.ts` | Upload-url endpoint (branches on backend), object serve routes |
| `artifacts/ope-fx/src/components/trades/TradeFormDialog.tsx` | `ScreenshotField` — handles both Cloudinary and GCS upload flows |
| `artifacts/ope-fx/src/pages/TradeDetails.tsx` | `resolveImageUrl` — displays both Cloudinary URLs and GCS paths |

---

## Non-Replit Deployment

When deploying outside Replit, use Cloudinary (set the three env vars). The Replit Object Storage backend depends on the sidecar at `http://127.0.0.1:1106` which only exists on Replit.
