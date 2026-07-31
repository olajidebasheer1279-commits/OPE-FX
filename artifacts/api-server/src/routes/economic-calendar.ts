/**
 * Economic Calendar route
 *
 * GET /economic-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Delegates all fetching and parsing to the shared lib/ff-calendar module,
 * which is also used by the EconomicCalendarScheduler for push reminders.
 */
import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { fetchCalendarEvents } from "../lib/ff-calendar.js";

const router: IRouter = Router();

router.get("/economic-calendar", requireAuth, async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;

  if (!from || !to) {
    res.status(400).json({ error: "Query parameters 'from' and 'to' are required (YYYY-MM-DD)" });
    return;
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    res.status(400).json({ error: "Date parameters must be in YYYY-MM-DD format" });
    return;
  }

  try {
    const events = await fetchCalendarEvents({ from, to });
    res.json({ events });
  } catch (err) {
    console.error("[economic-calendar] error:", err);
    res.status(502).json({ error: "Failed to fetch economic calendar data" });
  }
});

export default router;
