import { eq } from "drizzle-orm";
import { db, accountsTable, tradesTable, type Trade } from "@workspace/db";

const DEFAULT_STARTING_BALANCE = 10000;
const DEFAULT_GOAL_MULTIPLIER = 1.2; // default goal: +20% of starting balance

function toNumber(value: string | number | null): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  // Treat Monday as the first day of the week.
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function serializeTrade(trade: Trade) {
  return {
    id: trade.id,
    symbol: trade.symbol,
    direction: trade.direction as "long" | "short",
    status: trade.status as "open" | "closed",
    entryPrice: toNumber(trade.entryPrice),
    exitPrice: trade.exitPrice === null ? null : toNumber(trade.exitPrice),
    pnl: trade.pnl === null ? null : toNumber(trade.pnl),
    riskRewardRatio:
      trade.riskRewardRatio === null ? null : toNumber(trade.riskRewardRatio),
    lotSize: toNumber(trade.lotSize),
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt === null ? null : trade.closedAt.toISOString(),
  };
}

export async function getDashboardSummaryForUser(userId: string) {
  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId))
    .orderBy(accountsTable.createdAt)
    .limit(1);

  const startingBalance = account
    ? toNumber(account.startingBalance)
    : DEFAULT_STARTING_BALANCE;
  const currentBalance = account
    ? toNumber(account.currentBalance)
    : DEFAULT_STARTING_BALANCE;

  if (!account) {
    return {
      currentBalance,
      todayPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      winRate: 0,
      avgRiskReward: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      recentTrades: [],
      equityCurve: [{ date: new Date().toISOString(), balance: currentBalance }],
      outcomeBreakdown: { wins: 0, losses: 0, breakeven: 0 },
      goalProgress: {
        targetBalance: startingBalance * DEFAULT_GOAL_MULTIPLIER,
        currentBalance,
        progressPercent: 0,
      },
    };
  }

  const allTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.accountId, account.id))
    .orderBy(tradesTable.openedAt);

  const closedTrades = allTrades.filter(
    (t) => t.status === "closed" && t.pnl !== null,
  );

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const sumPnlSince = (since: Date) =>
    closedTrades
      .filter((t) => (t.closedAt ?? t.openedAt) >= since)
      .reduce((sum, t) => sum + toNumber(t.pnl), 0);

  const todayPnl = sumPnlSince(todayStart);
  const weeklyPnl = sumPnlSince(weekStart);
  const monthlyPnl = sumPnlSince(monthStart);

  const winningTrades = closedTrades.filter((t) => toNumber(t.pnl) > 0);
  const losingTrades = closedTrades.filter((t) => toNumber(t.pnl) < 0);
  const breakevenTrades = closedTrades.filter((t) => toNumber(t.pnl) === 0);

  const winRate =
    closedTrades.length > 0
      ? (winningTrades.length / closedTrades.length) * 100
      : 0;

  const tradesWithRR = closedTrades.filter((t) => t.riskRewardRatio !== null);
  const avgRiskReward =
    tradesWithRR.length > 0
      ? tradesWithRR.reduce((sum, t) => sum + toNumber(t.riskRewardRatio), 0) /
        tradesWithRR.length
      : 0;

  // Build an equity curve starting from the account's starting balance,
  // walking forward through closed trades in chronological order.
  let running = startingBalance;
  const equityCurve = [
    { date: account.createdAt.toISOString(), balance: running },
    ...closedTrades.map((t) => {
      running += toNumber(t.pnl);
      return {
        date: (t.closedAt ?? t.openedAt).toISOString(),
        balance: running,
      };
    }),
  ];

  const recentTrades = [...allTrades]
    .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())
    .slice(0, 10)
    .map(serializeTrade);

  const targetBalance = startingBalance * DEFAULT_GOAL_MULTIPLIER;
  const progressPercent =
    targetBalance > startingBalance
      ? Math.max(
          0,
          Math.min(
            100,
            ((currentBalance - startingBalance) /
              (targetBalance - startingBalance)) *
              100,
          ),
        )
      : 0;

  return {
    currentBalance,
    todayPnl,
    weeklyPnl,
    monthlyPnl,
    winRate,
    avgRiskReward,
    totalTrades: allTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    recentTrades,
    equityCurve,
    outcomeBreakdown: {
      wins: winningTrades.length,
      losses: losingTrades.length,
      breakeven: breakevenTrades.length,
    },
    goalProgress: {
      targetBalance,
      currentBalance,
      progressPercent,
    },
  };
}
