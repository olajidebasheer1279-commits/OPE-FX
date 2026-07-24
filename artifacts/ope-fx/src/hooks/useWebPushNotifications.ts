import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { apiFetch } from "@/lib/apiFetch";
import { useAlertSettings } from "./useAlertSettings";

interface PushSubscriptionResponse {
  publicKey: string;
}

interface StoredPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function getBasePath(): string {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

function serializeSubscription(
  subscription: PushSubscription,
): StoredPushSubscription {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Push subscription is missing required keys");
  }
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

async function removeSubscription(endpoint: string, base: string): Promise<void> {
  await apiFetch(`${base}/api/push/subscriptions`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

/**
 * Keeps the current signed-in browser/device registered for backend Web Push.
 * This has no visible UI and does not replace the existing SSE/browser alert
 * delivery path.
 */
export function useWebPushNotifications(): void {
  const { isSignedIn } = useAuth();
  const { settings, loading } = useAlertSettings();

  useEffect(() => {
    if (
      !isSignedIn ||
      loading ||
      !settings.browserNotifications ||
      !isPushSupported()
    ) {
      return;
    }

    let cancelled = false;
    const base = getBasePath();
    const scope = base || "/";

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          `${base}/sw.js`,
          { scope },
        );
        await navigator.serviceWorker.ready;
        if (cancelled) return;

        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (permission !== "granted" || cancelled) return;

        const keyResponse = await apiFetch(`${base}/api/push/vapid-public-key`);
        if (!keyResponse.ok) return;
        const { publicKey } =
          (await keyResponse.json()) as PushSubscriptionResponse;
        if (!publicKey || cancelled) return;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToArrayBuffer(publicKey),
          });
        }
        if (cancelled) return;

        const payload = serializeSubscription(subscription);
        await apiFetch(`${base}/api/push/subscriptions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // Push is an optional delivery channel. Existing SSE/browser
        // notifications continue to work when a browser blocks Push API.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, loading, settings.browserNotifications]);

  useEffect(() => {
    if (!isSignedIn || settings.browserNotifications || !isPushSupported()) {
      return;
    }

    const base = getBasePath();
    const scope = base || "/";
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration(scope);
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const { endpoint } = serializeSubscription(subscription);
          await removeSubscription(endpoint, base);
          await subscription.unsubscribe();
        }
      } catch {
        // The setting is still saved by the existing alert-settings pipeline.
      }
    })();
  }, [isSignedIn, settings.browserNotifications]);
}