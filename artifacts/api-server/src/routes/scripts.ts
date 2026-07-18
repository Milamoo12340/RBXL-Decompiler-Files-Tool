import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import AdmZip from "adm-zip";
import { db, scripts } from "@workspace/db";
import { toScriptJson } from "../lib/script-utils.js";

const router = Router({ mergeParams: true });

// GET /api/sessions/:sessionId/scripts
router.get("/", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const { scriptType, search } = req.query as Record<string, string>;

  const rows = await db
    .select({
      id: scripts.id,
      sessionId: scripts.sessionId,
      name: scripts.name,
      scriptType: scripts.scriptType,
      scriptPath: scripts.scriptPath,
      sizeBytes: scripts.sizeBytes,
      isBytecode: scripts.isBytecode,
      createdAt: scripts.createdAt,
    })
    .from(scripts)
    .where(eq(scripts.sessionId, sessionId))
    .orderBy(sql`name ASC`);

  let filtered = rows;
  if (scriptType) filtered = filtered.filter((r) => r.scriptType === scriptType);
  if (search) filtered = filtered.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  res.json(filtered.map(toScriptJson));
});

// GET /api/sessions/:sessionId/scripts/:scriptId
router.get("/:scriptId", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const scriptId = Number(req.params.scriptId);

  const [row] = await db
    .select()
    .from(scripts)
    .where(and(eq(scripts.id, scriptId), eq(scripts.sessionId, sessionId)));

  if (!row) { res.status(404).json({ error: "Script not found" }); return; }

  res.json({ ...toScriptJson(row), content: row.content });
});

// GET /api/sessions/:sessionId/scripts/:scriptId/download
router.get("/:scriptId/download", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const scriptId = Number(req.params.scriptId);

  const [row] = await db
    .select()
    .from(scripts)
    .where(and(eq(scripts.id, scriptId), eq(scripts.sessionId, sessionId)));

  if (!row) { res.status(404).json({ error: "Script not found" }); return; }

  const filename = `${row.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}.lua`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(row.content);
});

export default router;
