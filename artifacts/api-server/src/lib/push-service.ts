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

export interface PushAlertPayload {
  title: string;
  body: string;
  alertId: number;
  symbol: string;
  triggerName: string;
  price: number;
}

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
            JSON.stringify(payload),
            { TTL: 60 },
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
  } catch (err) {
    // Push is an optional delivery channel and must never interrupt alert
    // history, notifications, one-shot disabling, or SSE delivery.
    logger.error({ err, userId }, "Web Push lookup failed");
  }
}