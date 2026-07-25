/**
 * useWebPushNotifications
 *
 * Manages the full Web Push lifecycle:
 *   - Auto re-registers the subscription on mount when permission is already granted
 *   - Exposes `enablePush()` and `disablePush()` for explicit Settings UI control
 *   - Returns live permission/subscription state for UI rendering
 *
 * Push is a best-effort delivery channel. Errors here must never interrupt the
 * existing SSE / sound / voice alert pipeline.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@clerk/react";
import { apiFetch } from "@/lib/apiFetch";
import { useAlertSettings } from "./useAlertSettings";

export type PushPermission = "loading" | "unsupported" | "default" | "granted" | "denied";

export interface WebPushState {
  /** Current Notification API permission state (or 'unsupported' / 'loading'). */
  permission: PushPermission;
  /** Whether this browser has an active push subscription saved on the server. */
  isSubscribed: boolean;
  /** Whether an async operation (subscribe / unsubscribe) is in progress. */
  isBusy: boolean;
  /**
   * The real error message from the last failed enablePush() attempt, or null.
   * Exposed so the UI can show the actual failure reason instead of a generic message.
   */
  errorMessage: string | null;
  /**
   * Request notification permission, register the SW, create a push
   * subscription, and save it to the backend. Updates browserNotifications
   * alert setting to true on success.
   * Returns true if the user granted permission and the subscription was saved.
   */
  enablePush: () => Promise<boolean>;
  /**
   * Unsubscribe from push, remove the subscription from the backend, and
   * update the browserNotifications alert setting to false.
   */
  disablePush: () => Promise<void>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

interface SubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function serializeSubscription(sub: PushSubscription): SubscriptionPayload {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Push subscription is missing required keys");
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}

async function fetchVapidPublicKey(base: string): Promise<string | null> {
  try {
    const res = await apiFetch(`${base}/api/push/vapid-public-key`);
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey: string };
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

async function saveSubscription(payload: SubscriptionPayload, base: string): Promise<void> {
  const res = await apiFetch(`${base}/api/push/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ? ` (${body.error})` : "";
    } catch { /* ignore parse errors */ }
    throw new Error(`Server rejected subscription (${res.status})${detail}`);
  }
}

async function deleteSubscription(endpoint: string, base: string): Promise<void> {
  await apiFetch(`${base}/api/push/subscriptions`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

async function getOrRegisterSW(base: string): Promise<ServiceWorkerRegistration> {
  const swUrl = `${base}/sw.js`;
  const scope = base || "/";
  const reg = await navigator.serviceWorker.register(swUrl, { scope });
  await navigator.serviceWorker.ready;
  return reg;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useWebPushNotifications(): WebPushState {
  const { isSignedIn } = useAuth();
  const { settings, updateSettings } = useAlertSettings();
  const base = getBasePath();

  const supported = isPushSupported();

  const [permission, setPermission] = useState<PushPermission>(
    supported ? "loading" : "unsupported",
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Hydrate permission state from Notification API on mount
  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission as NotificationPermission);
  }, [supported]);

  // Track permission changes (e.g. user changes setting in browser UI)
  useEffect(() => {
    if (!supported || typeof PermissionStatus === "undefined") return;
    let descriptor: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((ps) => {
        descriptor = ps;
        ps.onchange = () => setPermission(ps.state as PushPermission);
      })
      .catch(() => {/* Firefox may not support permissions.query for notifications */});
    return () => {
      if (descriptor) descriptor.onchange = null;
    };
  }, [supported]);

  // Check whether we already have a live subscription
  const cancelAutoRef = useRef(false);
  useEffect(() => {
    if (!supported || !isSignedIn) return;
    cancelAutoRef.current = false;

    void (async () => {
      try {
        const scope = base || "/";
        const reg = await navigator.serviceWorker.getRegistration(scope);
        if (!reg || cancelAutoRef.current) return;

        const sub = await reg.pushManager.getSubscription();
        if (cancelAutoRef.current) return;

        if (sub) {
          // Re-sync the existing subscription with the server (endpoint may rotate)
          setIsSubscribed(true);
          if (Notification.permission === "granted") {
            const payload = serializeSubscription(sub);
            await saveSubscription(payload, base);
          }
        } else {
          setIsSubscribed(false);
          // Auto-subscribe if the user has browserNotifications enabled and
          // permission is already granted (no new prompt needed)
          if (settings.browserNotifications && Notification.permission === "granted") {
            const key = await fetchVapidPublicKey(base);
            if (!key || cancelAutoRef.current) return;
            const freshReg = await getOrRegisterSW(base);
            if (cancelAutoRef.current) return;
            const newSub = await freshReg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToArrayBuffer(key),
            });
            if (cancelAutoRef.current) return;
            await saveSubscription(serializeSubscription(newSub), base);
            setIsSubscribed(true);
          }
        }
      } catch {
        /* best-effort */
      }
    })();

    return () => { cancelAutoRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, supported, base]);

  // ── enablePush ─────────────────────────────────────────────────────────────

  const enablePush = useCallback(async (): Promise<boolean> => {
    if (!supported || isBusy) return false;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      // 1. Request permission (shows the browser prompt if "default")
      let perm = Notification.permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
      }
      setPermission(perm as PushPermission);
      if (perm !== "granted") return false;

      // 2. Register / get the service worker
      const reg = await getOrRegisterSW(base);

      // 3. Fetch VAPID public key from our server
      const key = await fetchVapidPublicKey(base);
      if (!key) throw new Error("Push not configured on server — VAPID keys may be missing");

      // 4. Force a fresh subscription so the browser endpoint always binds to the
      // current VAPID public key. Reusing an existing subscription is not safe here:
      // if the VAPID key pair was rotated since the subscription was created, the
      // push service will reject every delivery attempt with a 401 (silent failure).
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(key),
      });

      // 5. Save the subscription to our backend (throws on non-2xx)
      await saveSubscription(serializeSubscription(sub), base);
      setIsSubscribed(true);

      // 6. Persist the preference in alert settings
      await updateSettings({ browserNotifications: true });

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [supported, isBusy, base, updateSettings]);

  // ── disablePush ────────────────────────────────────────────────────────────

  const disablePush = useCallback(async (): Promise<void> => {
    if (!supported || isBusy) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const scope = base || "/";
      const reg = await navigator.serviceWorker.getRegistration(scope);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const { endpoint } = serializeSubscription(sub);
        await deleteSubscription(endpoint, base);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      await updateSettings({ browserNotifications: false });
    } catch {
      /* best-effort */
    } finally {
      setIsBusy(false);
    }
  }, [supported, isBusy, base, updateSettings]);

  return { permission, isSubscribed, isBusy, errorMessage, enablePush, disablePush };
}
