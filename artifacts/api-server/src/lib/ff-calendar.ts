/**
 * ForexFactory CDN — shared fetch + parse logic.
 *
 * Used by both the /economic-calendar HTTP route and the
 * EconomicCalendarScheduler that fires push reminders.
 *
 * The CDN publishes two feeds (no API key required):
 *   https://nfs.faireconomy.media/ff_calendar_thisweek.json
 *   https://nfs.faireconomy.media/ff_calendar_nextweek.json   (404 until mid-week)
 */

// ─── Raw FF shape ─────────────────────────────────────────────────────────────

export interface FFRawEvent {
  title?: string;
  country?: string; // FF names this "country" but it IS the currency code: "USD", "EUR", …
  date?: string;    // ISO 8601 with TZ offset e.g. "2026-07-30T08:30:00-04:00"
  impact?: string;  // "High" | "Medium" | "Low"
  forecast?: string;
  previous?: string;
  actual?: string;
}

// ─── Normalised shape ─────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  time: string;             // full ISO 8601 string — use new Date(time) for JS Date
  calendarDate: string;     // YYYY-MM-DD extracted from the ISO string (ET date)
  country: string;          // same as currency (FF convention)
  currency: string;         // "USD" | "EUR" | "GBP" | "JPY" | "AUD" | "CAD" | "CHF" | "NZD"
  event: string;
  impact: "low" | "medium" | "high";
  forecast: number | null;
  previous: number | null;
  actual: number | null;
  unit: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const TRACKED_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD",
]);

// ─── In-memory cache (15-minute TTL) ─────────────────────────────────────────

interface CacheSlot {
  data: FFRawEvent[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const _cache: { thisWeek: CacheSlot | null; nextWeek: CacheSlot | null } = {
  thisWeek: null,
  nextWeek: null,
};

export async function fetchFFWeek(slot: "thisWeek" | "nextWeek"): Promise<FFRawEvent[]> {
  const now = Date.now();
  const cached = _cache[slot];
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  const suffix = slot === "thisWeek" ? "thisweek" : "nextweek";
  const url = `https://nfs.faireconomy.media/ff_calendar_${suffix}.json`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      // Next-week data is not always published (404 until mid-week) — return empty
      if (slot === "nextWeek" && res.status === 404) return [];
      console.warn(`[ff-calendar] ${slot} feed returned ${res.status}`);
      return cached?.data ?? [];
    }

    const data = (await res.json()) as FFRawEvent[];
    _cache[slot] = { data, fetchedAt: now };
    return data;
  } catch (err) {
    console.warn(`[ff-calendar] ${slot} fetch error:`, err);
    return cached?.data ?? [];
  }
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/**
 * Parse "3.4%", "256.8K", "-0.1", "" → { value, unit }.
 */
export function parseFFValue(raw: string | undefined | null): { value: number | null; unit: string } {
  if (!raw || raw.trim() === "" || raw.trim() === "-") return { value: null, unit: "" };
  const s = raw.trim();
  const m = s.match(/^([+-]?[\d,]+(?:\.\d+)?)([^0-9,.\-]*)$/);
  if (!m) return { value: null, unit: "" };
  const n = parseFloat(m[1]!.replace(/,/g, ""));
  return { value: isFinite(n) ? n : null, unit: (m[2] ?? "").trim() };
}

function resolveUnit(evt: FFRawEvent): string {
  for (const raw of [evt.forecast, evt.previous, evt.actual]) {
    const { unit } = parseFFValue(raw);
    if (unit) return unit;
  }
  return "";
}

function normaliseImpact(raw: string | undefined | null): "low" | "medium" | "high" {
  switch ((raw ?? "").toLowerCase()) {
    case "high":   return "high";
    case "medium": return "medium";
    default:       return "low";
  }
}

// ─── Main transform ───────────────────────────────────────────────────────────

/**
 * Convert raw FF events to normalised CalendarEvent objects,
 * filtering to the 8 tracked G10 currencies.
 */
export function parseFFEvents(raw: FFRawEvent[]): CalendarEvent[] {
  return raw
    .map((evt, idx) => {
      const currency = (evt.country ?? "").toUpperCase();
      const isoDate = evt.date ?? "";
      const calendarDate = isoDate.slice(0, 10); // first 10 chars = YYYY-MM-DD (ET date)
      const unit = resolveUnit(evt);
      const id = `${idx}-${calendarDate}-${currency}-${(evt.title ?? "").replace(/[^a-zA-Z0-9]/g, "-")}`;
      return {
        id,
        time: isoDate,
        calendarDate,
        country: currency,
        currency,
        event: evt.title ?? "",
        impact: normaliseImpact(evt.impact),
        forecast: parseFFValue(evt.forecast).value,
        previous: parseFFValue(evt.previous).value,
        actual: parseFFValue(evt.actual).value,
        unit,
      };
    })
    .filter((e) => TRACKED_CURRENCIES.has(e.currency));
}

/**
 * Fetch and parse both week feeds, merge, de-duplicate, and sort by time.
 * Optionally filter to a date range (inclusive YYYY-MM-DD strings).
 */
export async function fetchCalendarEvents(opts?: {
  from?: string;
  to?: string;
}): Promise<CalendarEvent[]> {
  const [thisWeek, nextWeek] = await Promise.all([
    fetchFFWeek("thisWeek"),
    fetchFFWeek("nextWeek"),
  ]);

  const parsed = parseFFEvents([...thisWeek, ...nextWeek]);

  const seen = new Set<string>();
  const deduped = parsed.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  const filtered =
    opts?.from || opts?.to
      ? deduped.filter((e) => {
          const d = e.calendarDate;
          if (opts.from && d < opts.from) return false;
          if (opts.to && d > opts.to) return false;
          return true;
        })
      : deduped;

  return filtered.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}
