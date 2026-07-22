import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, alertsTable, alertHistoryTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { alertEngine } from "../lib/alert-engine";
import { marketEngine } from "../lib/market-data/engine";

const router: IRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const AlertType = z.enum(["price", "pnl", "drawdown", "rr", "custom"]);
const AlertCondition = z.enum(["above", "below", "equals"]);

const AlertSound = z.enum(["none", "chime", "beep", "bell"]);

const CreateAlertBody = z.object({
  name: z.string().min(1).max(255),
  type: AlertType.optional().default("price"),
  condition: AlertCondition.optional().default("above"),
  targetValue: z.number(),
  symbol: z.string().min(1).max(20),
  message: z.string().max(500).optional(),
  tradeId: z.number().int().positive().optional(),
  isEnabled: z.boolean().optional().default(true),
  repeat: z.boolean().optional().default(true),
  color: z.string().max(20).optional().default("#3b82f6"),
  sound: AlertSound.optional().default("none"),
});

const UpdateAlertBody = z.object({
  name: z.string().min(1).max(255).optional(),
  type: AlertType.optional(),
  condition: AlertCondition.optional(),
  targetValue: z.number().optional(),
  symbol: z.string().min(1).max(20).optional(),
  message: z.string().max(500).nullable().optional(),
  isEnabled: z.boolean().optional(),
  repeat: z.boolean().optional(),
  color: z.string().max(20).optional(),
  sound: AlertSound.optional(),
});

const AlertIdParam = z.object({
  id: z.coerce.number().int().positive(),
});

// ─── Serialiser ───────────────────────────────────────────────────────────────

function serializeAlert(a: typeof alertsTable.$inferSelect) {
  return {
    id: a.id,
    userId: a.userId,
    tradeId: a.tradeId,
    name: a.name,
    type: a.type,
    condition: a.condition,
    targetValue: parseFloat(a.targetValue),
    symbol: a.symbol,
    message: a.message,
    isEnabled: a.isEnabled,
    repeat: a.repeat,
    color: a.color,
    sound: a.sound,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /alerts — list all alerts for the authenticated user */
router.get("/alerts", requireAuth, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.userId, req.userId!))
      .orderBy(desc(alertsTable.createdAt));

    res.json(rows.map(serializeAlert));
  } catch (err) {
    req.log.error({ err }, "Error fetching alerts");
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

/** POST /alerts — create a new alert */
router.post("/alerts", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  try {
    const [alert] = await db
      .insert(alertsTable)
      .values({
        userId: req.userId!,
        tradeId: body.tradeId ?? null,
        name: body.name,
        type: body.type,
        condition: body.condition,
        targetValue: body.targetValue.toString(),
        symbol: body.symbol,
        message: body.message ?? null,
        isEnabled: body.isEnabled,
        repeat: body.repeat,
        color: body.color,
        sound: body.sound,
      })
      .returning();

    // Immediately subscribe to the symbol and refresh alert cache
    marketEngine.ensureSubscribed(alert.symbol);
    void alertEngine.invalidateCache();

    res.status(201).json(serializeAlert(alert));
  } catch (err) {
    req.log.error({ err }, "Error creating alert");
    res.status(500).json({ error: "Failed to create alert" });
  }
});

/** PATCH /alerts/:id — edit an existing alert */
router.patch("/alerts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = AlertIdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid alert id" });
    return;
  }
  const parsed = UpdateAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const body = parsed.data;
  const updateFields: Partial<typeof alertsTable.$inferInsert> = {};
  if (body.name !== undefined) updateFields.name = body.name;
  if (body.type !== undefined) updateFields.type = body.type;
  if (body.condition !== undefined) updateFields.condition = body.condition;
  if (body.targetValue !== undefined)
    updateFields.targetValue = body.targetValue.toString();
  if (body.symbol !== undefined) updateFields.symbol = body.symbol;
  if (body.message !== undefined) updateFields.message = body.message ?? null;
  if (body.isEnabled !== undefined) updateFields.isEnabled = body.isEnabled;
  if (body.repeat !== undefined) updateFields.repeat = body.repeat;
  if (body.color !== undefined) updateFields.color = body.color;
  if (body.sound !== undefined) updateFields.sound = body.sound;

  if (Object.keys(updateFields).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const [updated] = await db
      .update(alertsTable)
      .set(updateFields)
      .where(
        and(
          eq(alertsTable.id, params.data.id),
          eq(alertsTable.userId, req.userId!),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }

    res.json(serializeAlert(updated));
  } catch (err) {
    req.log.error({ err }, "Error updating alert");
    res.status(500).json({ error: "Failed to update alert" });
  }
});

/** PATCH /alerts/:id/toggle — enable or disable an alert */
router.patch(
  "/alerts/:id/toggle",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = AlertIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid alert id" });
      return;
    }

    try {
      const [existing] = await db
        .select()
        .from(alertsTable)
        .where(
          and(
            eq(alertsTable.id, params.data.id),
            eq(alertsTable.userId, req.userId!),
          ),
        )
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }

      const [updated] = await db
        .update(alertsTable)
        .set({ isEnabled: !existing.isEnabled })
        .where(eq(alertsTable.id, existing.id))
        .returning();

      void alertEngine.invalidateCache();
      res.json(serializeAlert(updated));
    } catch (err) {
      req.log.error({ err }, "Error toggling alert");
      res.status(500).json({ error: "Failed to toggle alert" });
    }
  },
);

/** DELETE /alerts/:id — delete an alert and its history */
router.delete("/alerts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = AlertIdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid alert id" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(alertsTable)
      .where(
        and(
          eq(alertsTable.id, params.data.id),
          eq(alertsTable.userId, req.userId!),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }

    // Delete history first (FK constraint)
    await db
      .delete(alertHistoryTable)
      .where(eq(alertHistoryTable.alertId, existing.id));

    await db.delete(alertsTable).where(eq(alertsTable.id, existing.id));
    void alertEngine.invalidateCache();

    res.sendStatus(204);
  } catch (err) {
    req.log.error({ err }, "Error deleting alert");
    res.status(500).json({ error: "Failed to delete alert" });
  }
});

/** GET /alerts/:id/history — list trigger history for an alert */
router.get(
  "/alerts/:id/history",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = AlertIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid alert id" });
      return;
    }

    try {
      // Confirm alert belongs to this user
      const [alert] = await db
        .select()
        .from(alertsTable)
        .where(
          and(
            eq(alertsTable.id, params.data.id),
            eq(alertsTable.userId, req.userId!),
          ),
        )
        .limit(1);

      if (!alert) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }

      const history = await db
        .select()
        .from(alertHistoryTable)
        .where(eq(alertHistoryTable.alertId, alert.id))
        .orderBy(desc(alertHistoryTable.triggeredAt))
        .limit(100);

      res.json(
        history.map((h) => ({
          id: h.id,
          alertId: h.alertId,
          triggeredAt: h.triggeredAt.toISOString(),
          triggerValue: h.triggerValue ? parseFloat(h.triggerValue) : null,
          message: h.message,
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Error fetching alert history");
      res.status(500).json({ error: "Failed to fetch alert history" });
    }
  },
);

export default router;
