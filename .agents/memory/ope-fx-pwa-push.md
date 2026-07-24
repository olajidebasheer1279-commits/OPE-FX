---
name: OPE-FX PWA and Push Notification setup
description: How the Web Push + PWA install system is structured in OPE-FX.
---

## Key architecture

- `useWebPushNotifications()` lives in `artifacts/ope-fx/src/hooks/useWebPushNotifications.ts`
- It is called in TWO places:
  1. `AppLayout.tsx` — side-effect only (auto re-subscribes on mount if already granted)
  2. `Settings → NotificationsTab` — destructures `{ permission, isSubscribed, isBusy, enablePush, disablePush }` for the UI
- The hook auto-syncs the subscription to the server on mount; the Settings button triggers `enablePush()` imperatively.
- `enablePush()` → request permission → register SW → fetch VAPID key → `pushManager.subscribe()` → POST to `/api/push/subscriptions` → `updateSettings({ browserNotifications: true })`
- `disablePush()` → unsubscribe from pushManager → DELETE `/api/push/subscriptions` → `updateSettings({ browserNotifications: false })`

## Type gotcha

`urlBase64ToUint8Array` must return `ArrayBuffer` (not `Uint8Array`) for `PushManager.subscribe({ applicationServerKey })`. Return `bytes.buffer as ArrayBuffer`.

## PWA icons

- Generate with ImageMagick 7: `magick -background none -size NxN logo.svg output.png`
- Command is `magick` (not `convert`; deprecated in IMv7 though still available)
- Three PNG sizes needed: 512x512, 192x192 (manifest), 180x180 (apple-touch-icon)
- `apple-touch-icon` linked in `index.html` with `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`

## iOS push requirement

Push notifications on iOS require the app to be installed via "Add to Home Screen" (iOS 16.4+). The Settings UI detects iOS + non-standalone mode and shows instructions instead of enabling the button.

## Service worker

`public/sw.js` handles: `install`, `activate`, `fetch` (shell cache), `push` (show notification), `notificationclick` (focus or open window), `pushsubscriptionchange` (re-subscribe and sync endpoint).

**Why:** `pushsubscriptionchange` fires when the browser rotates the push subscription endpoint — without it, alerts would silently fail after a browser update.

## Backend

- Push routes: `artifacts/api-server/src/routes/push.ts` (GET VAPID key, POST subscription, DELETE subscription)
- Push delivery: `artifacts/api-server/src/lib/push-service.ts` — `sendPushToUser(userId, payload)`
- Alert engine calls `sendPushToUser` when an alert fires
- Stale subscriptions (404/410 from push provider) are auto-deleted
