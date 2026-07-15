import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Plus, BookOpen, Target, Settings, ArrowUpRight, ArrowDownRight, RefreshCcw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { format } from "date-fns";

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);

const formatPercent = (value: number) => 
  new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1 }).format(value / 100);

function StatCard({ title, value, subtext, trend, isCurrency = false }: { title: string, value: number, subtext?: string, trend?: 'up' | 'down' | 'neutral', isCurrency?: boolean }) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  
  let colorClass = "text-foreground";
  if (trend === 'up' || (trend === undefined && isPositive)) colorClass = "text-emerald-500";
  else if (trend === 'down' || (trend === undefined && isNegative)) colorClass = "text-destructive";

  return (
    <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
      <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-semibold tracking-tight ${colorClass} font-mono`}>
          {isCurrency ? formatCurrency(value) : value.toString()}
        </span>
      </div>
      {subtext && <p className="text-xs text-muted-foreground mt-2">{subtext}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error, refetch } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32 hidden sm:block" />
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-[350px] rounded-xl" />
          <Skeleton className="h-[350px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center border border-border bg-card/50 rounded-xl p-8">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
        <p className="text-muted-foreground mb-6 max-w-md">There was a problem retrieving your trading data. The server might be unreachable or returning an error.</p>
        <Button onClick={() => refetch()} className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          Retry Connection
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const {
    currentBalance, todayPnl, weeklyPnl, monthlyPnl, winRate, avgRiskReward,
    totalTrades, recentTrades, equityCurve, outcomeBreakdown, goalProgress
  } = data;

  const pieData = [
    { name: 'Wins', value: outcomeBreakdown.wins, color: 'hsl(var(--chart-2))' },
    { name: 'Losses', value: outcomeBreakdown.losses, color: 'hsl(var(--chart-3))' },
    { name: 'Breakeven', value: outcomeBreakdown.breakeven, color: 'hsl(var(--chart-4))' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Command Center</h1>
          <p className="text-sm text-muted-foreground">Session active. Reviewing performance metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" className="hidden md:flex border-border">
            <Link href="/journal">New Entry</Link>
          </Button>
          <Button asChild className="hidden sm:flex gap-2 bg-primary text-primary-foreground">
            <Link href="/trades/new">
              <Plus className="h-4 w-4" /> Log Trade
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Current Balance" value={currentBalance} isCurrency trend="neutral" />
        <StatCard title="Today's P/L" value={todayPnl} isCurrency subtext="Intraday variance" />
        <StatCard title="Weekly P/L" value={weeklyPnl} isCurrency subtext="WTD net" />
        <StatCard title="Monthly P/L" value={monthlyPnl} isCurrency subtext="MTD net" />
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Win Rate</h3>
          <span className="text-2xl font-semibold tracking-tight font-mono">{formatPercent(winRate)}</span>
          <p className="text-xs text-muted-foreground mt-2">{totalTrades} total trades</p>
        </div>
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Avg R:R</h3>
          <span className="text-2xl font-semibold tracking-tight font-mono">{avgRiskReward.toFixed(2)}R</span>
          <p className="text-xs text-muted-foreground mt-2">Expectancy profile</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold tracking-tight text-lg">Equity Curve</h3>
            <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded">ALL TIME</span>
          </div>
          <div className="h-[280px] w-full">
            {equityCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} 
                    tickFormatter={(val) => format(new Date(val), 'MMM d')}
                    minTickGap={30}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}
                    tickFormatter={(val) => `$${val}`}
                    domain={['auto', 'auto']}
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontFamily: 'monospace' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                    formatter={(value: number) => [formatCurrency(value), 'Balance']}
                    labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="balance" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorBalance)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg">
                No equity data available
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm flex-1">
            <h3 className="font-semibold tracking-tight text-lg mb-6">Outcome Distribution</h3>
            {totalTrades > 0 ? (
              <div className="flex items-center gap-6">
                <div className="h-[140px] w-[140px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        itemStyle={{ color: 'hsl(var(--foreground))', fontFamily: 'monospace' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3">
                  {pieData.map(item => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-mono font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[140px] w-full flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg">
                No trades logged
              </div>
            )}
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold tracking-tight text-lg">Milestone Progress</h3>
              <Target className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mb-2 flex justify-between items-end">
              <span className="text-2xl font-semibold font-mono tracking-tight">{formatCurrency(currentBalance)}</span>
              <span className="text-sm text-muted-foreground font-mono">Target: {formatCurrency(goalProgress.targetBalance)}</span>
            </div>
            <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden mb-3 border border-border">
              <div 
                className="h-full bg-primary transition-all duration-1000 ease-out relative"
                style={{ width: `${Math.min(Math.max(goalProgress.progressPercent, 0), 100)}%` }}
              >
                <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]"></div>
              </div>
            </div>
            <div className="flex justify-between text-xs font-mono text-muted-foreground">
              <span>0%</span>
              <span>{goalProgress.progressPercent.toFixed(1)}% Completed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions & Recent Trades */}
      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 p-6 rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold tracking-tight text-lg">Recent Executions</h3>
            <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary/90 h-8">
              <Link href="/trades">View Ledger</Link>
            </Button>
          </div>
          
          {recentTrades.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-lg bg-secondary/20">
              <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-foreground font-medium mb-1">No executions found</p>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">Your trade ledger is empty. Log your first execution to start tracking your performance.</p>
              <Button asChild variant="outline" className="border-border">
                <Link href="/trades/new">Log First Trade</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground uppercase text-[10px] tracking-wider font-mono">
                    <th className="pb-3 font-medium">Symbol</th>
                    <th className="pb-3 font-medium">Dir</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Entry</th>
                    <th className="pb-3 font-medium text-right">Exit</th>
                    <th className="pb-3 font-medium text-right">R:R</th>
                    <th className="pb-3 font-medium text-right">Net P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-mono">
                  {recentTrades.map((trade) => (
                    <tr key={trade.id} className="group hover:bg-secondary/30 transition-colors">
                      <td className="py-3 font-medium text-foreground">{trade.symbol}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                          trade.direction === 'long' 
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                            : 'bg-destructive/10 text-destructive border border-destructive/20'
                        }`}>
                          {trade.direction === 'long' ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                          {trade.direction}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-medium tracking-wider ${
                          trade.status === 'open' ? 'bg-primary/20 text-primary border border-primary/30 animate-pulse' : 'text-muted-foreground'
                        }`}>
                          {trade.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-muted-foreground">{trade.entryPrice.toFixed(5)}</td>
                      <td className="py-3 text-right text-muted-foreground">{trade.exitPrice ? trade.exitPrice.toFixed(5) : '-'}</td>
                      <td className="py-3 text-right">{trade.riskRewardRatio ? `${trade.riskRewardRatio.toFixed(2)}R` : '-'}</td>
                      <td className={`py-3 text-right font-semibold ${
                        trade.pnl 
                          ? trade.pnl > 0 ? 'text-emerald-500' : trade.pnl < 0 ? 'text-destructive' : 'text-muted-foreground'
                          : 'text-muted-foreground'
                      }`}>
                        {trade.pnl ? formatCurrency(trade.pnl) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="font-semibold tracking-tight text-lg mb-2">Quick Access</h3>
          <Button asChild variant="outline" className="justify-start h-12 bg-card border-border hover:bg-secondary hover:text-foreground">
            <Link href="/trades/new">
              <Plus className="mr-3 h-4 w-4 text-primary" />
              New Trade Execution
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start h-12 bg-card border-border hover:bg-secondary hover:text-foreground">
            <Link href="/journal">
              <FileText className="mr-3 h-4 w-4 text-primary" />
              Daily Journal Entry
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start h-12 bg-card border-border hover:bg-secondary hover:text-foreground">
            <Link href="/rules">
              <Target className="mr-3 h-4 w-4 text-primary" />
              Review Playbook
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start h-12 bg-card border-border hover:bg-secondary hover:text-foreground">
            <Link href="/reviews">
              <Settings className="mr-3 h-4 w-4 text-primary" />
              Weekly Review
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
