import { Router } from "express";
import { eq, and } from "drizzle-orm";
import AdmZip from "adm-zip";
import { db, scripts, topics, topicFindings, decompilesessions } from "@workspace/db";
import { toTopicJson } from "../lib/script-utils.js";

const router = Router({ mergeParams: true });

// GET /api/sessions/:sessionId/analysis
router.get("/analysis", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const rows = await db.select().from(topics).where(eq(topics.sessionId, sessionId)).orderBy(topics.matchCount);
  res.json({ sessionId, topicCount: rows.length, topics: rows.map(toTopicJson) });
});

// GET /api/sessions/:sessionId/topics
router.get("/topics", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const rows = await db.select().from(topics).where(eq(topics.sessionId, sessionId)).orderBy(topics.matchCount);
  res.json(rows.map(toTopicJson));
});

// GET /api/sessions/:sessionId/topics/:topicId
router.get("/topics/:topicId", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const topicId = Number(req.params.topicId);

  const [topic] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.sessionId, sessionId)));

  if (!topic) { res.status(404).json({ error: "Topic not found" }); return; }

  const findings = await db
    .select()
    .from(topicFindings)
    .where(eq(topicFindings.topicId, topicId))
    .orderBy(topicFindings.lineNumber);

  res.json({
    ...toTopicJson(topic),
    findings: findings.map((f) => ({
      scriptName: f.scriptName,
      scriptId: f.scriptId,
      lineNumber: f.lineNumber,
      snippet: f.snippet,
      value: f.value,
    })),
  });
});

// GET /api/sessions/:sessionId/download-all  (zip of all scripts)
router.get("/download-all", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const rows = await db.select().from(scripts).where(eq(scripts.sessionId, sessionId));

  const zip = new AdmZip();
  for (const row of rows) {
    const safeName = row.scriptPath.replace(/[^a-zA-Z0-9_./\\-]/g, "_") + ".lua";
    zip.addFile(safeName, Buffer.from(row.content, "utf-8"));
  }

  const buf = zip.toBuffer();
  res.setHeader("Content-Disposition", `attachment; filename="session_${sessionId}_scripts.zip"`);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

export default router;
