/**
 * AlertEngine — evaluates price ticks against user-defined alerts.
 *
 * On each price update for a symbol:
 *   1. Look up all enabled "price" alerts for that symbol (in-memory cache).
 *   2. Check condition (above / below / equals).
 *   3. If met and not in cooldown: write alert_history row, write notification,
 *      broadcast SSE event to the user, and disable the alert if repeat=false.
 *
 * Cache is refreshed every 30 s and on demand.
 */
import { and, eq } from "drizzle-orm";
import {
  db,
  alertsTable,
  alertHistoryTable,
  notificationsTable,
  type Alert,
} from "@workspace/db";
import { logger } from "./logger.js";
import { sseBroadcaster } from "./market-data/sse-broadcaster.js";
import { marketEngine } from "./market-data/engine.js";
import type { PriceUpdate } from "./market-data/types.js";

/** How many ms to wait before the same alert can fire again (repeat=true). */
const COOLDOWN_MS = 60_000;

/** Human-readable label for each trigger name key. */
const TRIGGER_NAME_LABELS: Record<string, string> = {
  poi: "POI Trigger",
  bos: "Break of Structure Trigger",
  choch: "CHOCH Trigger",
  liquidity_sweep: "Liquidity Sweep Trigger",
  entry: "Entry Trigger",
  take_profit: "Take Profit Trigger",
  stop_loss: "Stop Loss Trigger",
};

function getEffectiveTriggerName(alert: Alert): string | null {
  if (!alert.triggerName) return null;
  if (alert.triggerName === "custom") {
    return alert.triggerNameCustom || "Custom Trigger";
  }
  return TRIGGER_NAME_LABELS[alert.triggerName] ?? null;
}

class AlertEngine {
  /** symbol (uppercase) → array of active alerts */
  private cache = new Map<string, Alert[]>();
  /** alertId → last fired timestamp (ms) */
  private cooldown = new Map<number, number>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.refreshCache();

    this.refreshTimer = setInterval(() => {
      void this.refreshCache();
    }, 30_000);

    // Subscribe to every price tick from the market engine
    marketEngine.onPrice((update) => {
      void this.onPrice(update);
    });
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Force cache refresh (call from alert CRUD routes). */
  async invalidateCache(): Promise<void> {
    await this.refreshCache();
  }

  // ── Core evaluation ─────────────────────────────────────────────────────────

  private async onPrice(update: PriceUpdate): Promise<void> {
    const sym = update.symbol.toUpperCase();
    const alerts = this.cache.get(sym);
    if (!alerts || alerts.length === 0) return;

    for (const alert of alerts) {
      if (!alert.isEnabled) continue;
      if (alert.type !== "price") continue; // only price alerts use live data

      const target = parseFloat(alert.targetValue);
      if (isNaN(target)) continue;

      const price = update.mid;
      const triggered = this.checkCondition(price, alert.condition, target);
      if (!triggered) continue;

      // Cooldown guard
      const lastFired = this.cooldown.get(alert.id) ?? 0;
      if (Date.now() - lastFired < COOLDOWN_MS) continue;

      this.cooldown.set(alert.id, Date.now());

      // Fire in background — don't block the price loop
      void this.fireAlert(alert, price);
    }
  }

  private checkCondition(
    price: number,
    condition: string,
    target: number,
  ): boolean {
    switch (condition) {
      case "above":
        return price >= target;
      case "below":
        return price <= target;
      case "equals":
        // Within 0.005% of target
        return Math.abs(price - target) / target < 0.00005;
      default:
        return false;
    }
  }

  private async fireAlert(alert: Alert, triggerPrice: number): Promise<void> {
    try {
      const condLabel =
        alert.condition === "above"
          ? "crossed above"
          : alert.condition === "below"
            ? "fell below"
            : "reached";

      const triggerDisplayName = getEffectiveTriggerName(alert);

      const conditionMessage = `${alert.symbol} ${condLabel} ${parseFloat(alert.targetValue).toFixed(5)}`;
      const message = alert.message ?? conditionMessage;

      // Notification title: "AUDUSD • POI TRIGGER"
      const notifTitle = triggerDisplayName
        ? `${alert.symbol} • ${triggerDisplayName.toUpperCase()}`
        : `${alert.symbol} • ALERT`;

      // Notification body: "Price Goes Above 1.91027\n<user note>" — no "Note:" label
      const conditionStr =
        alert.condition === "above"
          ? "Price Goes Above"
          : alert.condition === "below"
            ? "Price Goes Below"
            : "Price Equals";
      const notifBody = alert.message
        ? `${conditionStr} ${parseFloat(alert.targetValue).toFixed(5)}\n${alert.message}`
        : `${conditionStr} ${parseFloat(alert.targetValue).toFixed(5)}`;

      // 1. Write alert history
      await db.insert(alertHistoryTable).values({
        alertId: alert.id,
        userId: alert.userId,
        triggerValue: triggerPrice.toString(),
        message: notifBody,
      });

      // 2. Create notification
      await db.insert(notificationsTable).values({
        userId: alert.userId,
        title: notifTitle,
        message: notifBody,
        type: "alert",
        isRead: false,
      });

      // 3. Disable if one-shot
      if (!alert.repeat) {
        await db
          .update(alertsTable)
          .set({ isEnabled: false })
          .where(eq(alertsTable.id, alert.id));

        // Remove from cache immediately
        const sym = alert.symbol.toUpperCase();
        const cached = this.cache.get(sym);
        if (cached) {
          this.cache.set(
            sym,
            cached.map((a) =>
              a.id === alert.id ? { ...a, isEnabled: false } : a,
            ),
          );
        }
      }

      // 4. Push SSE event to the user's browser
      sseBroadcaster.sendToUser(alert.userId, "alert_fired", {
        alertId: alert.id,
        symbol: alert.symbol,
        condition: alert.condition,
        targetValue: parseFloat(alert.targetValue),
        price: triggerPrice,
        message: notifBody,
        sound: alert.sound,
        color: alert.color,
        triggerName: triggerDisplayName,    // NEW: display label e.g. "POI Trigger"
        triggerKey: alert.triggerName,      // NEW: raw key e.g. "poi"
      });

      logger.info(
        { alertId: alert.id, symbol: alert.symbol, price: triggerPrice },
        "Alert fired",
      );
    } catch (err) {
      logger.error({ err, alertId: alert.id }, "Failed to fire alert");
    }
  }

  // ── Cache ───────────────────────────────────────────────────────────────────

  private async refreshCache(): Promise<void> {
    try {
      const rows = await db
        .select()
        .from(alertsTable)
        .where(and(eq(alertsTable.isEnabled, true)));

      const next = new Map<string, Alert[]>();
      for (const row of rows) {
        const sym = row.symbol.toUpperCase();
        const list = next.get(sym) ?? [];
        list.push(row);
        next.set(sym, list);
      }
      this.cache = next;
    } catch (err) {
      logger.error({ err }, "Failed to refresh alert cache");
    }
  }
}

export const alertEngine = new AlertEngine();
