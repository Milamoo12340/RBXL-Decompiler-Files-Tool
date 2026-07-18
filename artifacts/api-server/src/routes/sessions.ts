import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq, sql } from "drizzle-orm";
import { db, decompilesessions, scripts, topics, topicFindings } from "@workspace/db";
import { parseRbxl } from "../lib/rbxl-parser.js";
import { analyzeScript } from "../lib/analyzer.js";
import { toSessionJson, toScriptJson } from "../lib/script-utils.js";

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "..", "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".rbxl", ".rbxm", ".rbxlx", ".rbxmx"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .rbxl / .rbxm files are accepted"));
    }
  },
});

// POST /api/sessions/upload
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const [session] = await db
    .insert(decompilesessions)
    .values({
      originalName: req.file.originalname,
      filePath: req.file.path,
      status: "processing",
      fileSizeBytes: req.file.size,
    })
    .returning();

  res.status(201).json(toSessionJson(session));

  processSession(session.id, req.file.path).catch(async (err) => {
    await db
      .update(decompilesessions)
      .set({ status: "error", errorMessage: String(err) })
      .where(eq(decompilesessions.id, session.id));
  });
});

const BATCH_SIZE = 500;

async function processSession(sessionId: number, filePath: string) {
  try {
    const result = await parseRbxl(filePath, true);

    if (!result.success || !result.scripts) {
      await db
        .update(decompilesessions)
        .set({ status: "error", errorMessage: result.error ?? "Unknown parse error" })
        .where(eq(decompilesessions.id, sessionId));
      return;
    }

    // Bulk-insert scripts in batches then collect IDs for analysis
    type PendingAnalysis = { scriptId: number; name: string; source: string };
    const pendingAnalysis: PendingAnalysis[] = [];

    for (let i = 0; i < result.scripts.length; i += BATCH_SIZE) {
      const batch = result.scripts.slice(i, i + BATCH_SIZE);
      const inserted = await db
        .insert(scripts)
        .values(
          batch.map((s) => ({
            sessionId,
            name: s.name,
            scriptType: s.class,
            scriptPath: s.path,
            sizeBytes: s.size,
            content: s.source ?? "",
            isBytecode: s.is_bytecode,
          }))
        )
        .returning({ id: scripts.id, name: scripts.name, isBytecode: scripts.isBytecode });

      for (let j = 0; j < inserted.length; j++) {
        const row = inserted[j];
        const raw = batch[j];
        if (!row.isBytecode && raw.source) {
          pendingAnalysis.push({ scriptId: row.id, name: row.name, source: raw.source });
        }
      }
    }

    // Run analysis in memory, then bulk-insert topics + findings
    const topicMap: Record<string, { findings: { scriptId: number; scriptName: string; lineNumber: number; snippet: string; value: string | null }[]; category: string }> = {};

    for (const { scriptId, name, source } of pendingAnalysis) {
      const results = analyzeScript(scriptId, name, source);
      for (const ar of results) {
        if (!topicMap[ar.topicName]) topicMap[ar.topicName] = { findings: [], category: ar.category };
        topicMap[ar.topicName].findings.push(...ar.findings);
      }
    }

    for (const [topicName, data] of Object.entries(topicMap)) {
      const [topic] = await db
        .insert(topics)
        .values({ sessionId, name: topicName, category: data.category, matchCount: data.findings.length })
        .returning();

      const slice = data.findings.slice(0, 500);
      if (slice.length > 0) {
        for (let i = 0; i < slice.length; i += BATCH_SIZE) {
          await db.insert(topicFindings).values(
            slice.slice(i, i + BATCH_SIZE).map((f) => ({
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
    }

    await db
      .update(decompilesessions)
      .set({ status: "complete", scriptCount: result.scripts.length })
      .where(eq(decompilesessions.id, sessionId));
  } catch (err) {
    await db
      .update(decompilesessions)
      .set({ status: "error", errorMessage: String(err) })
      .where(eq(decompilesessions.id, sessionId));
  }
}

// GET /api/sessions
router.get("/", async (_req, res) => {
  const rows = await db.select().from(decompilesessions).orderBy(sql`created_at DESC`);
  res.json(rows.map(toSessionJson));
});

// GET /api/sessions/:sessionId
router.get("/:sessionId", async (req, res) => {
  const id = Number(req.params.sessionId);
  const [row] = await db.select().from(decompilesessions).where(eq(decompilesessions.id, id));
  if (!row) { res.status(404).json({ error: "Session not found" }); return; }
  res.json(toSessionJson(row));
});

// DELETE /api/sessions/:sessionId
router.delete("/:sessionId", async (req, res) => {
  const id = Number(req.params.sessionId);
  const [row] = await db.select().from(decompilesessions).where(eq(decompilesessions.id, id));
  if (row?.filePath) { try { fs.unlinkSync(row.filePath); } catch { /* ignore */ } }
  await db.delete(decompilesessions).where(eq(decompilesessions.id, id));
  res.status(204).end();
});

// GET /api/sessions/:sessionId/stats
router.get("/:sessionId/stats", async (req, res) => {
  const id = Number(req.params.sessionId);
  const rows = await db.select().from(scripts).where(eq(scripts.sessionId, id));

  const typeBreakdown: Record<string, number> = {};
  let totalSize = 0;
  let bytecodeCount = 0;
  for (const r of rows) {
    typeBreakdown[r.scriptType] = (typeBreakdown[r.scriptType] ?? 0) + 1;
    totalSize += r.sizeBytes;
    if (r.isBytecode) bytecodeCount++;
  }

  const topScripts = [...rows].sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 10).map(toScriptJson);

  res.json({ sessionId: id, totalScripts: rows.length, scriptTypes: typeBreakdown, totalSizeBytes: totalSize, bytecodeCount, topScripts });
});

export default router;
