import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import tradesRouter from "./trades";
import journalsRouter from "./journals";
import rulesRouter from "./rules";
import reviewsRouter from "./reviews";
import analyticsRouter from "./analytics";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(tradesRouter);
router.use(journalsRouter);
router.use(rulesRouter);
router.use(reviewsRouter);
router.use(analyticsRouter);
router.use(storageRouter);

export default router;
