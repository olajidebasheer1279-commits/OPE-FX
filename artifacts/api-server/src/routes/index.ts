import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import tradesRouter from "./trades";
import journalsRouter from "./journals";
import rulesRouter from "./rules";
import reviewsRouter from "./reviews";
import analyticsRouter from "./analytics";
import storageRouter from "./storage";
import accountRouter from "./account";
import notificationsRouter from "./notifications";
import assistantRouter from "./assistant";
import backupRouter from "./backup";
import alertsRouter from "./alerts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(tradesRouter);
router.use(journalsRouter);
router.use(rulesRouter);
router.use(reviewsRouter);
router.use(analyticsRouter);
router.use(storageRouter);
router.use(accountRouter);
router.use(notificationsRouter);
router.use(assistantRouter);
router.use(backupRouter);
router.use(alertsRouter);

export default router;
