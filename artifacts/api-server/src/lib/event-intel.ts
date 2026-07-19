/**
 * Event Intelligence: auto-detect the current PS99 event from script clusters,
 * parse weight-based drop tables (Weight = N means N/totalWeight * 100%),
 * and parse egg hatch tables ({"PetName", N} where N is direct %).
 */

export interface DropEntry {
  name: string;
  itemType: string;    // Pet | HugePet | TitanicPet | GargantaunPet | Lootbox | Enchantment | Currency | Consumable | Potion | Egg | Gem | Unknown
  tier?: number;
  amount?: string;
  weight: number;
  totalWeight: number;
  pct: number;         // (weight / totalWeight) * 100
  isHuge: boolean;
  isTitanic: boolean;
  isGargantuan: boolean;
  modifiers: string[]; // Shiny, Golden, Rainbow, etc.
}

export interface ScriptDropTable {
  scriptId: number;
  scriptName: string;
  scriptPath: string;
  tableType: "loot_chest" | "egg_hatch" | "booster" | "currency" | "generic";
  format: "weighted" | "percentage";
  entries: DropEntry[];
  /** Grouped by item name (all tier variants merged) */
  grouped: GroupedEntry[];
}

export interface GroupedEntry {
  name: string;
  itemType: string;
  totalPct: number;
  isHuge: boolean;
  isTitanic: boolean;
  isGargantuan: boolean;
  variants: DropEntry[];
}

export interface DetectedEvent {
  name: string;
  confidence: "high" | "medium" | "low";
  keywords: string[];
  matchCount: number;
}

// ─────────────────────────── Item type classifier ────────────────────────────

const ITEM_PREFIXES: [RegExp, string, boolean, boolean, boolean][] = [
  // pattern, itemType, isHuge, isTitanic, isGargantuan
  [/Items\.GargantaunPet|Items\.Gargantuan(?!Npc)/i, "Gargantuan Pet", false, false, true],
  [/Items\.TitanicPet|Items\.Titanic(?!Npc)/i,       "Titanic Pet",    false, true,  false],
  [/Items\.HugePet|Items\.Huge(?!Npc)/i,             "Huge Pet",       true,  false, false],
  [/Items\.Pet\b/i,                                   "Pet",            false, false, false],
  [/Items\.Gem\b/i,                                   "Gem",            false, false, false],
  [/Items\.Egg\b/i,                                   "Egg",            false, false, false],
  [/Items\.Lootbox\b/i,                               "Lootbox",        false, false, false],
  [/Items\.Enchant\b/i,                               "Enchantment",    false, false, false],
  [/Items\.Potion\b/i,                                "Potion",         false, false, false],
  [/Items\.Currency\b/i,                              "Currency",       false, false, false],
  [/Items\.Consumable\b/i,                            "Consumable",     false, false, false],
];

function classifyValue(valueStr: string): { itemType: string; isHuge: boolean; isTitanic: boolean; isGargantuan: boolean } {
  for (const [pat, type, huge, titan, garg] of ITEM_PREFIXES) {
    if (pat.test(valueStr)) return { itemType: type, isHuge: huge, isTitanic: titan, isGargantuan: garg };
  }
  return { itemType: "Unknown", isHuge: false, isTitanic: false, isGargantuan: false };
}

function extractModifiers(valueStr: string): string[] {
  const mods: string[] = [];
  if (/SetShiny\(\)|:Shiny/i.test(valueStr)) mods.push("Shiny");
  if (/SetGolden\(\)|:Golden/i.test(valueStr)) mods.push("Golden");
  if (/SetRainbow\(\)|:Rainbow/i.test(valueStr)) mods.push("Rainbow");
  if (/SetExclusive\(\)|:Exclusive/i.test(valueStr)) mods.push("Exclusive");
  return mods;
}

function extractItemName(valueStr: string): string {
  const m = valueStr.match(/\(\s*"([^"]+)"\s*\)/);
  return m ? m[1] : valueStr.slice(0, 40);
}

function extractTier(valueStr: string): number | undefined {
  const m = valueStr.match(/:SetTier\(\s*(\d+)\s*\)/);
  return m ? parseInt(m[1]) : undefined;
}

function extractAmount(valueStr: string): string | undefined {
  const m = valueStr.match(/:SetAmount\(\s*([^)]+)\s*\)/);
  return m ? m[1].trim() : undefined;
}

// ───────────────────────── Weight-based table parser ─────────────────────────

/**
 * Parse PS99 weighted drop tables.
 * Pattern: {Weight = N, Value = Items.TYPE("name"):Modifier()}
 * Probability = (weight / sum_all_weights) × 100
 */
