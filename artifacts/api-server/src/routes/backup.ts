import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  accountsTable,
  tradesTable,
  journalsTable,
  reviewsTable,
  rulesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateDefaultAccount } from "../lib/accounts";
import { serializeTrade, toNumber } from "../lib/trades";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /backup — export all user data as a portable JSON bundle
// ---------------------------------------------------------------------------
router.get("/backup", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [accounts, trades, journals, reviews, rules] = await Promise.all([
    db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.userId, userId))
      .limit(1),
    db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.userId, userId))
      .orderBy(tradesTable.openedAt),
    db
      .select()
      .from(journalsTable)
      .where(eq(journalsTable.userId, userId))
      .orderBy(journalsTable.date),
    db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.userId, userId))
      .orderBy(reviewsTable.createdAt),
    db
      .select()
      .from(rulesTable)
      .where(eq(rulesTable.userId, userId))
      .orderBy(rulesTable.createdAt),
  ]);

  const account = accounts[0] ?? null;

  res.json({
    version: "1.0",
    exportedAt: new Date().toISOString(),
    account: account
      ? {
          name: account.name,
          broker: account.broker,
          accountType: account.accountType,
          currency: account.currency,
          timezone: account.timezone,
          startingBalance: toNumber(account.startingBalance),
        }
      : null,
    trades: trades.map(serializeTrade),
    journals: journals.map((j) => ({
      date: j.date,
      mood: j.mood,
      confidence: j.confidence,
      discipline: j.discipline,
      fear: j.fear,
      greed: j.greed,
      focus: j.focus,
      sleep: j.sleep,
      tradingPlan: j.tradingPlan,
      notes: j.notes,
      mistakes: j.mistakes,
      lessons: j.lessons,
      tomorrowGoal: j.tomorrowGoal,
      isDraft: j.isDraft,
    })),
    reviews: reviews.map((r) => ({
      period: r.period,
      title: r.title,
      content: r.content,
      rating: r.rating,
      startDate: r.startDate,
      endDate: r.endDate,
      strengths: r.strengths,
      mistakes: r.mistakes,
      lessons: r.lessons,
      actionPlan: r.actionPlan,
    })),
    rules: rules.map((r) => ({
      title: r.title,
      description: r.description,
      category: r.category,
      isActive: r.isActive,
      completed: r.completed,
      sortOrder: r.sortOrder,
    })),
  });
});

