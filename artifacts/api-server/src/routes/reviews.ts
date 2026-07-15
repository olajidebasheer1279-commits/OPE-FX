import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, reviewsTable } from "@workspace/db";
import {
  ListReviewsQueryParams,
  ListReviewsResponse,
  GetReviewParams,
  GetReviewResponse,
  CreateReviewBody,
  CreateReviewResponse,
  UpdateReviewParams,
  UpdateReviewBody,
  UpdateReviewResponse,
  DeleteReviewParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function serializeReview(r: typeof reviewsTable.$inferSelect) {
  return {
    id: r.id,
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
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/reviews", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListReviewsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;

  const conditions = [eq(reviewsTable.userId, req.userId!)];
  if (q.period) conditions.push(eq(reviewsTable.period, q.period));
  if (q.dateFrom) conditions.push(gte(reviewsTable.startDate, q.dateFrom));
  if (q.dateTo) conditions.push(lte(reviewsTable.startDate, q.dateTo));

  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(and(...conditions))
    .orderBy(desc(reviewsTable.createdAt));

  res.json(ListReviewsResponse.parse(reviews.map(serializeReview)));
});

router.post("/reviews", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  const [review] = await db
    .insert(reviewsTable)
    .values({
      userId: req.userId!,
      period: body.period,
      title: body.title,
      content: body.content ?? "",
      rating: body.rating ?? null,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      strengths: body.strengths ?? null,
      mistakes: body.mistakes ?? null,
      lessons: body.lessons ?? null,
      actionPlan: body.actionPlan ?? null,
    })
    .returning();

  res.status(201).json(CreateReviewResponse.parse(serializeReview(review)));
});

router.get("/reviews/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [review] = await db
    .select()
    .from(reviewsTable)
    .where(
      and(
        eq(reviewsTable.id, params.data.id),
        eq(reviewsTable.userId, req.userId!),
      ),
    );

  if (!review) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  res.json(GetReviewResponse.parse(serializeReview(review)));
});

router.patch("/reviews/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateReviewBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(reviewsTable)
    .where(
      and(
        eq(reviewsTable.id, params.data.id),
        eq(reviewsTable.userId, req.userId!),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  const update: Partial<typeof reviewsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.data.period !== undefined) update.period = body.data.period;
  if (body.data.title !== undefined) update.title = body.data.title;
  if (body.data.content !== undefined) update.content = body.data.content;
  if (body.data.rating !== undefined) update.rating = body.data.rating;
  if (body.data.startDate !== undefined) update.startDate = body.data.startDate;
  if (body.data.endDate !== undefined) update.endDate = body.data.endDate;
  if (body.data.strengths !== undefined) update.strengths = body.data.strengths;
  if (body.data.mistakes !== undefined) update.mistakes = body.data.mistakes;
  if (body.data.lessons !== undefined) update.lessons = body.data.lessons;
  if (body.data.actionPlan !== undefined) update.actionPlan = body.data.actionPlan;

  const [updated] = await db
    .update(reviewsTable)
    .set(update)
    .where(eq(reviewsTable.id, params.data.id))
    .returning();

  res.json(UpdateReviewResponse.parse(serializeReview(updated)));
});

router.delete("/reviews/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(reviewsTable)
    .where(
      and(
        eq(reviewsTable.id, params.data.id),
        eq(reviewsTable.userId, req.userId!),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  await db.delete(reviewsTable).where(eq(reviewsTable.id, params.data.id));
  res.status(204).end();
});

export default router;
