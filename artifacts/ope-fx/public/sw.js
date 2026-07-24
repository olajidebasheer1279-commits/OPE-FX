/* OPE-FX Service Worker — PWA shell cache + Web Push handler */
const CACHE_VERSION = "v2";
const STATIC_CACHE = `ope-fx-shell-${CACHE_VERSION}`;
const STATIC_ASSETS = ["/", "/index.html", "/manifest.json", "/logo.svg", "/favicon.svg", "/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  if (new URL(request.url).pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});

/* ── Push event ─────────────────────────────────────────────────────────────── */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "OPE-FX Alert";
  const body = payload.body || "A monitored alert has fired.";
  const alertId = payload.alertId;
  const symbol = payload.symbol;
  const triggerName = payload.triggerName;

  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/favicon.svg",
    tag: alertId ? `ope-fx-alert-${alertId}` : "ope-fx-alert",
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: {
      url: alertId ? `/dashboard` : "/dashboard",
      alertId,
      symbol,
      triggerName,
    },
    actions: [
      { action: "view", title: "View Dashboard" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click ──────────────────────────────────────────────────────── */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if one is open
        const appClient = clients.find((c) =>
          new URL(c.url).origin === self.location.origin
        );
        if (appClient) {
          return appClient.focus().then((focused) => {
            if (focused && "navigate" in focused) {
              return focused.navigate(targetUrl);
            }
          });
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});

/* ── Push subscription change ────────────────────────────────────────────────── */

self.addEventListener("pushsubscriptionchange", (event) => {
  // Re-subscribe and sync with the server if the subscription is rotated
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then((subscription) => {
        const payload = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.toJSON().keys?.p256dh,
            auth: subscription.toJSON().keys?.auth,
          },
        };
        return fetch("/api/push/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
      })
      .catch(() => {/* best-effort */}),
  );
});
