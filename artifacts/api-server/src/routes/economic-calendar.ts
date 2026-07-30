/**
 * Economic Calendar route
 *
 * GET /economic-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Data source: Financial Modeling Prep (FMP) — free tier, 250 req/day.
 * Endpoint: https://financialmodelingprep.com/api/v3/economic_calendar
 *
 * Normalises the response to a consistent shape and filters to the
 * 8 G10 FX currencies relevant to forex traders.
 *
 * Previous providers attempted:
 *   - Finnhub /calendar/economic  → 403 (paid plan only)
 *   - Twelve Data /economic_calendar → 404 (endpoint does not exist)
 */
import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

// FMP returns country name strings; map those to G10 currency codes.
// FMP also returns a `currency` field directly on each event — prefer
// that; fall back to country lookup if currency is absent or empty.
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  "United States": "USD",
  US: "USD",
  "Euro Zone": "EUR",
  "European Union": "EUR",
  EU: "EUR",
  Germany: "EUR",
  France: "EUR",
  Italy: "EUR",
  Spain: "EUR",
  "United Kingdom": "GBP",
  UK: "GBP",
  GB: "GBP",
  Japan: "JPY",
  JP: "JPY",
  Australia: "AUD",
  AU: "AUD",
  Canada: "CAD",
  CA: "CAD",
  Switzerland: "CHF",
  CH: "CHF",
  "New Zealand": "NZD",
  NZ: "NZD",
};

// FMP impact values: "High", "Medium", "Low" (already normalised strings)
function normaliseImpact(raw: string | undefined | null): "low" | "medium" | "high" {
  switch ((raw ?? "").toLowerCase()) {
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
}

const TRACKED_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"]);

/**
 * Parse a value that FMP may return as number, numeric string, or null.
 * Returns null for missing/invalid/empty/"N/A"/"—" values.
 */
function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[%,\s]/g, "");
    if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "n/a") return null;
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : null;
  }
  return null;
}

interface FmpEvent {
  date?: string;       // "2026-07-30 08:30:00"
  country?: string;
  event?: string;
  currency?: string;
  previous?: number | string | null;
  estimate?: number | string | null;  // FMP uses "estimate" for forecast
  actual?: number | string | null;
  change?: number | string | null;
  changePercentage?: number | string | null;
  unit?: string;
  impact?: string;    // "High" | "Medium" | "Low"
}

router.get("/economic-calendar", requireAuth, async (req, res): Promise<void> => {
  const apiKey = process.env["FMP_API_KEY"];
  if (!apiKey) {
    res.status(503).json({
      error: "Economic calendar unavailable: FMP_API_KEY not configured",
      provider: "fmp",
    });
    return;
  }

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
    const url =
      `https://financialmodelingprep.com/api/v3/economic_calendar` +
      `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&apikey=${apiKey}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      res.status(502).json({
        error: `FMP returned ${response.status}`,
        detail: text.slice(0, 300),
      });
      return;
    }

    const raw = (await response.json()) as FmpEvent[] | { "Error Message"?: string };

    // FMP returns an error object when the key is invalid
    if (!Array.isArray(raw)) {
      const msg = (raw as { "Error Message"?: string })["Error Message"] ?? "Unknown FMP error";
      res.status(502).json({ error: `FMP error: ${msg}` });
      return;
    }

    const events = raw
      .map((evt, idx) => {
        // Resolve currency: prefer the FMP `currency` field; fall back to country lookup
        const fmpCurrency = (evt.currency ?? "").toUpperCase();
        const country = evt.country ?? "";
        const currency =
          (TRACKED_CURRENCIES.has(fmpCurrency) ? fmpCurrency : null) ??
          COUNTRY_TO_CURRENCY[country] ??
          null;

        // Build a stable id from the event metadata
        const id = `${idx}-${(evt.date ?? "").replace(/\s/g, "T")}-${country}-${evt.event ?? ""}`
          .replace(/[^a-zA-Z0-9-_]/g, "-")
          .replace(/-{2,}/g, "-");

        // FMP date format: "2026-07-30 08:30:00" → convert to ISO 8601
        const isoTime = (evt.date ?? "").replace(" ", "T");

        return {
          id,
          time: isoTime,
          country,
          currency,
          event: evt.event ?? "",
          impact: normaliseImpact(evt.impact),
          forecast: parseNumber(evt.estimate),
          previous: parseNumber(evt.previous),
          actual: parseNumber(evt.actual),
          unit: evt.unit ?? "",
        };
      })
      .filter((e) => e.currency !== null && TRACKED_CURRENCIES.has(e.currency as string))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    res.json({ events });
  } catch (err) {
    console.error("[economic-calendar] fetch error:", err);
    res.status(502).json({ error: "Failed to fetch economic calendar data" });
  }
});

export default router;
