/**
 * Economic Calendar route
 *
 * GET /economic-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Data source: ForexFactory CDN (nfs.faireconomy.media) — no API key required.
 * The CDN re-publishes ForexFactory calendar data as JSON. It is the gold
 * standard economic calendar for FX traders, covering all G10 currencies with
 * High / Medium / Low impact, forecast, previous, and actual values.
 *
 * Fetches the current-week and (optionally) next-week feeds; responses are
 * cached in memory for 15 minutes to avoid hammering the CDN.
 *
 * Previous providers attempted:
 *   - Finnhub /calendar/economic      → 403 (paid plan only)
 *   - Twelve Data /economic_calendar   → 404 (endpoint does not exist)
 *   - FMP /api/v3,v4/economic_calendar → 403 legacy (accounts after Aug 2025)
 */
import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface FFEvent {
  title?: string;
  country?: string; // ForexFactory names this "country" but the value IS the currency code: "USD", "EUR", …
  date?: string;    // ISO 8601 with timezone offset, e.g. "2026-07-26T19:50:00-04:00"
  impact?: string;  // "High" | "Medium" | "Low"
  forecast?: string;
  previous?: string;
  actual?: string;
}

interface CacheSlot {
  data: FFEvent[];
  fetchedAt: number;
}

// ─── In-memory cache (15-minute TTL) ─────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache: { thisWeek: CacheSlot | null; nextWeek: CacheSlot | null } = {
  thisWeek: null,
  nextWeek: null,
};

async function fetchFFWeek(slot: "thisWeek" | "nextWeek"): Promise<FFEvent[]> {
  const now = Date.now();
  const cached = cache[slot];
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const suffix = slot === "thisWeek" ? "thisweek" : "nextweek";
  const url = `https://nfs.faireconomy.media/ff_calendar_${suffix}.json`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      // Next-week data is not always published — silently return empty
      if (slot === "nextWeek" && res.status === 404) return [];
      console.warn(`[economic-calendar] FF CDN ${slot} returned ${res.status}`);
      return cached?.data ?? [];
    }

    const data = (await res.json()) as FFEvent[];
    cache[slot] = { data, fetchedAt: now };
    return data;
  } catch (err) {
    console.warn(`[economic-calendar] FF CDN ${slot} fetch error:`, err);
    return cached?.data ?? [];
  }
}

// ─── Value parsing ────────────────────────────────────────────────────────────

/**
 * Parse a ForexFactory value string like "3.4%", "256.8K", "-0.1", "".
 * Returns { value: number | null, unit: string }.
 */
function parseFFValue(raw: string | undefined | null): { value: number | null; unit: string } {
  if (!raw || raw.trim() === "" || raw.trim() === "-") return { value: null, unit: "" };
  const s = raw.trim();
  // Match: optional sign, integer/decimal, optional trailing unit chars (%, K, M, B, etc.)
  const m = s.match(/^([+-]?[\d,]+(?:\.\d+)?)([^0-9,.\-]*)$/);
  if (!m) return { value: null, unit: "" };
  const n = parseFloat(m[1]!.replace(/,/g, ""));
  const unit = (m[2] ?? "").trim();
  return { value: isFinite(n) ? n : null, unit };
}

/**
 * Derive the display unit from the event's values.
 * Uses the first non-empty value among forecast, previous, actual.
 */
function resolveUnit(evt: FFEvent): string {
  for (const raw of [evt.forecast, evt.previous, evt.actual]) {
    const { unit } = parseFFValue(raw);
    if (unit) return unit;
  }
  return "";
}

// ─── Impact normalisation ─────────────────────────────────────────────────────

function normaliseImpact(raw: string | undefined | null): "low" | "medium" | "high" {
  switch ((raw ?? "").toLowerCase()) {
    case "high": return "high";
    case "medium": return "medium";
    default: return "low";
  }
}

// ─── Currency filter ──────────────────────────────────────────────────────────

const TRACKED_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"]);

// ─── Route ────────────────────────────────────────────────────────────────────

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
    // Always fetch the current week; also attempt next week so "tomorrow"
    // works at week boundaries (gracefully handles 404 for next week).
    const [thisWeek, nextWeek] = await Promise.all([
      fetchFFWeek("thisWeek"),
      fetchFFWeek("nextWeek"),
    ]);

    const allRaw = [...thisWeek, ...nextWeek];

    const events = allRaw
      .map((evt, idx) => {
        const currency = (evt.country ?? "").toUpperCase();

        // Extract calendar date from the ISO string ("2026-07-26T19:50:00-04:00" → "2026-07-26")
        // ForexFactory dates are in US Eastern time; we keep the local date as-is
        // because that is the conventionally displayed date in forex calendars.
        const isoDate = evt.date ?? "";
        const calendarDate = isoDate.slice(0, 10); // "YYYY-MM-DD"
        const isoTime = isoDate; // full ISO string for countdown timers

        const unit = resolveUnit(evt);
        const forecast = parseFFValue(evt.forecast).value;
        const previous = parseFFValue(evt.previous).value;
        const actual = parseFFValue(evt.actual).value;

        const id = `${idx}-${calendarDate}-${currency}-${(evt.title ?? "").replace(/[^a-zA-Z0-9]/g, "-")}`;

        return {
          id,
          time: isoTime,
          country: currency, // FF uses currency code in "country" field
          currency,
          event: evt.title ?? "",
          impact: normaliseImpact(evt.impact),
          forecast,
          previous,
          actual,
          unit,
        };
      })
      // Filter: only tracked G10 currencies
      .filter((e) => TRACKED_CURRENCIES.has(e.currency))
      // Filter: within requested date range
      .filter((e) => {
        const d = e.time.slice(0, 10);
        return d >= from && d <= to;
      })
      // De-duplicate (thisWeek and nextWeek can overlap on boundary weeks)
      .filter((e, idx, arr) => arr.findIndex((x) => x.id === e.id) === idx)
      // Sort chronologically
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    res.json({ events });
  } catch (err) {
    console.error("[economic-calendar] error:", err);
    res.status(502).json({ error: "Failed to fetch economic calendar data" });
  }
});

export default router;
