import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { AlertCircle, Check, Loader2, RefreshCcw } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RatingSlider } from "@/components/journal/RatingSlider";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useListJournals,
  useGetJournal,
  useUpsertJournal,
  getListJournalsQueryKey,
  type JournalInput,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

function toDateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

type EntryState = Required<Omit<JournalInput, "isDraft">>;

const emptyEntry: EntryState = {
  mood: null,
  confidence: null,
  discipline: null,
  fear: null,
  greed: null,
  focus: null,
  sleep: null,
  tradingPlan: "",
  notes: "",
  mistakes: "",
  lessons: "",
  tomorrowGoal: "",
};

export default function Journal() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date());
  const dateKey = toDateKey(selectedDate);
  const monthKey = format(visibleMonth, "yyyy-MM");

  const { data: monthEntries } = useListJournals({ month: monthKey });
  const { data: entry, isLoading, error, refetch } = useGetJournal(dateKey);

  const [form, setForm] = useState<EntryState>(emptyEntry);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const debouncedForm = useDebounce(form, 800);
  const hydratedRef = useRef(false);
  const lastSavedKeyRef = useRef<string>("");

  useEffect(() => {
    hydratedRef.current = false;
    if (entry) {
      setForm({
        mood: entry.mood,
        confidence: entry.confidence,
        discipline: entry.discipline,
        fear: entry.fear,
        greed: entry.greed,
        focus: entry.focus,
        sleep: entry.sleep,
        tradingPlan: entry.tradingPlan ?? "",
        notes: entry.notes ?? "",
        mistakes: entry.mistakes ?? "",
        lessons: entry.lessons ?? "",
        tomorrowGoal: entry.tomorrowGoal ?? "",
      });
    } else {
      setForm(emptyEntry);
    }
    lastSavedKeyRef.current = JSON.stringify(entry ?? emptyEntry);
    // Mark hydrated on next tick so the debounce-triggered save effect skips this reset.
    const t = setTimeout(() => { hydratedRef.current = true; }, 0);
    return () => clearTimeout(t);
  }, [dateKey, entry]);

  const upsertMutation = useUpsertJournal({
    mutation: {
      onSuccess: () => {
        setSaveState("saved");
        queryClient.invalidateQueries({ queryKey: getListJournalsQueryKey({ month: monthKey }) });
      },
      onError: () => setSaveState("idle"),
    },
  });

  useEffect(() => {
    if (!hydratedRef.current) return;
    const serialized = JSON.stringify(debouncedForm);
    if (serialized === lastSavedKeyRef.current) return;
    lastSavedKeyRef.current = serialized;
    setSaveState("saving");
    upsertMutation.mutate({ date: dateKey, data: { ...debouncedForm, isDraft: true } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedForm, dateKey]);

  const daysWithEntries = useMemo(
    () => new Set((monthEntries ?? []).map((e) => e.date)),
    [monthEntries],
  );

  const set = <K extends keyof EntryState>(key: K, value: EntryState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Trading Journal</h1>
          <p className="text-sm text-muted-foreground">Daily reflections, psychology, and lessons learned.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-h-[20px]">
          {saveState === "saving" && (
            <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</span>
          )}
          {saveState === "saved" && (
            <span className="flex items-center gap-1.5 text-emerald-500"><Check className="h-3.5 w-3.5" /> Saved</span>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-6">
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm h-fit">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => d && setSelectedDate(d)}
            onMonthChange={setVisibleMonth}
            month={visibleMonth}
            className="w-full"
            modifiers={{ hasEntry: (d) => daysWithEntries.has(toDateKey(d)) }}
            modifiersClassNames={{ hasEntry: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary" }}
          />
          <p className="text-xs text-muted-foreground mt-3 px-1">
            {daysWithEntries.size} entries logged in {format(visibleMonth, "MMMM yyyy")}
          </p>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold tracking-tight">{format(selectedDate, "EEEE, MMMM d, yyyy")}</h2>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-[30vh] text-center border border-border bg-card/50 rounded-xl p-8">
              <AlertCircle className="h-10 w-10 text-destructive mb-4" />
              <p className="text-muted-foreground mb-4">Failed to load this entry.</p>
              <Button onClick={() => refetch()} className="gap-2"><RefreshCcw className="h-4 w-4" /> Retry</Button>
            </div>
          ) : (
            <>
              <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
                <h3 className="font-semibold tracking-tight mb-4">Psychology & Wellbeing</h3>
                <div className="grid sm:grid-cols-2 gap-6">
                  <RatingSlider label="Mood" value={form.mood} onChange={(v) => set("mood", v)} />
                  <RatingSlider label="Confidence" value={form.confidence} onChange={(v) => set("confidence", v)} />
                  <RatingSlider label="Discipline" value={form.discipline} onChange={(v) => set("discipline", v)} />
                  <RatingSlider label="Fear" value={form.fear} onChange={(v) => set("fear", v)} />
                  <RatingSlider label="Greed" value={form.greed} onChange={(v) => set("greed", v)} />
                  <RatingSlider label="Focus" value={form.focus} onChange={(v) => set("focus", v)} />
                  <RatingSlider label="Sleep Quality" value={form.sleep} onChange={(v) => set("sleep", v)} />
                </div>
              </div>

              <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
                <h3 className="font-semibold tracking-tight">Reflections</h3>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Trading Plan</label>
                  <Textarea rows={2} placeholder="What was today's plan?" value={form.tradingPlan ?? ""} onChange={(e) => set("tradingPlan", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Notes</label>
                  <Textarea rows={3} placeholder="Market observations, context..." value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Mistakes</label>
                  <Textarea rows={2} placeholder="What went wrong?" value={form.mistakes ?? ""} onChange={(e) => set("mistakes", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Lessons</label>
                  <Textarea rows={2} placeholder="What did you learn?" value={form.lessons ?? ""} onChange={(e) => set("lessons", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Tomorrow's Goal</label>
                  <Textarea rows={2} placeholder="What will you focus on next session?" value={form.tomorrowGoal ?? ""} onChange={(e) => set("tomorrowGoal", e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
