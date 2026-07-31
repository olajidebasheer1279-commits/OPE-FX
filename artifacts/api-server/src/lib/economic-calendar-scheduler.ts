/**
 * EconomicCalendarScheduler
 *
 * Automatically fires Web Push reminders before high- and medium-impact
 * economic calendar events, for ALL users who have an active push subscription.
 *
 * Reminder schedule
 * ─────────────────
 *   High impact   → 3 h · 1 h · 30 min · 15 min · 5 min before the event
 *   Medium impact → 1 h · 15 min · 5 min before the event
 *   Low impact    → disabled
 *
 * Design notes
 * ────────────
 * • Economic events are global — everyone who subscribed gets the same reminder.
 * • An in-memory Set tracks already-scheduled reminder keys so hourly refreshes
 *   never double-schedule the same (event × offset) pair.
 * • Timers are unref()'d so they don't prevent process exit.
 * • TTL passed to the push service equals the reminder offset so the push
 *   broker does not redeliver a stale "in 5 min" notification hours later.
 * • After a process restart the scheduler re-fetches the calendar. Past
 *   events have delay ≤ 0 and are silently skipped; future ones are
 *   re-scheduled correctly.
 */
import { db, pushSubscriptionsTable } from "@workspace/db";
import { logger } from "./logger.js";
import { sendNotifPush } from "./push-service.js";
import { fetchCalendarEvents, type CalendarEvent } from "./ff-calendar.js";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Reminder offsets (minutes before event) per impact level. */
const REMINDER_OFFSETS: Record<"high" | "medium", number[]> = {
  high:   [180, 60, 30, 15, 5],
  medium: [60, 15, 5],
};

/** How often to refresh the calendar and check for new events to schedule. */
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ─── Notification copy ────────────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿",
};

const IMPACT_EMOJI: Record<"high" | "medium", string> = {
  high:   "🔴",
  medium: "🟠",
};

function formatOffset(minutes: number): string {
  if (minutes >= 60) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return `${minutes} min`;
}

function buildNotification(
  evt: CalendarEvent,
  offsetMin: number,
): { title: string; body: string } {
  const flag = CURRENCY_FLAGS[evt.currency] ?? "";
  const impactEmoji = IMPACT_EMOJI[evt.impact as "high" | "medium"];
  const timeLabel = formatOffset(offsetMin);

  const title = `${flag} ${evt.currency} ${impactEmoji} ${evt.event}`;

  const parts: string[] = [`Starting in ${timeLabel}`];
  if (evt.forecast !== null) {
    parts.push(`Forecast: ${evt.forecast}${evt.unit}`);
  }
  if (evt.previous !== null) {
    parts.push(`Previous: ${evt.previous}${evt.unit}`);
  }
  const body = parts.join(" · ");

  return { title, body };
}

// ─── Scheduler class ──────────────────────────────────────────────────────────

class EconomicCalendarScheduler {
  /**
   * Keys of reminders already scheduled in this process run.
   * Format: `<event-id>:<offset-minutes>`
   * Prevents the hourly refresh from adding duplicate timers.
   */
  private readonly scheduled = new Set<string>();

  /** Active timer handles, keyed by the same key as `scheduled`. */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.scheduleUpcoming();

    this.refreshTimer = setInterval(() => {
      void this.scheduleUpcoming();
    }, REFRESH_INTERVAL_MS);

    // Don't let the interval keep the process alive artificially
    if (this.refreshTimer.unref) this.refreshTimer.unref();
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.scheduled.clear();
  }

  // ── Scheduling ──────────────────────────────────────────────────────────────

  private async scheduleUpcoming(): Promise<void> {
    let events: CalendarEvent[];
    try {
      events = await fetchCalendarEvents();
    } catch (err) {
      logger.warn({ err }, "[calendar-scheduler] Failed to fetch calendar events");
      return;
    }

    const now = Date.now();
    let newCount = 0;

    for (const evt of events) {
      if (evt.impact === "low") continue;

      const offsets = REMINDER_OFFSETS[evt.impact as "high" | "medium"];
      const eventMs = new Date(evt.time).getTime();
      if (isNaN(eventMs)) continue;

      for (const offsetMin of offsets) {
        const reminderMs = eventMs - offsetMin * 60_000;
        const delayMs = reminderMs - now;

        // Skip past reminders
        if (delayMs <= 0) continue;

        const key = `${evt.id}:${offsetMin}`;
        if (this.scheduled.has(key)) continue;

        this.scheduled.add(key);
        newCount++;

        const timer = setTimeout(() => {
          this.timers.delete(key);
          void this.fireReminder(evt, offsetMin);
        }, delayMs);

        if (timer.unref) timer.unref();
        this.timers.set(key, timer);
      }
    }

    if (newCount > 0) {
      logger.info(
        { newCount, totalPending: this.timers.size },
        "[calendar-scheduler] Reminders scheduled",
      );
    }
  }

  // ── Delivery ────────────────────────────────────────────────────────────────

  private async fireReminder(evt: CalendarEvent, offsetMin: number): Promise<void> {
    try {
      // Get every distinct user who has at least one active push subscription.
      const rows = await db
        .selectDistinct({ userId: pushSubscriptionsTable.userId })
        .from(pushSubscriptionsTable);

      if (rows.length === 0) return;

      const { title, body } = buildNotification(evt, offsetMin);

      // TTL = the reminder offset in seconds so the broker does not deliver a
      // "5-min" notification an hour late when a device was temporarily offline.
      const ttlSeconds = offsetMin * 60;

      await Promise.all(
        rows.map(({ userId }) =>
          sendNotifPush(userId, {
            title,
            body,
            type: "economic-calendar",
            url: "/economic-calendar",
          }, ttlSeconds),
        ),
      );

      logger.info(
        {
          currency: evt.currency,
          event: evt.event,
          impact: evt.impact,
          offsetMin,
          users: rows.length,
        },
        "[calendar-scheduler] Reminder sent",
      );
    } catch (err) {
      logger.error(
        { err, event: evt.event, offsetMin },
        "[calendar-scheduler] Failed to deliver reminder",
      );
    }
  }
}

export const economicCalendarScheduler = new EconomicCalendarScheduler();
