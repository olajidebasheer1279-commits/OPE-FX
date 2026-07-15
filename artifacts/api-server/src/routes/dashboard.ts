import { Router, type IRouter } from "express";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getDashboardSummaryForUser } from "../lib/dashboard";

const router: IRouter = Router();

router.get(
  "/dashboard/summary",
  requireAuth,
  async (req, res): Promise<void> => {
    const summary = await getDashboardSummaryForUser(req.userId!);
    res.json(GetDashboardSummaryResponse.parse(summary));
  },
);

export default router;
