import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getVapidPublicKey } from "../lib/push-service.js";

const router: IRouter = Router();

const SubscriptionBody = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

router.get("/push/vapid-public-key", requireAuth, (_req, res): void => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Web Push is not configured" });
    return;
  }
  res.json({ publicKey: key });
});

router.post("/push/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const parsed = SubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { endpoint, keys } = parsed.data;
  try {
    await db
      .insert(pushSubscriptionsTable)
      .values({
        userId: req.userId!,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: {
          userId: req.userId!,
          p256dh: keys.p256dh,
          auth: keys.auth,
          updatedAt: new Date(),
        },
      });

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error saving push subscription");
    res.status(500).json({ error: "Failed to save push subscription" });
  }
});

router.delete("/push/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const endpoint = z.string().url().max(2048).safeParse(req.body?.endpoint);
  if (!endpoint.success) {
    res.status(400).json({ error: "A valid push subscription endpoint is required" });
    return;
  }

  try {
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.userId, req.userId!),
          eq(pushSubscriptionsTable.endpoint, endpoint.data),
        ),
      );
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting push subscription");
    res.status(500).json({ error: "Failed to delete push subscription" });
  }
});

export default router;