import { Router, type IRouter } from "express";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db, rulesTable } from "@workspace/db";
import {
  ListRulesQueryParams,
  ListRulesResponse,
  CreateRuleBody,
  CreateRuleResponse,
  UpdateRuleParams,
  UpdateRuleBody,
  UpdateRuleResponse,
  DeleteRuleParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/rules", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListRulesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [eq(rulesTable.userId, req.userId!)];
  if (parsed.data.search) {
    conditions.push(ilike(rulesTable.title, `%${parsed.data.search}%`));
  }
  if (parsed.data.category) {
    conditions.push(eq(rulesTable.category, parsed.data.category));
  }

  const rules = await db
    .select()
    .from(rulesTable)
    .where(and(...conditions))
    .orderBy(asc(rulesTable.category), asc(rulesTable.sortOrder), asc(rulesTable.id));

  res.json(ListRulesResponse.parse(rules));
});

router.post("/rules", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  const [rule] = await db
    .insert(rulesTable)
    .values({
      userId: req.userId!,
      title: body.title,
      description: body.description ?? null,
      category: body.category,
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();

  res.status(201).json(CreateRuleResponse.parse(rule));
});

router.patch("/rules/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [rule] = await db
    .update(rulesTable)
    .set(parsed.data)
    .where(
      and(eq(rulesTable.id, params.data.id), eq(rulesTable.userId, req.userId!)),
    )
    .returning();

  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  res.json(UpdateRuleResponse.parse(rule));
});

router.delete("/rules/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(rulesTable)
    .where(
      and(eq(rulesTable.id, params.data.id), eq(rulesTable.userId, req.userId!)),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
