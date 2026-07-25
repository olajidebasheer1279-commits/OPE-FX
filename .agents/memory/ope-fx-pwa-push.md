---
name: OPE-FX PWA push setup
description: Push notification implementation details, known pitfalls, and confirmed fixes for iOS background delivery.
---

## urlBase64ToUint8Array — must return Uint8Array, not ArrayBuffer

`PushManager.subscribe({ applicationServerKey })` on iOS Safari rejects a raw `ArrayBuffer` with "applicationServerKey must contain a valid P-256 public key" even though the Web Push spec allows any `BufferSource`. The fix is to return the `Uint8Array` directly (not `.buffer`).

**Applies to two places:**
- `artifacts/ope-fx/src/hooks/useWebPushNotifications.ts` — `urlBase64ToUint8Array()` return type is `Uint8Array`
- `artifacts/ope-fx/public/sw.js` — `pushsubscriptionchange` handler's local copy of the same function

**Why:** iOS WebKit's PushManager implementation rejects `ArrayBuffer` for this parameter despite the spec allowing it.

## Background delivery (iOS locked/sleeping)

Two settings are required for background push delivery on iOS:

1. **TTL ≥ 300s** — 60s (previous value) is too short; APNs silently drops the notification if the device can't be reached within the TTL window. Price alerts now use 300s.
2. **urgency: "high"** — tells APNs to wake the device immediately rather than wait for a convenient delivery window (e.g. when screen turns on).

Both are set in `artifacts/api-server/src/lib/push-service.ts` inside `_deliverToSubscriptions`.

## PNG icons — SVG silently rejected

`badge` in service worker notification options must be a PNG path. SVG is silently rejected by iOS and some Android versions. `/icon-192.png` is used for both `icon` and `badge`.

## ImageMagick icon generation

PNG icons were generated via `magick` (ImageMagick v7 CLI). The command is `magick <source> -resize 192x192 icon-192.png`.

## pushsubscriptionchange — auth limitation

The `pushsubscriptionchange` handler in `sw.js` re-subscribes and POSTs to `/api/push/subscriptions` with `credentials: "include"`. Clerk uses bearer tokens (not cookies), so this POST will be unauthenticated (401) if the subscription rotates while the app is closed. The subscription will be re-created on next app open via the auto-sync in `useWebPushNotifications`.
