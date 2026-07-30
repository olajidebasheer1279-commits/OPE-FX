/**
 * Economic Calendar route
 *
 * GET /economic-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Fetches from Finnhub's /api/v1/calendar/economic endpoint, normalises
 * the response to a consistent shape, and filters to the 8 G10 currencies
 * relevant to FX traders.
 */
import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

// Finnhub returns 2-letter country codes → G10 currency codes
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD",
  EU: "EUR",
  EMU: "EUR",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  GB: "GBP",
  UK: "GBP",
  JP: "JPY",
  AU: "AUD",
  CA: "CAD",
  CH: "CHF",
  NZ: "NZD",
};

// Finnhub impact values: "1" = low, "2" = medium, "3" = high
// Also accept string labels in case the API changes
const IMPACT_MAP: Record<string, "low" | "medium" | "high"> = {
  "1": "low",
  "2": "medium",
  "3": "high",
  low: "low",
  medium: "medium",
  high: "high",
};

const TRACKED_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"]);

interface FinnhubEvent {
  time?: string;
  country?: string;
  event?: string;
  impact?: string;
  estimate?: number | null;
  prev?: number | null;
  actual?: number | null;
  unit?: string;
}

router.get("/economic-calendar", requireAuth, async (req, res): Promise<void> => {
  const apiKey = process.env["FINNHUB_API_KEY"];
  if (!apiKey) {
    res.status(503).json({ error: "Economic calendar unavailable: FINNHUB_API_KEY not set" });
    return;
  }

  const { from, to } = req.query as Record<string, string>;

  if (!from || !to) {
    res.status(400).json({ error: "Query parameters 'from' and 'to' are required (YYYY-MM-DD)" });
    return;
  }

  // Validate date format
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    res.status(400).json({ error: "Date parameters must be in YYYY-MM-DD format" });
    return;
  }

  try {
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      res.status(502).json({ error: `Finnhub returned ${response.status}`, detail: text });
      return;
    }

    const data = (await response.json()) as { economicCalendar?: FinnhubEvent[] };
    const events = data.economicCalendar ?? [];

    const transformed = events
      .map((evt, idx) => {
        const country = evt.country ?? "";
        const currency = COUNTRY_TO_CURRENCY[country] ?? null;
        return {
          id: `${idx}-${evt.time ?? ""}-${country}-${evt.event ?? ""}`.replace(/[^a-zA-Z0-9-_]/g, "-"),
          time: evt.time ?? "",
          country,
          currency,
          event: evt.event ?? "",
          impact: IMPACT_MAP[evt.impact ?? ""] ?? "low",
          forecast: evt.estimate ?? null,
          previous: evt.prev ?? null,
          actual: evt.actual ?? null,
          unit: evt.unit ?? "",
        };
      })
      .filter((e) => e.currency !== null && TRACKED_CURRENCIES.has(e.currency as string))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    res.json({ events: transformed });
  } catch (err) {
    console.error("[economic-calendar] fetch error:", err);
    res.status(502).json({ error: "Failed to fetch economic calendar data" });
  }
});

export default router;
