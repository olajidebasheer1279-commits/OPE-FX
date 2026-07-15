import { Router, type IRouter } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, journalsTable } from "@workspace/db";
import {
  ListJournalsQueryParams,
  ListJournalsResponse,
  GetJournalParams,
  GetJournalResponse,
  UpsertJournalParams,
  UpsertJournalBody,
  UpsertJournalResponse,
  DeleteJournalParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/journals", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListJournalsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [eq(journalsTable.userId, req.userId!)];
  if (parsed.data.month) {
    const [year, month] = parsed.data.month.split("-").map(Number);
    const from = `${parsed.data.month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${parsed.data.month}-${String(lastDay).padStart(2, "0")}`;
    conditions.push(gte(journalsTable.date, from), lte(journalsTable.date, to));
  }

  const entries = await db
    .select()
    .from(journalsTable)
    .where(and(...conditions))
    .orderBy(journalsTable.date);

  res.json(ListJournalsResponse.parse(entries));
});

router.get("/journals/:date", requireAuth, async (req, res): Promise<void> => {
  const params = GetJournalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [entry] = await db
    .select()
    .from(journalsTable)
    .where(
      and(
        eq(journalsTable.userId, req.userId!),
        eq(journalsTable.date, params.data.date),
      ),
    );

  if (!entry) {
    res.status(404).json({ error: "No journal entry for this date" });
    return;
  }

  res.json(GetJournalResponse.parse(entry));
});

router.put("/journals/:date", requireAuth, async (req, res): Promise<void> => {
  const params = UpsertJournalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpsertJournalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  const [entry] = await db
    .insert(journalsTable)
    .values({
      userId: req.userId!,
      date: params.data.date,
      mood: body.mood ?? null,
      confidence: body.confidence ?? null,
      discipline: body.discipline ?? null,
      fear: body.fear ?? null,
      greed: body.greed ?? null,
      focus: body.focus ?? null,
      sleep: body.sleep ?? null,
      tradingPlan: body.tradingPlan ?? null,
      notes: body.notes ?? null,
      mistakes: body.mistakes ?? null,
      lessons: body.lessons ?? null,
      tomorrowGoal: body.tomorrowGoal ?? null,
      isDraft: body.isDraft ?? true,
    })
    .onConflictDoUpdate({
      target: [journalsTable.userId, journalsTable.date],
      set: {
        mood: body.mood ?? null,
        confidence: body.confidence ?? null,
        discipline: body.discipline ?? null,
        fear: body.fear ?? null,
        greed: body.greed ?? null,
        focus: body.focus ?? null,
        sleep: body.sleep ?? null,
        tradingPlan: body.tradingPlan ?? null,
        notes: body.notes ?? null,
        mistakes: body.mistakes ?? null,
        lessons: body.lessons ?? null,
        tomorrowGoal: body.tomorrowGoal ?? null,
        isDraft: body.isDraft ?? true,
      },
    })
    .returning();

  res.json(UpsertJournalResponse.parse(entry));
});

router.delete("/journals/:date", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteJournalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(journalsTable)
    .where(
      and(
        eq(journalsTable.userId, req.userId!),
        eq(journalsTable.date, params.data.date),
      ),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "No journal entry for this date" });
    return;
  }

  res.sendStatus(204);
});

export default router;
