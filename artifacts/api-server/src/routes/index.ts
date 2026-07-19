import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import sessionsRouter from "./sessions.js";
import scriptsRouter from "./scripts.js";
import analysisRouter from "./analysis.js";
import eventIntelRouter from "./event-intel.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/sessions", sessionsRouter);
router.use("/sessions/:sessionId/scripts", scriptsRouter);
router.use("/sessions/:sessionId", analysisRouter);
router.use("/sessions/:sessionId", eventIntelRouter);

export default router;
