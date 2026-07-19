/**
 * FFlag / DFlag / DFLog extractor for PS99.
 *
 * PS99 stores its own game-level feature flags inside the "Custom" config
 * script as a large Lua table:
 *   KEY = { Default = VALUE, Type = "boolean|number|string", Name = "Display Name", [Client = true,] ... }
 *
 * These are NOT Roblox engine FFlags — they are PS99's own game toggles that
 * control events, features, and server behaviour.
 */

export interface GameFlag {
  key: string;
  name: string;
  defaultValue: string;
  type: "boolean" | "number" | "string" | "unknown";
  isClient: boolean;
  isServer: boolean;
  category: string;       // Derived from "Category: rest" prefix in Name field
  eventHint: string | null; // Non-null if name contains an event/season keyword
  sourceScript: string;
}

const EVENT_HINT_PATTERNS: Array<[RegExp, string]> = [
  [/easter/i,      "Easter"],
  [/christmas|xmas/i, "Christmas"],
  [/halloween/i,   "Halloween"],
  [/summer/i,      "Summer"],
  [/winter/i,      "Winter"],
  [/lunar/i,       "Lunar New Year"],
  [/valentine/i,   "Valentine's"],
  [/fishing/i,     "Fishing Event"],
  [/luckyraid|lucky.raid/i, "Lucky Raid"],
  [/tapheroes|tap.hero/i,   "Tap Heroes"],
  [/obsidian/i,    "Obsidian Event"],
  [/anniversary|birthday/i, "Anniversary"],
  [/event/i,       "Event"],
];

function deriveEventHint(text: string): string | null {
  for (const [pat, hint] of EVENT_HINT_PATTERNS) {
    if (pat.test(text)) return hint;
  }
  return null;
}

function deriveCategory(name: string, key: string): string {
  // "Player Tracking: FFlag Poll Interval" → "Player Tracking"
  const colonIdx = name.indexOf(":");
  if (colonIdx > 0 && colonIdx < 40) return name.slice(0, colonIdx).trim();

  // "FFlags_BroadcastPullJitter" → "FFlags"
  const underscoreIdx = key.indexOf("_");
  if (underscoreIdx > 0 && underscoreIdx < 20) return key.slice(0, underscoreIdx);

  // "Easter2026DebugOddsFFlags" → extract leading words
  const wordMatch = key.match(/^([A-Za-z][a-z]+(?:[A-Z][a-z]+)*)/);
  if (wordMatch) return wordMatch[1];

  return "General";
}

/**
 * Parse flags from a Lua config script.
 * Handles both single-line and multi-line flag definitions.
 */
export function parseFlagsFromScript(content: string, scriptName: string): GameFlag[] {
  const flags: GameFlag[] = [];
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Look for: IDENTIFIER = {
    const entryStart = line.match(/^\s*(\w+)\s*=\s*\{(.*)$/);
    if (!entryStart) { i++; continue; }

    const key = entryStart[1];

    // Skip variable assignments (v1, v2, etc.) and Lua keywords
    if (/^v\d+$/.test(key) || ["local", "return", "end", "if", "then"].includes(key)) {
      i++;
      continue;
    }

    // Collect the block (up to closing })
    let block = entryStart[2];
    let depth = 1;
    let j = i + 1;
    while (j < lines.length && depth > 0 && j - i < 20) {
      const l = lines[j];
      for (const ch of l) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
      }
      if (depth > 0) block += " " + l;
      j++;
    }

    // Only process entries that look like flag definitions
    const hasName = /Name\s*=\s*"([^"]+)"/.test(block);
    const hasType = /Type\s*=\s*"(boolean|number|string)"/.test(block);
    const hasDefault = /Default\s*=/.test(block);

    if (!hasName) { i++; continue; }

    // Extract fields
    const nameMatch = block.match(/Name\s*=\s*"([^"]+)"/);
    const typeMatch = block.match(/Type\s*=\s*"(boolean|number|string)"/);
    const defaultMatch = block.match(/Default\s*=\s*([^,}\n]+)/);
    const clientMatch = /Client\s*=\s*true/i.test(block);
    const serverMatch = /Server\s*=\s*true/i.test(block);

    const displayName = nameMatch?.[1] ?? key;
    const flagType = (typeMatch?.[1] ?? "unknown") as GameFlag["type"];
    const defaultRaw = defaultMatch?.[1]?.trim() ?? "nil";

    const category = deriveCategory(displayName, key);
    const eventHint = deriveEventHint(displayName + " " + key);

    flags.push({
      key,
      name: displayName,
      defaultValue: defaultRaw,
      type: flagType,
      isClient: clientMatch,
      isServer: serverMatch,
      category,
      eventHint,
      sourceScript: scriptName,
    });

    i = j;
  }

  return flags;
}