export function parseWeightedTable(content: string): DropEntry[] {
  // Match single-line entries: {Weight = N, Value = Items.*(...)...}
  const linePattern = /\{Weight\s*=\s*([\d.e+\-]+)\s*,\s*Value\s*=\s*(Items\.\w+\s*\(\s*"[^"]*"\s*\)[^}]*)\}/g;
  const raw: Array<{ weight: number; valueStr: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = linePattern.exec(content)) !== null) {
    const weight = parseFloat(m[1]);
    if (!isNaN(weight) && weight > 0) {
      raw.push({ weight, valueStr: m[2].trim() });
    }
  }

  if (raw.length === 0) return [];

  const totalWeight = raw.reduce((s, e) => s + e.weight, 0);

  return raw.map(({ weight, valueStr }) => {
    const { itemType, isHuge, isTitanic, isGargantuan } = classifyValue(valueStr);
    const name = extractItemName(valueStr);
    const tier = extractTier(valueStr);
    const amount = extractAmount(valueStr);
    const modifiers = extractModifiers(valueStr);
    const pct = (weight / totalWeight) * 100;

    return { name, itemType, tier, amount, weight, totalWeight, pct, isHuge, isTitanic, isGargantuan, modifiers };
  });
}

// ─────────────────────────── Egg hatch table parser ──────────────────────────

/**
 * Parse PS99 egg hatch tables.
 * Pattern: {"PetName", N} where N is direct percentage.
 * Also extracts goldChance, rainbowChance, shinyChance from the egg header.
 */
export function parseEggHatchTable(content: string): DropEntry[] {
  const petPattern = /\{\s*"([^"]+)"\s*,\s*([\d.]+)\s*\}/g;
  const entries: Array<{ name: string; pct: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = petPattern.exec(content)) !== null) {
    const pct = parseFloat(m[2]);
    if (pct > 0 && pct <= 100) {
      entries.push({ name: m[1], pct });
    }
  }

  if (entries.length < 2) return [];

  // Classify each pet by name prefix
  return entries.map(({ name, pct }) => {
    const lower = name.toLowerCase();
    const isGargantuan = lower.startsWith("gargantuan") || lower.includes("gargantuan");
    const isTitanic = lower.startsWith("titanic") || lower.includes("titanic");
    const isHuge = lower.startsWith("huge") || lower.includes("huge");
    const itemType = isGargantuan ? "Gargantuan Pet" : isTitanic ? "Titanic Pet" : isHuge ? "Huge Pet" : "Pet";

    // Also check extra modifiers in name
    const modifiers: string[] = [];
    if (lower.includes("shiny")) modifiers.push("Shiny");
    if (lower.includes("golden") || lower.includes("gold ")) modifiers.push("Golden");
    if (lower.includes("rainbow")) modifiers.push("Rainbow");

    return {
      name,
      itemType,
      tier: undefined,
      amount: undefined,
      weight: pct,
      totalWeight: 100,
      pct,
      isHuge,
      isTitanic,
      isGargantuan,
      modifiers,
    };
  });
}

// ───────────────────────────── Table type detector ───────────────────────────

function detectTableType(scriptName: string, entries: DropEntry[]): ScriptDropTable["tableType"] {
  const n = scriptName.toLowerCase();
  if (n.includes("egg") || n.includes("hatch")) return "egg_hatch";
  if (n.includes("boost") || n.includes("booster") || entries.some(e => e.itemType === "Consumable" && e.name.toLowerCase().includes("boost"))) return "booster";
  if (n.includes("diamond") || n.includes("currency") || entries.every(e => e.itemType === "Currency")) return "currency";
  if (n.includes("loot") || n.includes("chest") || n.includes("gift") || n.includes("prize") || n.includes("reward")) return "loot_chest";
  return "generic";
}

// ──────────────────────────────── Grouping ────────────────────────────────────

function groupEntries(entries: DropEntry[]): GroupedEntry[] {
  const map = new Map<string, GroupedEntry>();

  for (const e of entries) {
    const key = `${e.name}__${e.itemType}`;
    if (!map.has(key)) {
      map.set(key, {
        name: e.name,
        itemType: e.itemType,
        totalPct: 0,
        isHuge: e.isHuge,
        isTitanic: e.isTitanic,
        isGargantuan: e.isGargantuan,
        variants: [],
      });
    }
    const g = map.get(key)!;
    g.totalPct += e.pct;
    g.variants.push(e);
  }

  // Sort: Gargantuan → Titanic → Huge → by pct desc
  return Array.from(map.values()).sort((a, b) => {
    if (a.isGargantuan !== b.isGargantuan) return a.isGargantuan ? -1 : 1;
    if (a.isTitanic !== b.isTitanic) return a.isTitanic ? -1 : 1;
    if (a.isHuge !== b.isHuge) return a.isHuge ? -1 : 1;
    return b.totalPct - a.totalPct;
  });
}

// ──────────────────────────────── Main API ───────────────────────────────────

export interface ScriptRow {
  id: number;
  name: string;
  scriptPath: string;
  content: string | null;
  sizeBytes: number;
}

