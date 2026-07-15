import { and, eq, gte, lte, isNotNull } from "drizzle-orm";
import {
  db,
  accountsTable,
  tradesTable,
  journalsTable,
  rulesTable,
  type Trade,
} from "@workspace/db";

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function computeStreaks(trades: Trade[]) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl !== null);
  let currentType: "win" | "loss" | "none" = "none";
  let currentCount = 0;
  let longestWin = 0;
  let longestLoss = 0;

  for (const t of closed) {
    const pnl = toNumber(t.pnl);
    const type: "win" | "loss" = pnl > 0 ? "win" : "loss";
    if (type === currentType) {
      currentCount++;
    } else {
      currentType = type;
      currentCount = 1;
    }
    if (currentType === "win") longestWin = Math.max(longestWin, currentCount);
    else longestLoss = Math.max(longestLoss, currentCount);
  }

  return {
    current: { type: currentType, count: currentCount },
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
  };
}

export async function getAnalyticsSummaryForUser(
  userId: string,
  dateFrom?: string,
  dateTo?: string,
) {
  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId))
    .orderBy(accountsTable.createdAt)
    .limit(1);

  const conditions = [eq(tradesTable.userId, userId)];
  if (dateFrom) conditions.push(gte(tradesTable.openedAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(tradesTable.openedAt, new Date(dateTo)));

  const trades = await db
    .select()
    .from(tradesTable)
    .where(and(...conditions))
    .orderBy(tradesTable.openedAt);

  const closed = trades.filter((t) => t.status === "closed" && t.pnl !== null);

  // --- Pair performance ---
  const pairMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const t of closed) {
    const sym = t.symbol;
    const entry = pairMap.get(sym) ?? { trades: 0, wins: 0, pnl: 0 };
    entry.trades++;
    if (toNumber(t.pnl) > 0) entry.wins++;
    entry.pnl += toNumber(t.pnl);
    pairMap.set(sym, entry);
  }
  const pairPerformance = Array.from(pairMap.entries())
    .map(([symbol, v]) => ({
      symbol,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
      totalPnl: v.pnl,
      avgPnl: v.trades > 0 ? v.pnl / v.trades : 0,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl);

  // --- Direction breakdown ---
  const dirStats = { long: { trades: 0, wins: 0, pnl: 0 }, short: { trades: 0, wins: 0, pnl: 0 } };
  for (const t of closed) {
    const dir = t.direction as "long" | "short";
    if (dir !== "long" && dir !== "short") continue;
    dirStats[dir].trades++;
    if (toNumber(t.pnl) > 0) dirStats[dir].wins++;
    dirStats[dir].pnl += toNumber(t.pnl);
  }
  const directionBreakdown = {
    long: {
      trades: dirStats.long.trades,
      winRate: dirStats.long.trades > 0 ? (dirStats.long.wins / dirStats.long.trades) * 100 : 0,
      totalPnl: dirStats.long.pnl,
    },
    short: {
      trades: dirStats.short.trades,
      winRate: dirStats.short.trades > 0 ? (dirStats.short.wins / dirStats.short.trades) * 100 : 0,
      totalPnl: dirStats.short.pnl,
    },
  };

  // --- Timeframe breakdown ---
  const tfMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const t of closed) {
    const tf = t.timeframe ?? "Unknown";
    const entry = tfMap.get(tf) ?? { trades: 0, wins: 0, pnl: 0 };
    entry.trades++;
    if (toNumber(t.pnl) > 0) entry.wins++;
    entry.pnl += toNumber(t.pnl);
    tfMap.set(tf, entry);
  }
  const timeframeBreakdown = Array.from(tfMap.entries())
    .map(([timeframe, v]) => ({
      timeframe,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
      totalPnl: v.pnl,
    }))
    .sort((a, b) => b.trades - a.trades);

  // --- Day of week breakdown ---
  const dowMap = new Map<number, { trades: number; wins: number; pnl: number }>();
  for (const t of closed) {
    const day = (t.openedAt as Date).getDay();
    const entry = dowMap.get(day) ?? { trades: 0, wins: 0, pnl: 0 };
    entry.trades++;
    if (toNumber(t.pnl) > 0) entry.wins++;
    entry.pnl += toNumber(t.pnl);
    dowMap.set(day, entry);
  }
  const dayOfWeekBreakdown = Array.from(dowMap.entries())
    .map(([day, v]) => ({
      dayOfWeek: DAY_NAMES[day],
      dayIndex: day,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
      totalPnl: v.pnl,
    }))
    .sort((a, b) => a.dayIndex - b.dayIndex);

  // --- Avg holding time ---
  const withDuration = closed.filter((t) => t.closedAt !== null);
  const avgHoldingTimeMinutes =
    withDuration.length > 0
      ? withDuration.reduce((sum, t) => {
          const ms =
            (t.closedAt as Date).getTime() - (t.openedAt as Date).getTime();
          return sum + ms / 60000;
        }, 0) / withDuration.length
      : null;

  // --- Streaks ---
  const streakInfo = computeStreaks(trades);

  // --- Equity growth (time series) ---
  const startingBalance = account ? toNumber(account.startingBalance) : 10000;
  let running = startingBalance;
  const equityGrowth = [
    {
      date: account ? account.createdAt.toISOString() : new Date().toISOString(),
      balance: running,
      pnl: 0,
    },
    ...closed.map((t) => {
      const pnl = toNumber(t.pnl);
      running += pnl;
      return {
        date: ((t.closedAt ?? t.openedAt) as Date).toISOString(),
        balance: running,
        pnl,
      };
    }),
  ];

  // --- Monthly PnL ---
  const monthMap = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const t of closed) {
    const d = (t.closedAt ?? t.openedAt) as Date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthMap.get(key) ?? { pnl: 0, trades: 0, wins: 0 };
    entry.trades++;
    entry.pnl += toNumber(t.pnl);
    if (toNumber(t.pnl) > 0) entry.wins++;
    monthMap.set(key, entry);
  }
  const monthlyPnl = Array.from(monthMap.entries())
    .map(([month, v]) => ({
      month,
      pnl: v.pnl,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // --- Risk distribution ---
  const riskBuckets = [
    { label: "< 0.5%", min: 0, max: 0.5 },
    { label: "0.5 – 1%", min: 0.5, max: 1 },
    { label: "1 – 2%", min: 1, max: 2 },
    { label: "> 2%", min: 2, max: Infinity },
  ];
  const riskMap = new Map<string, number>(riskBuckets.map((b) => [b.label, 0]));
  for (const t of trades) {
    if (t.riskPercent === null) continue;
    const rp = toNumber(t.riskPercent);
    const bucket = riskBuckets.find((b) => rp >= b.min && rp < b.max);
    if (bucket) riskMap.set(bucket.label, (riskMap.get(bucket.label) ?? 0) + 1);
  }
  const riskDistribution = riskBuckets.map((b) => ({
    riskPercent: b.label,
    count: riskMap.get(b.label) ?? 0,
  }));

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    pairPerformance,
    directionBreakdown,
    timeframeBreakdown,
    dayOfWeekBreakdown,
    avgHoldingTimeMinutes,
    currentStreak: streakInfo.current,
    longestWinStreak: streakInfo.longestWinStreak,
    longestLossStreak: streakInfo.longestLossStreak,
    equityGrowth,
    monthlyPnl,
    riskDistribution,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
  };
}

function scoreWinRate(winRate: number): number {
  if (winRate >= 70) return 100;
  if (winRate >= 60) return 85;
  if (winRate >= 50) return 70;
  if (winRate >= 40) return 50;
  if (winRate >= 30) return 30;
  return 10;
}

function scoreRiskReward(avgRR: number): number {
  if (avgRR >= 2.0) return 100;
  if (avgRR >= 1.5) return 85;
  if (avgRR >= 1.0) return 65;
  if (avgRR >= 0.75) return 45;
  return 20;
}

function getGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 75) return "B+";
  if (score >= 65) return "B";
  if (score >= 55) return "C+";
  if (score >= 45) return "C";
  if (score >= 35) return "D";
  return "F";
}

