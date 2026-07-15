import { Router, type IRouter } from "express";
import {
  GetAnalyticsSummaryQueryParams,
  GetAnalyticsSummaryResponse,
  GetOprScoreQueryParams,
  GetOprScoreResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getAnalyticsSummaryForUser, getOprScoreForUser } from "../lib/analytics";

const router: IRouter = Router();

router.get(
  "/analytics/summary",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = GetAnalyticsSummaryQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { dateFrom, dateTo } = parsed.data;

    try {
      const summary = await getAnalyticsSummaryForUser(
        req.userId!,
        dateFrom instanceof Date ? dateFrom.toISOString() : dateFrom,
        dateTo instanceof Date ? dateTo.toISOString() : dateTo,
      );
      res.json(GetAnalyticsSummaryResponse.parse(summary));
    } catch (err) {
      req.log.error({ err }, "Error computing analytics summary");
      res.status(500).json({ error: "Failed to compute analytics" });
    }
  },
);

router.get(
  "/analytics/opr",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = GetOprScoreQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { period } = parsed.data;

    try {
      const opr = await getOprScoreForUser(req.userId!, period);
      res.json(GetOprScoreResponse.parse(opr));
    } catch (err) {
      req.log.error({ err }, "Error computing OPR score");
      res.status(500).json({ error: "Failed to compute OPR score" });
    }
  },
);

export default router;
