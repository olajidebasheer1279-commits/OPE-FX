import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, isNull } from "drizzle-orm";
import {
  db,
  notificationsTable,
  tradesTable,
  journalsTable,
  reviewsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateDefaultAccount } from "../lib/accounts";

const router: IRouter = Router();

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : parseFloat(v);
}

/** GET /notifications — list recent notifications */
router.get(
  "/notifications",
  requireAuth,
  async (req, res): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.userId, req.userId!))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(50);

      res.json(
        rows.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: n.isRead,
          createdAt: n.createdAt.toISOString(),
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Error fetching notifications");
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  },
);

/** PATCH /notifications/:id/read — mark one notification as read */
router.patch(
  "/notifications/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    try {
      const [existing] = await db
        .select()
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.id, id),
            eq(notificationsTable.userId, req.userId!),
          ),
        )
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }

      const [updated] = await db
        .update(notificationsTable)
        .set({ isRead: true })
        .where(eq(notificationsTable.id, id))
        .returning();

      res.json({
        id: updated.id,
        title: updated.title,
        message: updated.message,
        type: updated.type,
        isRead: updated.isRead,
        createdAt: updated.createdAt.toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "Error marking notification read");
      res.status(500).json({ error: "Failed to update notification" });
    }
  },
);

/** POST /notifications/read-all — mark all notifications as read */
router.post(
  "/notifications/read-all",
  requireAuth,
  async (req, res): Promise<void> => {
    try {
      await db
        .update(notificationsTable)
        .set({ isRead: true })
        .where(
          and(
            eq(notificationsTable.userId, req.userId!),
            eq(notificationsTable.isRead, false),
          ),
        );

      res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Error marking all notifications read");
      res.status(500).json({ error: "Failed to update notifications" });
    }
  },
);

/** DELETE /notifications/:id — delete a notification */
router.delete(
  "/notifications/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    try {
      const [existing] = await db
        .select()
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.id, id),
            eq(notificationsTable.userId, req.userId!),
          ),
        )
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }

      await db
        .delete(notificationsTable)
        .where(eq(notificationsTable.id, id));

      res.sendStatus(204);
    } catch (err) {
      req.log.error({ err }, "Error deleting notification" );
      res.status(500).json({ error: "Failed to delete notification" });
    }
  },
);

/**
 * POST /notifications/generate — auto-generate smart notifications.
 * Safe to call multiple times; deduplicates by checking recent similar notifications.
 */
router.post(
  "/notifications/generate",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.userId!;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const created: string[] = [];

    try {
      const account = await getOrCreateDefaultAccount(userId);

      // Helper: check if a notification of this type was created in the last N hours
      async function recentlyNotified(
        titlePrefix: string,
        hoursBack: number,
      ): Promise<boolean> {
        const since = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
        const [existing] = await db
          .select()
          .from(notificationsTable)
          .where(
            and(
              eq(notificationsTable.userId, userId),
              gte(notificationsTable.createdAt, since),
            ),
          )
          .limit(1);
        // Filter in JS since LIKE isn't available here without raw sql
        const rows = await db
          .select()
          .from(notificationsTable)
          .where(
            and(
              eq(notificationsTable.userId, userId),
              gte(notificationsTable.createdAt, since),
            ),
          );
        return rows.some((r) => r.title.startsWith(titlePrefix));
      }

      async function createNotif(
        title: string,
        message: string,
        type: string,
      ) {
        await db.insert(notificationsTable).values({
          userId,
          title,
          message,
          type,
          isRead: false,
        });
        created.push(title);
      }

      // 1. Journal reminder — if no entry for today
      const [todayJournal] = await db
        .select()
        .from(journalsTable)
        .where(
          and(eq(journalsTable.userId, userId), eq(journalsTable.date, todayStr)),
        )
        .limit(1);

      if (!todayJournal) {
        const alreadyNotified = await recentlyNotified("📝 Journal Reminder", 12);
        if (!alreadyNotified) {
          await createNotif(
            "📝 Journal Reminder",
            "You haven't written today's journal entry. Reflect on your trading day.",
            "reminder",
          );
        }
      }

      // 2. Weekly review reminder — on Fridays and Saturdays
      const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
      if (dayOfWeek === 5 || dayOfWeek === 6) {
        // Check if any review was created this week
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dayOfWeek + 1); // Monday
        weekStart.setHours(0, 0, 0, 0);

        const weekReviews = await db
          .select()
          .from(reviewsTable)
          .where(
            and(
              eq(reviewsTable.userId, userId),
              gte(reviewsTable.createdAt, weekStart),
            ),
          )
          .limit(1);

        if (weekReviews.length === 0) {
          const alreadyNotified = await recentlyNotified("📊 Weekly Review", 24);
          if (!alreadyNotified) {
            await createNotif(
              "📊 Weekly Review",
              "End of week — time to write your weekly performance review.",
              "reminder",
            );
          }
        }
      }

      // 3. Streak notifications — from recent closed trades
      const recentTrades = await db
        .select()
        .from(tradesTable)
        .where(
          and(
            eq(tradesTable.userId, userId),
            eq(tradesTable.status, "closed"),
          ),
        )
        .orderBy(desc(tradesTable.closedAt))
        .limit(10);

      if (recentTrades.length > 0) {
        // Count current streak
        let streak = 0;
        let streakType: "win" | "loss" | null = null;
        for (const t of recentTrades) {
          const pnl = toNum(t.pnl);
          const type = pnl > 0 ? "win" : pnl < 0 ? "loss" : null;
          if (type === null) continue; // breakeven, skip
          if (streakType === null) streakType = type;
          if (type === streakType) streak++;
          else break;
        }

        if (streakType === "win" && streak >= 3) {
          const alreadyNotified = await recentlyNotified("🏆 Profit Streak", 24);
          if (!alreadyNotified) {
            await createNotif(
              `🏆 Profit Streak: ${streak} Wins`,
              `You're on a ${streak}-trade winning streak! Stay disciplined and don't over-trade.`,
              "success",
            );
          }
        }

        if (streakType === "loss" && streak >= 3) {
          const alreadyNotified = await recentlyNotified("⚠️ Loss Streak Alert", 12);
          if (!alreadyNotified) {
            await createNotif(
              `⚠️ Loss Streak Alert: ${streak} Losses`,
              `You have ${streak} consecutive losses. Consider pausing and reviewing your setups.`,
              "warning",
            );
          }
        }

        // 4. Risk alert — if avg risk% of last 5 trades > 3%
        const last5 = recentTrades.slice(0, 5).filter((t) => t.riskPercent !== null);
        if (last5.length >= 3) {
          const avgRisk =
            last5.reduce((s, t) => s + toNum(t.riskPercent), 0) / last5.length;
          if (avgRisk > 3) {
            const alreadyNotified = await recentlyNotified("⚠️ Risk Management Alert", 24);
            if (!alreadyNotified) {
              await createNotif(
                "⚠️ Risk Management Alert",
                `Your average risk per trade is ${avgRisk.toFixed(1)}% — above the recommended 2%. Reduce position size.`,
                "warning",
              );
            }
          }
        }
      }

      res.json({ created: created.length, notifications: created });
    } catch (err) {
      req.log.error({ err }, "Error generating notifications");
      res.status(500).json({ error: "Failed to generate notifications" });
    }
  },
);

export default router;
