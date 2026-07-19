import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, scripts } from "@workspace/db";
import { buildDropTable, detectCurrentEvent, matchesEventKeyword } from "../lib/event-intel.js";
import { parseFlagsFromScript } from "../lib/fflag-parser.js";

const router = Router({ mergeParams: true });

// ──────────────────────────────── Event Intel ────────────────────────────────
// GET /api/sessions/:sessionId/event-intel?search=keyword&limit=50
router.get("/event-intel", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const { search, limit: limitStr } = req.query as Record<string, string>;
  const LIMIT = Math.min(parseInt(limitStr ?? "80"), 200);

  // Load all script metadata (no content yet) for event detection
  const allMeta = await db
    .select({ id: scripts.id, name: scripts.name, scriptPath: scripts.scriptPath })
    .from(scripts)
    .where(eq(scripts.sessionId, sessionId))
    .orderBy(sql`id DESC`);

  // Detect current event (or use the user-provided search term)
  const detected = detectCurrentEvent(allMeta);

  // Determine which scripts to analyse
  const eventKeyword = search?.trim() || detected.name.split(" ")[0];

  // Find matching scripts
  const matchingMeta = allMeta.filter((s) =>
    matchesEventKeyword(s.name, s.scriptPath, eventKeyword) ||
    (search && matchesEventKeyword(s.name, s.scriptPath, search))
  );

  // Load content for matching scripts (capped to avoid memory issues)
  const targetIds = matchingMeta.slice(0, LIMIT).map((s) => s.id);

  if (targetIds.length === 0) {
    res.json({ detected, tables: [], totalMatched: 0, keyword: eventKeyword });
    return;
  }

  const rows = await db
    .select({
      id: scripts.id,
      name: scripts.name,
      scriptPath: scripts.scriptPath,
      content: scripts.content,
      sizeBytes: scripts.sizeBytes,
    })
    .from(scripts)
    .where(eq(scripts.sessionId, sessionId))
    // Filter to only matching IDs using inArray-style OR approach
    .orderBy(sql`id DESC`);

  const matching = rows.filter((r) => targetIds.includes(r.id));

  // Build drop tables for each script
  const tables = matching
    .map((s) => buildDropTable(s))
    .filter(Boolean)
    .slice(0, LIMIT);

  res.json({
    detected,
    keyword: eventKeyword,
    totalMatched: matchingMeta.length,
    tables,
  });
});

// ─────────────────────────────── FFlags ──────────────────────────────────────
// GET /api/sessions/:sessionId/fflags?search=keyword&category=X
router.get("/fflags", async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const { search, category } = req.query as Record<string, string>;

  // The FFlags live primarily in the "Custom" script and large config scripts
  // Find the large config scripts (Custom, Config, FlagConfig, etc.)
  const configScripts = await db
    .select({ id: scripts.id, name: scripts.name, content: scripts.content, sizeBytes: scripts.sizeBytes })
    .from(scripts)
    .where(eq(scripts.sessionId, sessionId))
    .orderBy(sql`size_bytes DESC`);

  // Scan the top config candidates
  const FLAG_SCRIPT_NAMES = ["custom", "config", "flagconfig", "gameconfig", "settings", "dflag", "fflag"];
  const candidates = configScripts.filter((s) =>
    FLAG_SCRIPT_NAMES.some((n) => s.name.toLowerCase().includes(n)) ||
    s.sizeBytes > 50000 // Large scripts likely contain config data
  ).slice(0, 5);

  const allFlags: ReturnType<typeof parseFlagsFromScript> = [];
  for (const script of candidates) {
    if (!script.content) continue;
    const flags = parseFlagsFromScript(script.content, script.name);
    allFlags.push(...flags);
  }

  // De-duplicate by key
  const seen = new Set<string>();
  const unique = allFlags.filter((f) => {
    if (seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });

  // Apply filters
  let filtered = unique;
  if (search) {
    const kw = search.toLowerCase();
    filtered = filtered.filter(
      (f) => f.key.toLowerCase().includes(kw) || f.name.toLowerCase().includes(kw) || f.category.toLowerCase().includes(kw)
    );
  }
  if (category) {
    filtered = filtered.filter((f) => f.category.toLowerCase() === category.toLowerCase());
  }

  // Build category list
  const categoryMap = new Map<string, number>();
  for (const f of unique) {
    categoryMap.set(f.category, (categoryMap.get(f.category) ?? 0) + 1);
  }
  const categories = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // Sort: event hints first, then by category
  filtered.sort((a, b) => {
    if (a.eventHint && !b.eventHint) return -1;
    if (!a.eventHint && b.eventHint) return 1;
    return a.category.localeCompare(b.category);
  });

  res.json({
    total: unique.length,
    filtered: filtered.length,
    categories,
    flags: filtered.slice(0, 500),
  });
});

export default router;
