/**
 * Game mechanics analyzer — scans Lua source for key patterns.
 * Captures full multi-line table blocks when a match opens a `{`.
 */

export interface Finding {
  scriptId: number;
  scriptName: string;
  lineNumber: number;
  snippet: string;
  value: string | null;
}

interface TopicDef {
  name: string;
  category: string;
  patterns: RegExp[];
}

const TOPIC_DEFS: TopicDef[] = [
  {
    name: "Hatch Chances",
    category: "hatch_chances",
    patterns: [
      /hatch\s*chance/i,
      /hatchChance/i,
      /\bprobability\b/i,
      /\bchance\s*=\s*[\d.]+/i,
      /hatchchances/i,
      /hatch_rate/i,
      /droprate/i,
      /drop_rate/i,
      // PS99-style: `pets = {` inside an egg module
      /^\s*pets\s*=\s*\{/,
      // inline pet entry: {"PetName", number}
      /\{\s*"[^"]+"\s*,\s*[\d.]+\s*\}/,
    ],
  },
  {
    name: "Egg Rates",
    category: "egg_rates",
    patterns: [
      /\begg\b.*rate/i,
      /EggData/i,
      /EggConfig/i,
      /\beggs\s*=\s*\{/,
      /EggTable/i,
      /EggChance/i,
      /OpenEgg/i,
      /eggpool/i,
      /\beggweight/i,
      /overrideCost/i,
      /isCustomEgg/i,
    ],
  },
  {
    name: "Pet Data",
    category: "pets",
    patterns: [
      /PetData/i,
      /PetConfig/i,
      /PetTable/i,
      /petName/i,
      /\bpetRarity/i,
      /\bPetRarities/i,
      /petMultiplier/i,
      /petPassive/i,
      /PetShiny/i,
      /\bgolden\s*pet/i,
      /\bhuge\s*pet/i,
    ],
  },
  {
    name: "Game Mechanics",
    category: "game_mechanics",
    patterns: [
      /\bmultiplier\b/i,
      /\bboost\b.*=\s*[\d.]+/i,
      /\bpassive\b/i,
      /\bAutoFarm/i,
      /\btap\s*power/i,
      /TapPower/i,
      /\brebirth\b/i,
      /\bprestige\b/i,
      /\brank\b.*=\s*\{/i,
      /TeamBonus/i,
      /\bspawnrate\b/i,
      /\bspawn_rate\b/i,
      /\bdamage\b.*=\s*[\d.]+/i,
      /StrengthPowerBoost/i,
      /ZoneNumberRequired/i,
      /RebirthUnlocks/i,
    ],
  },
  {
    name: "Currencies",
    category: "currencies",
    patterns: [
      /\bCoins\b/,
      /\bGems\b/,
      /\bdiamonds\b/i,
      /\bcurrency\b/i,
      /\bTokens\b/,
      /\bStardust\b/,
      /\bcurrencies\s*=/,
      /AddCurrency/i,
      /RemoveCurrency/i,
      /\bcoinMultiplier\b/i,
      /MarbleCoins/i,
    ],
  },
  {
    name: "Shops",
    category: "shops",
    patterns: [
      /\bShop\b.*=\s*\{/,
      /\bstore\b.*=\s*\{/i,
      /\bbuy\s*function\b/i,
      /\bpurchase\b/i,
      /ShopData/i,
      /ItemPrice/i,
      /\bprice\s*=\s*[\d]+/i,
      /shopItems/i,
      /ShopConfig/i,
    ],
  },
  {
    name: "Events",
    category: "events",
    patterns: [
      /\bEvent\b.*=\s*\{/,
      /\blimited\b/i,
      /\bseasonal\b/i,
      /\bEventData/i,
      /\bHoliday\b/i,
      /\bEventPet/i,
      /EventReward/i,
      /\btimed.*event/i,
    ],
  },
  {
    name: "Rarities",
    category: "other",
    patterns: [
      /\bCommon\b.*=\s*[\d.]+/,
      /\bUncommon\b.*=\s*[\d.]+/,
      /\bRare\b.*=\s*[\d.]+/,
      /\bEpic\b.*=\s*[\d.]+/,
      /\bLegendary\b.*=\s*[\d.]+/,
      /\bMythic\b.*=\s*[\d.]+/,
      /\bDivine\b.*=\s*[\d.]+/,
      /\bPrismatic\b.*=\s*[\d.]+/,
      /\bExclusive\b.*=\s*[\d.]+/,
      /RarityData/i,
      /rarities\s*=/i,
    ],
  },
];

export interface AnalysisResult {
  topicName: string;
  category: string;
  findings: Finding[];
}

/** Capture the full Lua table block starting at line i (which ends with `{`). */
function captureBlock(lines: string[], startLine: number): string {
  let depth = 0;
  for (const ch of lines[startLine]) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
  }
  const collected: string[] = [lines[startLine]];
  for (let j = startLine + 1; j < lines.length; j++) {
    const l = lines[j];
    collected.push(l);
    for (const ch of l) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    if (depth <= 0) break;
    // Hard cap so we never collect > 60 lines for one finding
    if (collected.length >= 60) break;
  }
  return collected.join("\n");
}

export function analyzeScript(
  scriptId: number,
  scriptName: string,
  content: string
): AnalysisResult[] {
  const lines = content.split("\n");
  const results: AnalysisResult[] = [];

  for (const def of TOPIC_DEFS) {
    const findings: Finding[] = [];
    // Track which source lines are already covered by a finding to avoid duplication
    const covered = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      if (covered.has(i)) continue;
      const line = lines[i];

      for (const pattern of def.patterns) {
        if (!pattern.test(line)) continue;
        const trimmed = line.trim();
        if (trimmed.length < 2) break;

        let snippet: string;
        let endLine: number;

        // If the line opens a Lua table block, capture the whole block
        if (/\{\s*$/.test(trimmed)) {
          snippet = captureBlock(lines, i);
          endLine = i + snippet.split("\n").length - 1;
        } else {
          // Context window: a few lines before + after
          const ctxStart = Math.max(0, i - 1);
          endLine = Math.min(i + 6, lines.length - 1);
          snippet = lines.slice(ctxStart, endLine + 1).join("\n");
        }

        // Mark all covered lines
        for (let k = i; k <= endLine; k++) covered.add(k);

        // Truncate snippet to 1200 chars so DB stays sane
        const truncated = snippet.length > 1200 ? snippet.slice(0, 1200) + "\n-- [truncated]" : snippet;

        const valMatch = line.match(/=\s*([\d.]+)/);
        findings.push({
          scriptId,
          scriptName,
          lineNumber: i + 1,
          snippet: truncated,
          value: valMatch ? valMatch[1] : null,
        });
        break; // only one finding per line per topic
      }
    }

    if (findings.length > 0) {
      results.push({
        topicName: def.name,
        category: def.category,
        findings,
      });
    }
  }

  return results;
}
