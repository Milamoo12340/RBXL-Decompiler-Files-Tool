import { Router } from "express";
import { eq, and } from "drizzle-orm";
import AdmZip from "adm-zip";
import { db, scripts, topics, topicFindings, decompilesessions } from "@workspace/db";
import { toTopicJson } from "../lib/script-utils.js";
import { analyzeScript } from "../lib/analyzer.js";

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

// POST /api/sessions/:sessionId/re-analyze  — wipe old topics/findings and re-run
router.post("/re-analyze", async (req, res) => {
  const sessionId = Number(req.params.sessionId);

  // Delete old analysis data for this session
  await db.delete(topicFindings).where(eq(topicFindings.sessionId, sessionId));
  await db.delete(topics).where(eq(topics.sessionId, sessionId));

  // Fetch all non-bytecode scripts
  const allScripts = await db
    .select({ id: scripts.id, name: scripts.name, content: scripts.content, isBytecode: scripts.isBytecode })
    .from(scripts)
    .where(eq(scripts.sessionId, sessionId));

  const topicMap: Record<string, { findings: { scriptId: number; scriptName: string; lineNumber: number; snippet: string; value: string | null }[]; category: string }> = {};

  for (const s of allScripts) {
    if (s.isBytecode || !s.content) continue;
    const results = analyzeScript(s.id, s.name, s.content);
    for (const ar of results) {
      if (!topicMap[ar.topicName]) topicMap[ar.topicName] = { findings: [], category: ar.category };
      topicMap[ar.topicName].findings.push(...ar.findings);
    }
  }

  const BATCH = 500;
  let topicCount = 0;
  let findingCount = 0;

  for (const [topicName, data] of Object.entries(topicMap)) {
    const [topic] = await db
      .insert(topics)
      .values({ sessionId, name: topicName, category: data.category, matchCount: data.findings.length })
      .returning();

    topicCount++;
    const slice = data.findings.slice(0, 1000);
    findingCount += slice.length;

    for (let i = 0; i < slice.length; i += BATCH) {
      await db.insert(topicFindings).values(
        slice.slice(i, i + BATCH).map((f) => ({
          topicId: topic.id,
          sessionId,
          scriptId: f.scriptId,
          scriptName: f.scriptName,
          lineNumber: f.lineNumber,
          snippet: f.snippet,
          value: f.value,
        }))
      );
    }
  }

  res.json({ ok: true, topics: topicCount, findings: findingCount });
});

// GET /api/sessions/:sessionId/download-all  (zip of all scripts, full content)
router.get("/download-all", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const rows = await db.select().from(scripts).where(eq(scripts.sessionId, sessionId));

  const zip = new AdmZip();
  for (const row of rows) {
    const safeName = row.scriptPath.replace(/[^a-zA-Z0-9_./\\-]/g, "_") + ".lua";
    zip.addFile(safeName, Buffer.from(row.content ?? "", "utf-8"));
  }

  const buf = zip.toBuffer();
  res.setHeader("Content-Disposition", `attachment; filename="session_${sessionId}_scripts.zip"`);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

export default router;
