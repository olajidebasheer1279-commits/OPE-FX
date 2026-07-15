import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  db,
  tradesTable,
  journalsTable,
  rulesTable,
  accountsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : parseFloat(v);
}

/** GET /assistant/summary */
router.get(
  "/assistant/summary",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.userId!;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    try {
      // --- Fetch data in parallel ---
      const [rules, todayJournal, recentTrades, account] = await Promise.all([
        db
          .select()
          .from(rulesTable)
          .where(eq(rulesTable.userId, userId))
          .orderBy(rulesTable.category, rulesTable.createdAt)
          .limit(30),
        db
          .select()
          .from(journalsTable)
          .where(
            and(
              eq(journalsTable.userId, userId),
              eq(journalsTable.date, todayStr),
            ),
          )
          .limit(1),
        db
          .select()
          .from(tradesTable)
          .where(
            and(
              eq(tradesTable.userId, userId),
              eq(tradesTable.status, "closed"),
            ),
          )
          .orderBy(desc(tradesTable.closedAt))
          .limit(20),
        db
          .select()
          .from(accountsTable)
          .where(eq(accountsTable.userId, userId))
          .orderBy(accountsTable.createdAt)
          .limit(1),
      ]);

      const closed = recentTrades.filter((t) => t.pnl !== null);

      // --- Checklist from trading rules ---
      const checklist = rules.map((r) => ({
        id: r.id,
        text: r.title,
        category: r.category,
        isChecked: r.completed,
      }));

      // --- Recent performance stats (last 20 closed trades) ---
      const wins = closed.filter((t) => toNum(t.pnl) > 0);
      const losses = closed.filter((t) => toNum(t.pnl) < 0);
      const breakeven = closed.filter((t) => toNum(t.pnl) === 0);
      const winRate =
        closed.length > 0 ? (wins.length / closed.length) * 100 : null;

      const tradesWithRR = closed.filter((t) => t.riskRewardRatio !== null);
      const avgRR =
        tradesWithRR.length > 0
          ? tradesWithRR.reduce((s, t) => s + toNum(t.riskRewardRatio), 0) /
            tradesWithRR.length
          : null;

      const tradesWithRisk = closed.filter((t) => t.riskPercent !== null);
      const avgRisk =
        tradesWithRisk.length > 0
          ? tradesWithRisk.reduce((s, t) => s + toNum(t.riskPercent), 0) /
            tradesWithRisk.length
          : null;

      const totalPnl = closed.reduce((s, t) => s + toNum(t.pnl), 0);

      // Current streak
      let streak = 0;
      let streakType: "win" | "loss" | "none" = "none";
      for (const t of closed) {
        const pnl = toNum(t.pnl);
        const type: "win" | "loss" = pnl >= 0 ? "win" : "loss";
        if (streakType === "none") streakType = type;
        if (type === streakType) streak++;
        else break;
      }

      // --- Smart warnings ---
      const warnings: Array<{ level: "info" | "warning" | "danger"; message: string }> = [];

      if (streakType === "loss" && streak >= 3) {
        warnings.push({
          level: "danger",
          message: `You have ${streak} consecutive losing trades. Take a break and review your setups before continuing.`,
        });
      }

      if (winRate !== null && winRate < 40 && closed.length >= 5) {
        warnings.push({
          level: "warning",
          message: `Win rate is ${winRate.toFixed(1)}% — below 40%. Review your entry criteria and only take A+ setups.`,
        });
      }

      if (avgRR !== null && avgRR < 1.0 && closed.length >= 5) {
        warnings.push({
          level: "warning",
          message: `Average R:R is ${avgRR.toFixed(2)} — below 1:1. Cut losses earlier or let winners run further.`,
        });
      }

      if (avgRisk !== null && avgRisk > 3 && closed.length >= 3) {
        warnings.push({
          level: "warning",
          message: `Average risk per trade is ${avgRisk.toFixed(1)}% — above the recommended 2% maximum. Reduce your position size.`,
        });
      }

      if (!todayJournal[0]) {
        warnings.push({
          level: "info",
          message: "No journal entry for today. Write your pre-session plan before opening any trades.",
        });
      }

      // Check for trades without stop loss
      const noSlTrades = recentTrades.slice(0, 5).filter(
        (t) => t.stopLoss === null,
      );
      if (noSlTrades.length > 0) {
        warnings.push({
          level: "danger",
          message: `${noSlTrades.length} of your last 5 trades were placed without a stop loss. Always define your risk before entering.`,
        });
      }

      // --- Suggestions ---
      const suggestions: string[] = [];
      if (winRate !== null && winRate < 50 && closed.length >= 5) {
        suggestions.push(
          "Your win rate is below 50% — focus on patience and only take high-probability setups.",
        );
      }
      if (avgRR !== null && avgRR < 1.5 && closed.length >= 5) {
        suggestions.push(
          "Aim for an R:R of at least 1.5:1. Widen your take profit or tighten your stop loss on future trades.",
        );
      }
      if (!todayJournal[0]) {
        suggestions.push(
          "Write your daily trading plan in the Journal before the session begins.",
        );
      }
      if (rules.length === 0) {
        suggestions.push(
          "Set up your trading rules checklist to keep your strategy consistent.",
        );
      }
      if (suggestions.length === 0 && closed.length >= 5) {
        suggestions.push(
          "Great discipline! Keep journaling daily and reviewing your performance weekly.",
        );
      }

      res.json({
        checklist,
        dailyPlan: todayJournal[0]?.tradingPlan ?? null,
        hasJournalToday: !!todayJournal[0],
        recentStats: {
          trades: closed.length,
          wins: wins.length,
          losses: losses.length,
          breakeven: breakeven.length,
          winRate,
          avgRR,
          avgRisk,
          totalPnl,
          currentStreak: { type: streakType, count: streak },
          startingBalance: account[0]
            ? toNum(account[0].startingBalance)
            : 10000,
          currentBalance: account[0]
            ? toNum(account[0].currentBalance)
            : 10000,
          defaultRiskPercent: account[0]?.defaultRiskPercent
            ? toNum(account[0].defaultRiskPercent)
            : null,
        },
        warnings,
        suggestions,
      });
    } catch (err) {
      req.log.error({ err }, "Error computing assistant summary");
      res.status(500).json({ error: "Failed to compute assistant summary" });
    }
  },
);

export default router;