/** Build a ScriptDropTable from one script row */
export function buildDropTable(script: ScriptRow): ScriptDropTable | null {
  if (!script.content) return null;
  const c = script.content;

  let entries: DropEntry[] = [];
  let format: ScriptDropTable["format"] = "weighted";

  // Try egg-hatch format first (pets = { {"name", pct} })
  if (/\bpets\s*=\s*\{/i.test(c) || /\{\s*"[^"]+"\s*,\s*[\d.]+\s*\}/.test(c)) {
    const eggEntries = parseEggHatchTable(c);
    if (eggEntries.length >= 2) {
      entries = eggEntries;
      format = "percentage";
    }
  }

  // Fall back to weight-based
  if (entries.length === 0) {
    entries = parseWeightedTable(c);
    format = "weighted";
  }

  if (entries.length === 0) return null;

  const tableType = detectTableType(script.name, entries);

  return {
    scriptId: script.id,
    scriptName: script.name,
    scriptPath: script.scriptPath,
    tableType,
    format,
    entries,
    grouped: groupEntries(entries),
  };
}

// ──────────────────────────── Event Detection ────────────────────────────────

const GENERIC_SCRIPT_NAMES = new Set([
  "script", "localscript", "modulescript", "module", "init", "main",
  "client", "server", "handler", "service", "manager", "controller",
  "animate", "animator", "test", "debug", "debugstats", "utils", "util",
]);

// Known event cluster keyword patterns
const EVENT_CLUSTER_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /fishing|fishingEvent/i,           name: "Fishing Event" },
  { pattern: /luckyRaid|lucky.raid/i,            name: "Lucky Raid" },
  { pattern: /conveyorChest|conveyor.chest/i,    name: "Conveyor Chest Event" },
  { pattern: /towerDefense|tower.defense/i,      name: "Tower Defense" },
  { pattern: /tapHero|tap.hero|TapPower/i,       name: "Tap Heroes" },
  { pattern: /obsidian/i,                        name: "Obsidian Event" },
  { pattern: /christmas|xmas/i,                  name: "Christmas Event" },
  { pattern: /halloween|spooky/i,                name: "Halloween Event" },
  { pattern: /easter/i,                          name: "Easter Event" },
  { pattern: /summer/i,                          name: "Summer Event" },
  { pattern: /lunar|newyear/i,                   name: "Lunar New Year Event" },
  { pattern: /valentine/i,                       name: "Valentine's Event" },
  { pattern: /anniversary|birthday/i,            name: "Anniversary Event" },
];

export function detectCurrentEvent(scripts: Array<{ id: number; name: string; scriptPath: string }>): DetectedEvent {
  if (scripts.length === 0) return { name: "Unknown", confidence: "low", keywords: [], matchCount: 0 };

  // Sort by id desc — higher id = more recently added to the RBXL
  const sorted = [...scripts].sort((a, b) => b.id - a.id);

  // Look at the top 20% of scripts for event signals
  const topN = Math.max(50, Math.ceil(sorted.length * 0.20));
  const recent = sorted.slice(0, topN);

  // Count keyword hits in recent scripts
  const clusterCounts = new Map<string, number>();
  for (const s of recent) {
    const combined = `${s.name} ${s.scriptPath}`;
    for (const { pattern, name } of EVENT_CLUSTER_PATTERNS) {
      if (pattern.test(combined)) {
        clusterCounts.set(name, (clusterCounts.get(name) ?? 0) + 1);
      }
    }
  }

  if (clusterCounts.size === 0) {
    // Fallback: extract common prefix from recent non-generic script names
    const tokens = new Map<string, number>();
    for (const s of recent.slice(0, 100)) {
      const words = s.name.split(/(?=[A-Z])|[\s|_\-]+/).filter(
        (w) => w.length > 3 && !GENERIC_SCRIPT_NAMES.has(w.toLowerCase())
      );
      for (const w of words) tokens.set(w, (tokens.get(w) ?? 0) + 1);
    }
    const top = [...tokens.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      name: top.map((t) => t[0]).join(" / ") || "Recent Scripts",
      confidence: "low",
      keywords: top.map((t) => t[0]),
      matchCount: top[0]?.[1] ?? 0,
    };
  }

  const [[topEvent, topCount], ...rest] = [...clusterCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalEventScripts = [...clusterCounts.values()].reduce((s, n) => s + n, 0);
  const confidence = topCount >= 5 ? "high" : topCount >= 2 ? "medium" : "low";
  const keywords = EVENT_CLUSTER_PATTERNS
    .filter(({ pattern }) => pattern.test(topEvent.toLowerCase()))
    .map(() => topEvent.split(" ")[0]);

  return {
    name: topEvent,
    confidence,
    keywords: [topEvent, ...rest.map(([n]) => n)].slice(0, 5),
    matchCount: totalEventScripts,
  };
}

export function matchesEventKeyword(name: string, path: string, keyword: string): boolean {
  const combined = `${name} ${path}`.toLowerCase();
  const kw = keyword.toLowerCase();
  // Also check known cluster patterns
  for (const { pattern, name: clusterName } of EVENT_CLUSTER_PATTERNS) {
    if (clusterName.toLowerCase().includes(kw) && pattern.test(combined)) return true;
  }
  return combined.includes(kw.replace(/\s+/g, "")) || combined.includes(kw);
}
