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

## VAPID public key endpoint must NOT require authentication

**Root cause of Enable Notifications failure (confirmed via curl diagnostic):**

`GET /api/push/vapid-public-key` was protected with `requireAuth`. Clerk in dev mode responds with `x-clerk-auth-reason: dev-browser-missing` in non-browser contexts (service workers, curl). This caused:

1. **Initial Enable flow on iOS/Android PWA installs** — `fetchVapidPublicKey` returned `null` → `enablePush()` threw "Push not configured on server — VAPID keys may be missing" → UI stayed at Enable button, never reaching "Notifications Active"
2. **`pushsubscriptionchange` SW handler** — SW context has no Clerk cookies → 401 → can't fetch VAPID key → subscription rotation silently fails → push stops delivering after first rotation

**Fix:** Removed `requireAuth` from this endpoint. The VAPID application server key is a *public* cryptographic key by design. The `POST /api/push/subscriptions` (saves subscription) and `DELETE /api/push/subscriptions` still require auth.

**Why:** VAPID public keys are meant to be publicly distributed. Protecting them with session auth creates a circular dependency (you need auth to get the key, but you need the key to set up push which is needed before login in some flows). Standard Web Push practice treats the VAPID public key as a public configuration value.

## enablePush() — always create fresh subscription

`enablePush()` previously reused an existing `PushSubscription` via `pushManager.getSubscription()`. If the VAPID key pair had rotated since the subscription was created, all push deliveries would silently 401 from the push service (key mismatch) even though the Enable flow appeared to succeed.

**Fix:** In `enablePush()` (explicit user action), unsubscribe any existing subscription first, then create a fresh one with the current VAPID public key. The auto-sync background effect still reuses existing subscriptions (correct for background re-sync).

**Why:** On explicit Enable, the user is requesting a fresh setup. A fresh subscription guarantees it uses the current VAPID key pair. Background auto-sync is lower risk and doesn't need this behaviour.
