import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Info,
  TrendingUp,
  TrendingDown,
  Zap,
  BookOpen,
  Target,
  Shield,
  Brain,
  Clock,
  Flame,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useGetAssistantSummary } from "@workspace/api-client-react";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);

const formatPercent = (value: number | null | undefined) =>
  value !== null && value !== undefined ? `${value.toFixed(1)}%` : "—";

type WarningLevel = "info" | "warning" | "danger";

const warningConfig: Record<WarningLevel, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  warning: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  danger: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
};

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">{label}</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color.replace("text-", "bg-").replace("primary", "primary/10")}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistSection({ items }: { items: Array<{ id: number; text: string; category: string; isChecked: boolean }> }) {
  const [checked, setChecked] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.isChecked]))
  );

  const categories = Array.from(new Set(items.map((i) => i.category)));
  const totalChecked = Object.values(checked).filter(Boolean).length;
  const progress = items.length > 0 ? (totalChecked / items.length) * 100 : 0;

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-primary" />
            Pre-Trade Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-3">
            <CheckCircle className="w-12 h-12 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground text-sm">No trading rules set up yet.</p>
            <Button variant="outline" size="sm" asChild>
              <a href="/rules">Set Up Rules</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-primary" />
              Pre-Trade Checklist
            </CardTitle>
            <CardDescription>Check all boxes before entering any trade</CardDescription>
          </div>
          <Badge variant={progress === 100 ? "default" : "outline"} className={progress === 100 ? "bg-green-600" : ""}>
            {totalChecked}/{items.length}
          </Badge>
        </div>
        <Progress value={progress} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.map((cat) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat}</p>
            <div className="space-y-2">
              {items.filter((i) => i.category === cat).map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    checked[item.id]
                      ? "bg-green-500/5 border-green-500/20"
                      : "bg-muted/20 border-border hover:bg-muted/40"
                  }`}
                  onClick={() => setChecked((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                >
                  <Checkbox
                    checked={checked[item.id] ?? false}
                    onCheckedChange={(v) => setChecked((prev) => ({ ...prev, [item.id]: !!v }))}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className={`text-sm ${checked[item.id] ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Assistant() {
  const { data, isLoading, refetch, isFetching } = useGetAssistantSummary();

  if (isLoading) {
    return (
      <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-5xl mx-auto">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const stats = data?.recentStats;
  const winRate = stats?.winRate ?? null;
  const avgRR = stats?.avgRR ?? null;
  const streak = stats?.currentStreak;
  const pnl = stats?.totalPnl ?? 0;

  const streakColor =
    streak?.type === "win" ? "text-green-400" : streak?.type === "loss" ? "text-red-400" : "text-muted-foreground";

  const streakLabel =
    streak && streak.count > 0
      ? `${streak.count} ${streak.type === "win" ? "🟢" : streak.type === "loss" ? "🔴" : ""} streak`
      : "No streak";

  const readyForTrade = (data?.warnings ?? []).filter((w) => w.level === "danger").length === 0;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="w-8 h-8 text-primary" />
            Trading Assistant
          </h2>
          <p className="text-muted-foreground">Your pre-trade coach and performance watchdog.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2 shrink-0">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Trade Readiness Banner */}
      <Card className={`border-2 ${readyForTrade ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            {readyForTrade ? (
              <CheckCircle className="w-7 h-7 text-green-500" />
            ) : (
              <AlertTriangle className="w-7 h-7 text-red-500" />
            )}
            <div>
              <p className={`font-semibold text-lg ${readyForTrade ? "text-green-400" : "text-red-400"}`}>
                {readyForTrade ? "SYSTEM: READY TO TRADE" : "SYSTEM: REVIEW WARNINGS FIRST"}
              </p>
              <p className="text-sm text-muted-foreground">
                {readyForTrade
                  ? "No critical issues detected. Check the pre-trade checklist before entering."
                  : `${(data?.warnings ?? []).filter((w) => w.level === "danger").length} critical warning(s) require your attention.`}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={readyForTrade ? "text-green-400 border-green-400" : "text-red-400 border-red-400"}>
            {data?.recentStats.trades ?? 0} trades analyzed
          </Badge>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Win Rate"
          value={formatPercent(winRate)}
          sub={`${stats?.wins ?? 0}W / ${stats?.losses ?? 0}L / ${stats?.breakeven ?? 0}BE`}
          icon={TrendingUp}
          color={winRate !== null && winRate >= 50 ? "text-green-400" : "text-red-400"}
        />
        <StatCard
          label="Avg R:R"
          value={avgRR !== null ? `${avgRR.toFixed(2)}:1` : "—"}
          sub="Risk:Reward"
          icon={Target}
          color={avgRR !== null && avgRR >= 1.5 ? "text-green-400" : avgRR !== null ? "text-yellow-400" : "text-muted-foreground"}
        />
        <StatCard
          label="Current Streak"
          value={streakLabel}
          sub={streak?.type === "none" || !streak ? "" : `Last ${streak.count} trades`}
          icon={Flame}
          color={streakColor}
        />
        <StatCard
          label="Recent P&L"
          value={formatCurrency(pnl)}
          sub={`Last ${stats?.trades ?? 0} closed trades`}
          icon={pnl >= 0 ? TrendingUp : TrendingDown}
          color={pnl >= 0 ? "text-green-400" : "text-red-400"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Checklist + Daily Plan */}
        <div className="lg:col-span-2 space-y-6">
          <ChecklistSection items={data?.checklist ?? []} />

          {/* Daily Trading Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Today's Trading Plan
              </CardTitle>
              <CardDescription>
                {data?.hasJournalToday ? "From your journal entry today" : "No journal entry for today"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data?.dailyPlan ? (
                <div className="bg-muted/20 rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{data.dailyPlan}</p>
                </div>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    {data?.hasJournalToday
                      ? "No trading plan written in today's journal."
                      : "Write your trading plan in today's journal before the session."}
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/journal">
                      Open Journal <ChevronRight className="w-4 h-4 ml-1" />
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Warnings + Suggestions */}
        <div className="space-y-6">
          {/* Warnings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Smart Warnings
              </CardTitle>
              <CardDescription>Based on recent trade patterns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.warnings ?? []).length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-green-400 font-medium">All clear</p>
                  <p className="text-xs text-muted-foreground">No issues detected</p>
                </div>
              ) : (
                (data?.warnings ?? []).map((w, i) => {
                  const cfg = warningConfig[w.level as WarningLevel] ?? warningConfig.info;
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className={`rounded-lg border p-3 ${cfg.bg} ${cfg.border}`}>
                      <div className="flex gap-2">
                        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.color}`} />
                        <p className="text-xs leading-relaxed">{w.message}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Suggestions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Coach's Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.suggestions ?? []).map((s, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                  <p className="text-muted-foreground leading-relaxed">{s}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Risk reminders */}
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-yellow-400">
                <Clock className="w-4 h-4" />
                Psychology Reminders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                "Do not revenge trade after a loss",
                "Stick to your trading plan — no impulse entries",
                "Only trade during your peak session hours",
                "Close your charts if emotional",
                "One bad trade does not define your career",
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1 h-1 rounded-full bg-yellow-400 shrink-0" />
                  {r}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
