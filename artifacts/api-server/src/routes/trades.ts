import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db, tradesTable, accountsTable, alertsTable, alertHistoryTable } from "@workspace/db";
import {
  ListTradesQueryParams,
  ListTradesResponse,
  CreateTradeBody,
  CreateTradeResponse,
  GetTradeParams,
  GetTradeResponse,
  UpdateTradeParams,
  UpdateTradeBody,
  UpdateTradeResponse,
  DeleteTradeParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateDefaultAccount, recalculateBalance } from "../lib/accounts";
import { computeTradeMetrics, serializeTrade, toNumber } from "../lib/trades";

const router: IRouter = Router();

router.get("/trades", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListTradesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;

  const account = await getOrCreateDefaultAccount(req.userId!);

  const conditions: SQL[] = [eq(tradesTable.accountId, account.id)];
  if (q.search) {
    const term = `%${q.search}%`;
    conditions.push(
      or(
        ilike(tradesTable.symbol, term),
        ilike(tradesTable.strategy, term),
        ilike(tradesTable.notes, term),
      )!,
    );
  }
  if (q.direction) conditions.push(eq(tradesTable.direction, q.direction));
  if (q.outcome) conditions.push(eq(tradesTable.outcome, q.outcome));
  if (q.status) conditions.push(eq(tradesTable.status, q.status));
  if (q.market) conditions.push(eq(tradesTable.market, q.market));
  if (q.dateFrom) conditions.push(gte(tradesTable.openedAt, q.dateFrom));
  if (q.dateTo) conditions.push(lte(tradesTable.openedAt, q.dateTo));

  const sortColumn = {
    openedAt: tradesTable.openedAt,
    pnl: tradesTable.pnl,
    riskRewardRatio: tradesTable.riskRewardRatio,
    symbol: tradesTable.symbol,
  }[q.sortBy];
  const orderFn = q.sortDir === "asc" ? asc : desc;

  const where = and(...conditions);

  const all = await db
    .select()
    .from(tradesTable)
    .where(where)
    .orderBy(orderFn(sortColumn));

  const total = all.length;
  const start = (q.page - 1) * q.pageSize;
  const pageItems = all.slice(start, start + q.pageSize);

  res.json(
    ListTradesResponse.parse({
      items: pageItems.map(serializeTrade),
      total,
      page: q.page,
      pageSize: q.pageSize,
    }),
  );
});

router.post("/trades", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  const account = await getOrCreateDefaultAccount(req.userId!);

  const metrics = computeTradeMetrics({
    symbol: body.symbol,
    market: body.market,
    direction: body.direction,
    entryPrice: body.entryPrice,
    exitPrice: body.exitPrice ?? null,
    stopLoss: body.stopLoss ?? null,
    takeProfit: body.takeProfit ?? null,
    lotSize: body.lotSize,
    accountBalance: toNumber(account.currentBalance),
  });

  // For non-USD cross pairs the client sends the exact MT5 risk amount.
  // Respect it instead of overwriting with the engine's approximate value.
  const balance = toNumber(account.currentBalance);
  const finalRiskAmount =
    body.riskAmount !== undefined ? body.riskAmount : metrics.riskAmount;
  const finalRiskPercent =
    body.riskAmount !== undefined && balance > 0
      ? (body.riskAmount / balance) * 100
      : metrics.riskPercent;

  const [trade] = await db
    .insert(tradesTable)
    .values({
      userId: req.userId!,
      accountId: account.id,
      symbol: body.symbol,
      market: body.market,
      direction: body.direction,
      status: metrics.status,
      entryPrice: body.entryPrice.toString(),
      exitPrice: body.exitPrice?.toString() ?? null,
      stopLoss: body.stopLoss?.toString() ?? null,
      takeProfit: body.takeProfit?.toString() ?? null,
      lotSize: body.lotSize.toString(),
      riskPercent: finalRiskPercent?.toString() ?? null,
      riskAmount: finalRiskAmount?.toString() ?? null,
      pnl: metrics.pnl?.toString() ?? null,
      pips: metrics.pips?.toString() ?? null,
      riskRewardRatio: metrics.riskRewardRatio?.toString() ?? null,
      outcome: metrics.outcome,
      timeframe: body.timeframe ?? null,
      strategy: body.strategy ?? null,
      notes: body.notes ?? null,
      beforeScreenshotUrl: body.beforeScreenshotUrl ?? null,
      afterScreenshotUrl: body.afterScreenshotUrl ?? null,
      openedAt: body.openedAt,
      closedAt: body.closedAt ?? (metrics.status === "closed" ? body.openedAt : null),
    })
    .returning();

  // Recompute balance from scratch to prevent drift
  await recalculateBalance(account.id);

  res.status(201).json(CreateTradeResponse.parse(serializeTrade(trade)));
});

router.get("/trades/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [trade] = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.id, params.data.id),
        eq(tradesTable.userId, req.userId!),
      ),
    );

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json(GetTradeResponse.parse(serializeTrade(trade)));
});