// ---------------------------------------------------------------------------
// POST /restore — import a backup bundle (append mode — no existing data deleted)
// ---------------------------------------------------------------------------
router.post("/restore", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const backup = req.body as Record<string, unknown>;

  if (!backup || typeof backup !== "object" || !backup.version) {
    res.status(400).json({ error: "Invalid backup file format. Expected a valid OPE-FX JSON backup." });
    return;
  }

  const account = await getOrCreateDefaultAccount(userId);
  const imported = { trades: 0, journals: 0, reviews: 0, rules: 0 };
  const skipped = { trades: 0, journals: 0, reviews: 0, rules: 0 };

  // ---- Trades ----
  const backupTrades = Array.isArray(backup.trades) ? backup.trades : [];
  for (const t of backupTrades) {
    if (!t || typeof t !== "object") continue;
    try {
      await db.insert(tradesTable).values({
        userId,
        accountId: account.id,
        symbol: String(t.symbol ?? ""),
        market: String(t.market ?? "Forex"),
        direction: String(t.direction ?? "long"),
        status: String(t.status ?? "open"),
        entryPrice: String(t.entryPrice ?? "0"),
        exitPrice: t.exitPrice != null ? String(t.exitPrice) : null,
        stopLoss: t.stopLoss != null ? String(t.stopLoss) : null,
        takeProfit: t.takeProfit != null ? String(t.takeProfit) : null,
        lotSize: String(t.lotSize ?? "0"),
        riskPercent: t.riskPercent != null ? String(t.riskPercent) : null,
        riskAmount: t.riskAmount != null ? String(t.riskAmount) : null,
        pnl: t.pnl != null ? String(t.pnl) : null,
        pips: t.pips != null ? String(t.pips) : null,
        riskRewardRatio: t.riskRewardRatio != null ? String(t.riskRewardRatio) : null,
        outcome: t.outcome != null ? String(t.outcome) : null,
        timeframe: t.timeframe != null ? String(t.timeframe) : null,
        strategy: t.strategy != null ? String(t.strategy) : null,
        notes: t.notes != null ? String(t.notes) : null,
        openedAt: new Date(String(t.openedAt)),
        closedAt: t.closedAt != null ? new Date(String(t.closedAt)) : null,
      });
      imported.trades++;
    } catch {
      skipped.trades++;
    }
  }

  // ---- Journals (skip duplicate date entries) ----
  const backupJournals = Array.isArray(backup.journals) ? backup.journals : [];
  for (const j of backupJournals) {
    if (!j || typeof j !== "object" || !j.date) continue;
    try {
      await db
        .insert(journalsTable)
        .values({
          userId,
          date: String(j.date),
          mood: j.mood != null ? Number(j.mood) : null,
          confidence: j.confidence != null ? Number(j.confidence) : null,
          discipline: j.discipline != null ? Number(j.discipline) : null,
          fear: j.fear != null ? Number(j.fear) : null,
          greed: j.greed != null ? Number(j.greed) : null,
          focus: j.focus != null ? Number(j.focus) : null,
          sleep: j.sleep != null ? Number(j.sleep) : null,
          tradingPlan: j.tradingPlan != null ? String(j.tradingPlan) : null,
          notes: j.notes != null ? String(j.notes) : null,
          mistakes: j.mistakes != null ? String(j.mistakes) : null,
          lessons: j.lessons != null ? String(j.lessons) : null,
          tomorrowGoal: j.tomorrowGoal != null ? String(j.tomorrowGoal) : null,
          isDraft: Boolean(j.isDraft ?? false),
        })
        .onConflictDoNothing();
      imported.journals++;
    } catch {
      skipped.journals++;
    }
  }

  // ---- Reviews ----
  const backupReviews = Array.isArray(backup.reviews) ? backup.reviews : [];
  for (const r of backupReviews) {
    if (!r || typeof r !== "object") continue;
    try {
      await db.insert(reviewsTable).values({
        userId,
        period: String(r.period ?? "weekly"),
        title: String(r.title ?? "Imported Review"),
        content: String(r.content ?? ""),
        rating: r.rating != null ? Number(r.rating) : null,
        startDate: r.startDate != null ? String(r.startDate) : null,
        endDate: r.endDate != null ? String(r.endDate) : null,
        strengths: r.strengths != null ? String(r.strengths) : null,
        mistakes: r.mistakes != null ? String(r.mistakes) : null,
        lessons: r.lessons != null ? String(r.lessons) : null,
        actionPlan: r.actionPlan != null ? String(r.actionPlan) : null,
      });
      imported.reviews++;
    } catch {
      skipped.reviews++;
    }
  }

  // ---- Rules ----
  const backupRules = Array.isArray(backup.rules) ? backup.rules : [];
  for (const r of backupRules) {
    if (!r || typeof r !== "object") continue;
    try {
      await db.insert(rulesTable).values({
        userId,
        title: String(r.title ?? "Imported Rule"),
        description: r.description != null ? String(r.description) : null,
        category: String(r.category ?? "Market Structure"),
        isActive: Boolean(r.isActive ?? true),
        completed: Boolean(r.completed ?? false),
        sortOrder: r.sortOrder != null ? Number(r.sortOrder) : 0,
      });
      imported.rules++;
    } catch {
      skipped.rules++;
    }
  }

  res.json({
    message: "Backup restored successfully",
    imported,
    skipped,
  });
});

export default router;