export async function getOprScoreForUser(userId: string, period?: string) {
  // Determine date range
  const now = new Date();
  const periodStr = period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let fromDate: Date;
  let toDate: Date;

  if (period === "all-time") {
    fromDate = new Date(0);
    toDate = new Date();
  } else {
    const [year, month] = periodStr.split("-").map(Number);
    fromDate = new Date(year, month - 1, 1);
    toDate = new Date(year, month, 0, 23, 59, 59, 999);
  }

  // Trades in period
  const trades = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.userId, userId),
        gte(tradesTable.openedAt, fromDate),
        lte(tradesTable.openedAt, toDate),
      ),
    );

  const closed = trades.filter((t) => t.status === "closed" && t.pnl !== null);

  // 1. Win rate (weight 25)
  const winRateValue = closed.length > 0
    ? (closed.filter((t) => toNumber(t.pnl) > 0).length / closed.length) * 100
    : null;
  const winRateScore = winRateValue !== null ? scoreWinRate(winRateValue) : 0;

  // 2. Risk/Reward (weight 25)
  const rrTrades = closed.filter((t) => t.riskRewardRatio !== null);
  const avgRR = rrTrades.length > 0
    ? rrTrades.reduce((s, t) => s + toNumber(t.riskRewardRatio), 0) / rrTrades.length
    : null;
  const rrScore = avgRR !== null ? scoreRiskReward(avgRR) : 0;

  // 3. Rule compliance (weight 15) — active rules that are completed
  const rules = await db.select().from(rulesTable).where(eq(rulesTable.userId, userId));
  const activeRules = rules.filter((r) => r.isActive);
  const completedRules = activeRules.filter((r) => r.completed);
  const ruleComplianceValue = activeRules.length > 0
    ? (completedRules.length / activeRules.length) * 100
    : null;
  const ruleScore = ruleComplianceValue !== null ? ruleComplianceValue : 0;

  // 4. Journal completion (weight 15) — journal entries / trading days in period
  const journals = await db
    .select()
    .from(journalsTable)
    .where(
      and(
        eq(journalsTable.userId, userId),
        gte(journalsTable.date, fromDate.toISOString().slice(0, 10)),
        lte(journalsTable.date, toDate.toISOString().slice(0, 10)),
      ),
    );

  // Count weekdays in the period (Mon-Fri = trading days)
  let tradingDays = 0;
  const cursor = new Date(fromDate);
  while (cursor <= toDate) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) tradingDays++;
    cursor.setDate(cursor.getDate() + 1);
  }
  const completedEntries = journals.filter((j) => !j.isDraft).length;
  const journalValue = tradingDays > 0 ? (completedEntries / tradingDays) * 100 : null;
  const journalScore = journalValue !== null ? Math.min(100, journalValue) : 0;

  // 5. Risk management (weight 10) — % of trades with riskPercent <= 2%
  const tradesWithRisk = trades.filter((t) => t.riskPercent !== null);
  const lowRiskTrades = tradesWithRisk.filter((t) => toNumber(t.riskPercent) <= 2);
  const riskMgmtValue = tradesWithRisk.length > 0
    ? (lowRiskTrades.length / tradesWithRisk.length) * 100
    : null;
  const riskMgmtScore = riskMgmtValue !== null ? riskMgmtValue : 0;

  // 6. Discipline (weight 10) — avg discipline from journal entries
  const entriesWithDiscipline = journals.filter((j) => j.discipline !== null);
  const avgDiscipline = entriesWithDiscipline.length > 0
    ? entriesWithDiscipline.reduce((s, j) => s + (j.discipline ?? 0), 0) / entriesWithDiscipline.length
    : null;
  const disciplineValue = avgDiscipline !== null ? (avgDiscipline / 10) * 100 : null;
  const disciplineScore = disciplineValue !== null ? disciplineValue : 0;

  // Weighted total
  const score = Math.round(
    winRateScore * 0.25 +
    rrScore * 0.25 +
    ruleScore * 0.15 +
    journalScore * 0.15 +
    riskMgmtScore * 0.10 +
    disciplineScore * 0.10,
  );

  // Suggestions
  const suggestions: string[] = [];
  if (winRateValue !== null && winRateValue < 50) suggestions.push("Win rate is below 50% — review your entry criteria and only take A+ setups.");
  if (avgRR !== null && avgRR < 1.5) suggestions.push("Average R:R is below 1.5 — aim to cut losses earlier or let winners run longer.");
  if (ruleComplianceValue !== null && ruleComplianceValue < 80) suggestions.push("Rule compliance is low — review your pre-trade checklist before every trade.");
  if (journalValue !== null && journalValue < 60) suggestions.push("Journal completion is below 60% — daily journaling improves consistency and awareness.");
  if (riskMgmtValue !== null && riskMgmtValue < 80) suggestions.push("More than 20% of trades exceed 2% risk — tighten position sizing to protect your capital.");
  if (disciplineValue !== null && disciplineValue < 60) suggestions.push("Discipline score from journal is low — focus on emotional control and pre-session routines.");
  if (suggestions.length === 0) suggestions.push("Outstanding performance! Maintain your current discipline and keep journaling every day.");

  return {
    score,
    grade: getGrade(score),
    period: periodStr,
    tradesAnalyzed: trades.length,
    breakdown: {
      winRate: { score: Math.round(winRateScore), weight: 25, value: winRateValue, label: "Win Rate" },
      riskReward: { score: Math.round(rrScore), weight: 25, value: avgRR, label: "Risk:Reward" },
      ruleCompliance: { score: Math.round(ruleScore), weight: 15, value: ruleComplianceValue, label: "Rule Compliance" },
      journalCompletion: { score: Math.round(journalScore), weight: 15, value: journalValue, label: "Journal Completion" },
      riskManagement: { score: Math.round(riskMgmtScore), weight: 10, value: riskMgmtValue, label: "Risk Management" },
      discipline: { score: Math.round(disciplineScore), weight: 10, value: disciplineValue, label: "Discipline" },
    },
    suggestions,
  };
}
