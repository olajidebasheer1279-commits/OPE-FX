import { useState, useEffect, useCallback } from "react";
import { format, addDays, startOfWeek, endOfWeek, isToday, isTomorrow, parseISO } from "date-fns";
import {
  CalendarDays,
  AlertCircle,
  Bell,
  BellOff,
  RefreshCcw,
  ChevronDown,
  Clock,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/apiFetch";

// ─── Types ────────────────────────────────────────────────────────────────────

type Impact = "high" | "medium" | "low";
type Currency = "USD" | "EUR" | "GBP" | "JPY" | "AUD" | "CAD" | "CHF" | "NZD";
type TimePeriod = "today" | "tomorrow" | "week";

interface CalendarEvent {
  id: string;
  time: string;
  country: string;
  currency: Currency;
  event: string;
  impact: Impact;
  forecast: number | null;
  previous: number | null;
  actual: number | null;
  unit: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<Currency, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CHF: "🇨🇭",
  NZD: "🇳🇿",
};

const CURRENCY_COLORS: Record<Currency, string> = {
  USD: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  EUR: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  GBP: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  JPY: "bg-red-500/15 text-red-400 border-red-500/30",
  AUD: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  CAD: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  CHF: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  NZD: "bg-teal-500/15 text-teal-400 border-teal-500/30",
};

const IMPACT_CONFIG: Record<Impact, { label: string; dot: string; badge: string }> = {
  high: {
    label: "High",
    dot: "bg-red-500",
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  medium: {
    label: "Medium",
    dot: "bg-orange-400",
    badge: "bg-orange-400/15 text-orange-400 border-orange-400/30",
  },
  low: {
    label: "Low",
    dot: "bg-yellow-400",
    badge: "bg-yellow-400/15 text-yellow-500 border-yellow-400/30",
  },
};

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateRange(period: TimePeriod): { from: string; to: string } {
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const now = new Date();
  if (period === "today") return { from: fmt(now), to: fmt(now) };
  if (period === "tomorrow") {
    const t = addDays(now, 1);
    return { from: fmt(t), to: fmt(t) };
  }
  // This week: Mon–Sun
  return {
    from: fmt(startOfWeek(now, { weekStartsOn: 1 })),
    to: fmt(endOfWeek(now, { weekStartsOn: 1 })),
  };
}

function formatEventTime(isoTime: string): string {
  try {
    return format(parseISO(isoTime), "HH:mm");
  } catch {
    return isoTime;
  }
}

function formatEventDate(isoTime: string): string {
  try {
    const d = parseISO(isoTime);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEE, MMM d");
  } catch {
    return "";
  }
}

function getDateKey(isoTime: string): string {
  try {
    return format(parseISO(isoTime), "yyyy-MM-dd");
  } catch {
    return isoTime.slice(0, 10);
  }
}

function formatValue(v: number | null, unit: string): string {
  if (v === null || v === undefined) return "—";
  const formatted = Number.isInteger(v) ? v.toString() : v.toFixed(2);
  return unit ? `${formatted}${unit}` : formatted;
}

// ─── Countdown component ──────────────────────────────────────────────────────

function Countdown({ isoTime }: { isoTime: string }) {
  const getRemaining = useCallback(() => {
    try {
      const diff = parseISO(isoTime).getTime() - Date.now();
      if (diff <= 0) return null;
      const totalSecs = Math.floor(diff / 1000);
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
      return `${s}s`;
    } catch {
      return null;
    }
  }, [isoTime]);

  const [remaining, setRemaining] = useState<string | null>(getRemaining);

  useEffect(() => {
    if (remaining === null) return;
    const tick = setInterval(() => {
      const r = getRemaining();
      setRemaining(r);
      if (r === null) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [isoTime, getRemaining, remaining]);

  if (remaining === null) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono tabular-nums">
      <Clock className="h-3 w-3 shrink-0" />
      {remaining}
    </span>
  );
}

// ─── Event card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: CalendarEvent }) {
  const [reminded, setReminded] = useState(false);
  const impact = IMPACT_CONFIG[event.impact];
  const hasActual = event.actual !== null;

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-border/80 hover:bg-card/80">
      {/* Impact dot */}
      <div className="mt-1.5 shrink-0">
        <span
          className={`block h-2.5 w-2.5 rounded-full ${impact.dot}`}
          title={`${impact.label} impact`}
        />
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-2">
        {/* Top row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Currency badge */}
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${CURRENCY_COLORS[event.currency]}`}
          >
            <span>{CURRENCY_FLAGS[event.currency]}</span>
            {event.currency}
          </span>

          {/* Event name */}
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {event.event}
          </span>

          {/* Impact badge — hidden on very small screens, shown md+ */}
          <span
            className={`hidden shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium sm:inline-flex ${impact.badge}`}
          >
            {impact.label}
          </span>
        </div>

        {/* Values row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            Forecast:{" "}
            <span className="font-mono text-foreground">
              {formatValue(event.forecast, event.unit)}
            </span>
          </span>
          <span className="text-muted-foreground">
            Previous:{" "}
            <span className="font-mono text-foreground">
              {formatValue(event.previous, event.unit)}
            </span>
          </span>
          {hasActual && (
            <span className="text-muted-foreground">
              Actual:{" "}
              <span
                className={`font-mono font-semibold ${
                  event.actual !== null && event.forecast !== null
                    ? event.actual > event.forecast
                      ? "text-emerald-400"
                      : event.actual < event.forecast
                        ? "text-red-400"
                        : "text-foreground"
                    : "text-foreground"
                }`}
              >
                {formatValue(event.actual, event.unit)}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Right column: time, countdown, reminder */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="font-mono text-sm font-medium text-foreground tabular-nums">
          {formatEventTime(event.time)}
        </span>
        <Countdown isoTime={event.time} />
        <Button
          size="icon"
          variant="ghost"
          className={`h-7 w-7 transition-colors ${
            reminded ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          title={reminded ? "Reminder set (UI only)" : "Set reminder (UI only)"}
          onClick={() => setReminded((v) => !v)}
        >
          {reminded ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Date group header ────────────────────────────────────────────────────────

function DateGroupHeader({ dateKey }: { dateKey: string }) {
  const label = (() => {
    try {
      const d = parseISO(dateKey);
      if (isToday(d)) return `Today · ${format(d, "EEEE, MMMM d")}`;
      if (isTomorrow(d)) return `Tomorrow · ${format(d, "EEEE, MMMM d")}`;
      return format(d, "EEEE, MMMM d");
    } catch {
      return dateKey;
    }
  })();

  return (
    <div className="flex items-center gap-3 pb-1 pt-3">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function EventSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <Skeleton className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-14 rounded-md" />
          <Skeleton className="h-5 w-48 rounded-md" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Skeleton className="h-5 w-12 rounded" />
        <Skeleton className="h-4 w-16 rounded" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EconomicCalendar() {
  const [period, setPeriod] = useState<TimePeriod>("today");
  const [impactFilter, setImpactFilter] = useState<"all" | Impact>("all");
  const [currencyFilter, setCurrencyFilter] = useState<"all" | Currency>("all");

  const dateRange = getDateRange(period);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["economic-calendar", dateRange.from, dateRange.to],
    queryFn: async () => {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await apiFetch(
        `${BASE}/api/economic-calendar?from=${dateRange.from}&to=${dateRange.to}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ events: CalendarEvent[] }>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — calendar data changes infrequently
    refetchOnWindowFocus: false,
  });

  const allEvents = data?.events ?? [];

  // Apply filters
  const events = allEvents.filter((e) => {
    if (impactFilter !== "all" && e.impact !== impactFilter) return false;
    if (currencyFilter !== "all" && e.currency !== currencyFilter) return false;
    return true;
  });

  // Group by date
  const grouped = events.reduce<Record<string, CalendarEvent[]>>((acc, evt) => {
    const key = getDateKey(evt.time);
    if (!acc[key]) acc[key] = [];
    acc[key].push(evt);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped).sort();

  const highCount = allEvents.filter((e) => e.impact === "high").length;
  const mediumCount = allEvents.filter((e) => e.impact === "medium").length;

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-b border-border px-4 pb-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold text-foreground">Economic Calendar</h1>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Upcoming macroeconomic events for major FX currencies
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary chips */}
        {!isLoading && !isError && allEvents.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
              {allEvents.length} events
            </span>
            {highCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {highCount} high impact
              </span>
            )}
            {mediumCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-0.5 text-xs text-orange-400">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                {mediumCount} medium impact
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Time period */}
          <Tabs
            value={period}
            onValueChange={(v) => setPeriod(v as TimePeriod)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="today" className="px-3 text-xs">
                Today
              </TabsTrigger>
              <TabsTrigger value="tomorrow" className="px-3 text-xs">
                Tomorrow
              </TabsTrigger>
              <TabsTrigger value="week" className="px-3 text-xs">
                This Week
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Impact filter */}
          <Select
            value={impactFilter}
            onValueChange={(v) => setImpactFilter(v as "all" | Impact)}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Impact" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Impact</SelectItem>
              <SelectItem value="high" className="text-xs">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  High
                </span>
              </SelectItem>
              <SelectItem value="medium" className="text-xs">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-400" />
                  Medium
                </span>
              </SelectItem>
              <SelectItem value="low" className="text-xs">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-yellow-400" />
                  Low
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Currency filter */}
          <Select
            value={currencyFilter}
            onValueChange={(v) => setCurrencyFilter(v as "all" | Currency)}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Currencies</SelectItem>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">
                  <span className="flex items-center gap-2">
                    {CURRENCY_FLAGS[c]} {c}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        {/* Loading state */}
        {isLoading && (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <EventSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="mt-8 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <p className="font-medium text-foreground">Failed to load calendar</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(error as Error)?.message ?? "An unexpected error occurred"}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        )}

        {/* Empty state — no data from API */}
        {!isLoading && !isError && allEvents.length === 0 && (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground/30" />
            <p className="font-medium text-foreground">No events scheduled</p>
            <p className="text-sm text-muted-foreground">
              There are no economic events for{" "}
              {period === "today"
                ? "today"
                : period === "tomorrow"
                  ? "tomorrow"
                  : "this week"}
              .
            </p>
          </div>
        )}

        {/* Empty state — filters hide all events */}
        {!isLoading && !isError && allEvents.length > 0 && events.length === 0 && (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <ChevronDown className="h-10 w-10 text-muted-foreground/30" />
            <p className="font-medium text-foreground">No matching events</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting the impact or currency filters.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setImpactFilter("all");
                setCurrencyFilter("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        )}

        {/* Event groups */}
        {!isLoading && !isError && dateKeys.length > 0 && (
          <div className="space-y-1">
            {dateKeys.map((dateKey) => (
              <div key={dateKey}>
                <DateGroupHeader dateKey={dateKey} />
                <div className="space-y-1.5">
                  {grouped[dateKey].map((evt) => (
                    <EventCard key={evt.id} event={evt} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
