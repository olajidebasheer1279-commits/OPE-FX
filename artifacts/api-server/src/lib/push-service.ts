import webpush from "web-push";
import { eq } from "drizzle-orm";
import {
  db,
  pushSubscriptionsTable,
} from "@workspace/db";
import { logger } from "./logger.js";

const publicKey = process.env["VAPID_PUBLIC_KEY"] ?? "";
const privateKey = process.env["VAPID_PRIVATE_KEY"] ?? "";
const subject = process.env["VAPID_SUBJECT"] ?? "";

const configured = Boolean(publicKey && privateKey && subject);

if (configured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  logger.warn(
    "Web Push is disabled until VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT are configured",
  );
}

export function getVapidPublicKey(): string | null {
  return configured ? publicKey : null;
}

// ── Payload types ─────────────────────────────────────────────────────────────

export interface PushAlertPayload {
  title: string;
  body: string;
  alertId: number;
  symbol: string;
  triggerName: string;
  price: number;
}

/** Generic payload for any in-app notification (reminders, risk alerts, achievements, etc.) */
export interface PushNotifPayload {
  title: string;
  body: string;
  /** Notification type string — passed to the SW for tag namespacing */
  type?: string;
  /** DB notification id — used by the SW as a dedup tag */
  notifId?: number;
  /** Optional deep-link path; SW defaults to /dashboard if absent */
  url?: string;
}

// ── Shared private delivery helper ────────────────────────────────────────────

/**
 * Look up all push subscriptions for a user and deliver `jsonBody` to each.
 * Stale endpoints (404/410) are auto-deleted. All failures are swallowed so
 * the caller's main pipeline is never interrupted.
 */
async function _deliverToSubscriptions(
  userId: string,
  jsonBody: string,
  ttl: number,
): Promise<void> {
  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          jsonBody,
          {
            TTL: ttl,
            // 'high' urgency tells APNs to wake the device immediately rather
            // than wait for the next convenient delivery window — essential for
            // background delivery on locked/sleeping iPhones.
            urgency: "high",
          },
        );
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" &&
          err !== null &&
          "statusCode" in err &&
          typeof err.statusCode === "number"
            ? err.statusCode
            : undefined;

        // Browser push endpoints are removed by providers when a device is
        // unregistered. Delete only those terminal failures.
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.id, subscription.id));
          return;
        }

        logger.error(
          { err, userId, subscriptionId: subscription.id },
          "Web Push delivery failed",
        );
      }
    }),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a push to every device currently registered for a user.
 * Push delivery is deliberately best-effort: it must never interrupt the
 * existing database, SSE, sound, or voice alert pipeline.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushAlertPayload,
): Promise<void> {
  if (!configured) return;
  try {
    // TTL of 300 s (5 min) gives APNs enough time to deliver to a locked/sleeping
    // device without keeping a stale notification around too long.
    await _deliverToSubscriptions(userId, JSON.stringify(payload), 300);
  } catch (err) {
    // Push is an optional delivery channel and must never interrupt alert
    // history, notifications, one-shot disabling, or SSE delivery.
    logger.error({ err, userId }, "Web Push lookup failed");
  }
}

/**
 * Send a push notification for any in-app notification that is not a price alert
 * (journal reminders, weekly review, streak notices, risk alerts, achievements, etc.).
 *
 * Uses the same push infrastructure and subscription table as sendPushToUser.
 * Reminders use a longer TTL (1 hour) so they survive brief connectivity gaps.
 * Best-effort: never throws.
 */
export async function sendNotifPush(
  userId: string,
  payload: PushNotifPayload,
): Promise<void> {
  if (!configured) return;
  try {
    await _deliverToSubscriptions(userId, JSON.stringify(payload), 3600);
  } catch (err) {
    logger.error({ err, userId }, "Notification push lookup failed");
  }
}
