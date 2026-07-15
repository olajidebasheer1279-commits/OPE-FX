import { useState } from "react";
import { format } from "date-fns";
import { AlertCircle, Activity, Clock, Download, Target, TrendingDown, TrendingUp, Calendar as CalendarIcon, Award, ChevronRight, Zap } from "lucide-react";
import { 
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip,
  Legend, RadialBarChart, RadialBar, PolarAngleAxis
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetAnalyticsSummary, getGetAnalyticsSummaryQueryKey, useGetOprScore, getGetOprScoreQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);

const formatPercent = (value: number) => 
  new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1 }).format(value / 100);

const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border p-3 rounded-lg shadow-xl">
        <p className="font-medium text-foreground mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground capitalize">{entry.name}:</span>
            <span className="font-medium text-foreground">
              {formatter ? formatter(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// OPR Gauge Component
function OprGauge({ score, grade }: { score: number; grade: string }) {
  const normalizedScore = Math.max(0, Math.min(100, score));
  
  const getColor = (s: number) => {
    if (s >= 90) return "hsl(var(--chart-2))"; // Emerald
    if (s >= 75) return "hsl(var(--primary))"; // Blue
    if (s >= 60) return "hsl(var(--chart-4))"; // Yellow
    return "hsl(var(--chart-3))"; // Red
  };

  const data = [{ name: "OPR", value: normalizedScore, fill: getColor(normalizedScore) }];
  const circleSize = 250;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div style={{ width: circleSize, height: circleSize / 2 + 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart 
            cx="50%" 
            cy="100%" 
            innerRadius="70%" 
            outerRadius="100%" 
            barSize={20} 
            data={data} 
            startAngle={180} 
            endAngle={0}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: "var(--muted)" }}
              dataKey="value"
              cornerRadius={10}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute flex flex-col items-center justify-center bottom-4">
        <div className="text-5xl font-bold tracking-tighter" style={{ color: getColor(normalizedScore) }}>
          {normalizedScore}
        </div>
        <Badge variant="outline" className="mt-1 font-mono text-sm px-2 bg-background/50 backdrop-blur">
          Grade {grade}
        </Badge>
      </div>
    </div>
  );
}

function AnalyticsTab() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: analytics, isLoading, isError } = useGetAnalyticsSummary(
    { 
      dateFrom: dateFrom || undefined, 
      dateTo: dateTo || undefined 
    },
    { query: { queryKey: getGetAnalyticsSummaryQueryKey({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }) } }
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-[120px] rounded-xl" />
        <Skeleton className="h-[120px] rounded-xl" />
        <Skeleton className="h-[120px] rounded-xl" />
        <Skeleton className="h-[400px] md:col-span-3 rounded-xl" />
      </div>
    );
  }

  if (isError || !analytics) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-8 text-center">
        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
        <p className="text-destructive font-medium">Failed to load analytics data.</p>
      </div>
    );
  }

  const { 
    totalTrades, closedTrades, pairPerformance, directionBreakdown, 
    dayOfWeekBreakdown, avgHoldingTimeMinutes, currentStreak, 
    longestWinStreak, longestLossStreak, equityGrowth, monthlyPnl, riskDistribution 
  } = analytics;

  const hasLong = directionBreakdown.long.trades > 0;
  const hasShort = directionBreakdown.short.trades > 0;
  
  const directionData = [
    ...(hasLong ? [{ name: "Long", value: directionBreakdown.long.trades, winRate: directionBreakdown.long.winRate }] : []),
    ...(hasShort ? [{ name: "Short", value: directionBreakdown.short.trades, winRate: directionBreakdown.short.winRate }] : []),
  ];

  const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">Trading Edge Analysis</h3>
          <p className="text-sm text-muted-foreground">Statistical breakdown of your strategy.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input 
            type="date" 
            value={dateFrom} 
            onChange={(e) => setDateFrom(e.target.value)} 
            className="w-[140px] h-9 text-sm"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input 
            type="date" 
            value={dateTo} 
            onChange={(e) => setDateTo(e.target.value)} 
            className="w-[140px] h-9 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Total Trades</p>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{closedTrades}</div>
            <p className="text-xs text-muted-foreground mt-1">Closed positions</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Avg Holding Time</p>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">
              {avgHoldingTimeMinutes ? `${Math.round(avgHoldingTimeMinutes / 60)}h ${Math.round(avgHoldingTimeMinutes % 60)}m` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per winning trade</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Current Streak</p>
              {currentStreak.type === "win" ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </div>
            <div className="text-2xl font-bold flex items-baseline gap-2">
              {currentStreak.count}
              <span className={`text-sm font-normal uppercase tracking-wider ${currentStreak.type === "win" ? "text-emerald-500" : "text-destructive"}`}>
                {currentStreak.type}s
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active sequence</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Max Streaks</p>
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold flex items-baseline gap-2">
              <span className="text-emerald-500">{longestWinStreak}</span>
              <span className="text-muted-foreground text-sm font-normal">/</span>
              <span className="text-destructive">{longestLossStreak}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Wins / Losses max</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Equity Growth</CardTitle>
            <CardDescription>Cumulative P&L over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {equityGrowth.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityGrowth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickFormatter={(val) => format(new Date(val), 'MMM d')}
                      minTickGap={30}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickFormatter={(val) => `$${val}`}
                    />
                    <RechartsTooltip content={<CustomTooltip formatter={formatCurrency} />} />
                    <Area 
                      type="monotone" 
                      dataKey="balance" 
                      name="Balance"
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorBalance)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No equity data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              {monthlyPnl.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyPnl} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={(val) => `$${val}`} />
                    <RechartsTooltip content={<CustomTooltip formatter={formatCurrency} />} />
                    <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
                      {monthlyPnl.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-3))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No monthly data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pair Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              {pairPerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pairPerformance} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={(val) => `$${val}`} />
                    <YAxis dataKey="symbol" type="category" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--foreground))', fontSize: 12, fontWeight: 500 }} />
                    <RechartsTooltip content={<CustomTooltip formatter={formatCurrency} />} />
                    <Bar dataKey="totalPnl" name="Total P&L" radius={[0, 4, 4, 0]}>
                      {pairPerformance.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.totalPnl >= 0 ? "hsl(var(--chart-1))" : "hsl(var(--chart-5))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No pair data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Day of Week Edge</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              {dayOfWeekBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayOfWeekBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="dayOfWeek" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={(val) => `${val}%`} />
                    <RechartsTooltip content={<CustomTooltip formatter={(v: number) => `${v.toFixed(1)}%`} />} />
                    <Bar dataKey="winRate" name="Win Rate" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))">
                      {dayOfWeekBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fillOpacity={0.6 + (entry.winRate / 100) * 0.4} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No day data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:col-span-2 lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Direction</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="h-[160px] w-full">
                {directionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={directionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {directionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.name === 'Long' ? "hsl(var(--chart-1))" : "hsl(var(--chart-4))"} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data</div>
                )}
              </div>
              <div className="flex justify-center gap-4 mt-2">
                {directionData.map(d => (
                  <div key={d.name} className="flex flex-col items-center">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.name === 'Long' ? "hsl(var(--chart-1))" : "hsl(var(--chart-4))" }} />
                      {d.name}
                    </div>
                    <div className="font-semibold text-sm">{d.winRate.toFixed(1)}% WR</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Risk Distribution</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="h-[160px] w-full">
                {riskDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="count"
                        nameKey="riskPercent"
                        stroke="none"
                      >
                        {riskDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data</div>
                )}
              </div>
              <div className="flex justify-center gap-4 mt-2">
                <span className="text-xs text-muted-foreground">% of balance risked per trade</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function OprTab() {
  const [period, setPeriod] = useState<string>("all-time");

  const { data: oprData, isLoading, isError } = useGetOprScore(
    { period: period === "all-time" ? undefined : period },
    { query: { queryKey: getGetOprScoreQueryKey({ period: period === "all-time" ? undefined : period }) } }
  );

  const getScoreColorClass = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 90) return "text-emerald-500";
    if (score >= 75) return "text-primary";
    if (score >= 60) return "text-yellow-500";
    return "text-destructive";
  };

  const getScoreBgClass = (score: number | null) => {
    if (score === null) return "bg-muted/50 border-muted";
    if (score >= 90) return "bg-emerald-500/10 border-emerald-500/20";
    if (score >= 75) return "bg-primary/10 border-primary/20";
    if (score >= 60) return "bg-yellow-500/10 border-yellow-500/20";
    return "bg-destructive/10 border-destructive/20";
  };

  // Generate last 6 months for selector
  const months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return {
      value: format(d, 'yyyy-MM'),
      label: format(d, 'MMMM yyyy')
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">OPE Performance Rating</h3>
          <p className="text-sm text-muted-foreground">Holistic evaluation of your trading discipline and edge.</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-time">All-Time</SelectItem>
            {months.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-[300px] w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-[140px] rounded-xl" />
            <Skeleton className="h-[140px] rounded-xl" />
            <Skeleton className="h-[140px] rounded-xl" />
          </div>
        </div>
      ) : isError || !oprData ? (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-8 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
          <p className="text-destructive font-medium">Failed to load OPR score.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 border-primary/20 bg-gradient-to-b from-card to-primary/5">
              <CardContent className="pt-6 flex flex-col items-center">
                <OprGauge score={oprData.score} grade={oprData.grade} />
                <div className="mt-8 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">Based on analysis of</p>
                  <p className="text-xl font-semibold">{oprData.tradesAnalyzed} trades</p>
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(oprData.breakdown).map(([key, item]) => (
                <div 
                  key={key} 
                  className={`rounded-xl border p-4 flex flex-col justify-between ${getScoreBgClass(item.score)}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className={`font-bold text-lg ${getScoreColorClass(item.score)}`}>
                      {item.score !== null ? `${Math.round(item.score)}/100` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-end justify-between mt-4">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block">Raw Value</span>
                      <span className="text-sm font-medium">
                        {item.value !== null ? 
                          (key === 'winRate' ? `${item.value.toFixed(1)}%` : 
                           key === 'riskReward' ? `1:${item.value.toFixed(2)}` : 
                           `${item.value}`) 
                        : '-'}
                      </span>
                    </div>
                    <div className="text-right space-y-1">
                      <span className="text-xs text-muted-foreground block">Weight</span>
                      <Badge variant="outline" className="text-xs font-normal border-current opacity-70">
                        {Math.round(item.weight * 100)}%
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {oprData.suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  Actionable Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {oprData.suggestions.map((suggestion, idx) => (
                    <li key={idx} className="flex items-start gap-3 bg-muted/30 p-3 rounded-lg border border-border/50">
                      <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm leading-relaxed">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function Analytics() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-7xl mx-auto print:max-w-none print:p-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between print:hidden">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics & OPR</h2>
          <p className="text-muted-foreground">Deep statistical insights and performance ratings.</p>
        </div>
        <Button variant="outline" onClick={handlePrint}>
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      <div className="hidden print:block mb-8 pb-4 border-b border-border">
        <h1 className="text-3xl font-bold font-serif">OPE-FX Performance Report</h1>
        <p className="text-muted-foreground mt-2">Generated on {format(new Date(), 'MMMM d, yyyy')}</p>
      </div>

      <Tabs defaultValue="analytics" className="w-full">
        <TabsList className="grid w-full max-w-[400px] grid-cols-2 h-10 print:hidden mb-6">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="opr">OPR Score</TabsTrigger>
        </TabsList>
        
        <TabsContent value="analytics" className="mt-0 print:block">
          <AnalyticsTab />
        </TabsContent>
        
        <TabsContent value="opr" className="mt-0 print:hidden">
          <OprTab />
        </TabsContent>
      </Tabs>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white; color: black; }
          .dark { background: white; color: black; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .border { border-color: #e5e7eb !important; }
          .bg-card { background: white !important; border: 1px solid #e5e7eb !important; box-shadow: none !important; break-inside: avoid; }
          .text-muted-foreground { color: #6b7280 !important; }
          .text-foreground { color: #111827 !important; }
          /* Allow background colors to print for charts */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}} />
    </div>
  );
}