router.patch("/trades/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  const [existing] = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.id, params.data.id),
        eq(tradesTable.userId, req.userId!),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  const account = await getOrCreateDefaultAccount(req.userId!);

  const merged = {
    symbol: body.symbol ?? existing.symbol,
    market: body.market ?? existing.market,
    direction: (body.direction ?? existing.direction) as "long" | "short",
    entryPrice: body.entryPrice ?? toNumber(existing.entryPrice),
    exitPrice:
      body.exitPrice !== undefined
        ? body.exitPrice
        : existing.exitPrice === null
          ? null
          : toNumber(existing.exitPrice),
    stopLoss:
      body.stopLoss !== undefined
        ? body.stopLoss
        : existing.stopLoss === null
          ? null
          : toNumber(existing.stopLoss),
    takeProfit:
      body.takeProfit !== undefined
        ? body.takeProfit
        : existing.takeProfit === null
          ? null
          : toNumber(existing.takeProfit),
    lotSize: body.lotSize ?? toNumber(existing.lotSize),
    riskPercent:
      body.riskPercent !== undefined
        ? body.riskPercent
        : existing.riskPercent === null
          ? null
          : toNumber(existing.riskPercent),
    riskAmount:
      body.riskAmount !== undefined
        ? body.riskAmount
        : existing.riskAmount === null
          ? null
          : toNumber(existing.riskAmount),
    timeframe:
      body.timeframe !== undefined ? body.timeframe : existing.timeframe,
    strategy: body.strategy !== undefined ? body.strategy : existing.strategy,
    notes: body.notes !== undefined ? body.notes : existing.notes,
    beforeScreenshotUrl:
      body.beforeScreenshotUrl !== undefined
        ? body.beforeScreenshotUrl
        : existing.beforeScreenshotUrl,
    afterScreenshotUrl:
      body.afterScreenshotUrl !== undefined
        ? body.afterScreenshotUrl
        : existing.afterScreenshotUrl,
    openedAt: body.openedAt ?? existing.openedAt,
    closedAt:
      body.closedAt !== undefined ? body.closedAt : existing.closedAt,
  };

  const metrics = computeTradeMetrics({
    symbol: merged.symbol,
    market: merged.market,
    direction: merged.direction,
    entryPrice: merged.entryPrice,
    exitPrice: merged.exitPrice,
    stopLoss: merged.stopLoss,
    takeProfit: merged.takeProfit,
    lotSize: merged.lotSize,
    accountBalance: toNumber(account.currentBalance),
  });

  // For non-USD cross pairs the client sends the exact MT5 risk amount.
  // Respect it instead of overwriting with the engine's approximate value.
  const patchBalance = toNumber(account.currentBalance);
  const explicitRiskAmount = body.riskAmount;
  const finalRiskAmount =
    explicitRiskAmount !== undefined
      ? explicitRiskAmount
      : metrics.riskAmount;
  const finalRiskPercent =
    explicitRiskAmount !== undefined &&
    explicitRiskAmount !== null &&
    patchBalance > 0
      ? (explicitRiskAmount / patchBalance) * 100
      : metrics.riskPercent;

  const previousPnl =
    existing.pnl === null ? 0 : toNumber(existing.pnl);
  const newPnl = metrics.pnl ?? 0;
  const balanceDelta = newPnl - previousPnl;

  const [updated] = await db
    .update(tradesTable)
    .set({
      symbol: merged.symbol,
      market: merged.market,
      direction: merged.direction,
      status: metrics.status,
      entryPrice: merged.entryPrice.toString(),
      exitPrice: merged.exitPrice?.toString() ?? null,
      stopLoss: merged.stopLoss?.toString() ?? null,
      takeProfit: merged.takeProfit?.toString() ?? null,
      lotSize: merged.lotSize.toString(),
      riskPercent: finalRiskPercent?.toString() ?? null,
      riskAmount: finalRiskAmount?.toString() ?? null,
      pnl: metrics.pnl?.toString() ?? null,
      pips: metrics.pips?.toString() ?? null,
      riskRewardRatio: metrics.riskRewardRatio?.toString() ?? null,
      outcome: metrics.outcome,
      timeframe: merged.timeframe,
      strategy: merged.strategy,
      notes: merged.notes,
      beforeScreenshotUrl: merged.beforeScreenshotUrl,
      afterScreenshotUrl: merged.afterScreenshotUrl,
      openedAt: merged.openedAt,
      closedAt:
        merged.closedAt ?? (metrics.status === "closed" ? merged.openedAt : null),
    })
    .where(eq(tradesTable.id, existing.id))
    .returning();

  // Recompute balance from scratch to prevent drift
  await recalculateBalance(account.id);

  res.json(UpdateTradeResponse.parse(serializeTrade(updated)));
});

router.delete("/trades/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.id, params.data.id),
        eq(tradesTable.userId, req.userId!),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  const account = await getOrCreateDefaultAccount(req.userId!);

  // Delete linked alert history and alerts before removing the trade
  // (alert_history → alerts → trades FK chain prevents direct trade delete)
  const linkedAlerts = await db
    .select({ id: alertsTable.id })
    .from(alertsTable)
    .where(eq(alertsTable.tradeId, existing.id));

  if (linkedAlerts.length > 0) {
    for (const alert of linkedAlerts) {
      await db
        .delete(alertHistoryTable)
        .where(eq(alertHistoryTable.alertId, alert.id));
    }
    await db
      .delete(alertsTable)
      .where(eq(alertsTable.tradeId, existing.id));
  }

  await db.delete(tradesTable).where(eq(tradesTable.id, existing.id));

  // Recompute balance from scratch to prevent drift
  await recalculateBalance(account.id);

  res.sendStatus(204);
});

export default router;
