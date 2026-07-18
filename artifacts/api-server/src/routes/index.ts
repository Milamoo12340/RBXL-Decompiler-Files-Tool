import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import sessionsRouter from "./sessions.js";
import scriptsRouter from "./scripts.js";
import analysisRouter from "./analysis.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/sessions", sessionsRouter);
router.use("/sessions/:sessionId/scripts", scriptsRouter);
router.use("/sessions/:sessionId", analysisRouter);

export default router;
