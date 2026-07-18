/**
 * Game mechanics analyzer — scans Lua source for key patterns
 * (hatch chances, egg rates, pets, currencies, shops, events, etc.)
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
    ],
  },
  {
    name: "Egg Rates",
    category: "egg_rates",
    patterns: [
      /\begg\b.*rate/i,
      /EggData/i,
      /EggConfig/i,
      /\beggs\s*=/,
      /EggTable/i,
      /EggChance/i,
      /OpenEgg/i,
      /eggpool/i,
      /\beggweight/i,
    ],
  },
  {
    name: "Pet Data",
    category: "pets",
    patterns: [
      /PetData/i,
      /PetConfig/i,
      /\bpets\s*=/,
      /PetTable/i,
      /petName/i,
      /\bpetRarity/i,
      /\bPetRarities/i,
      /petMultiplier/i,
      /petPassive/i,
      /PetShiny/i,
      /\bgolden\s*pet/i,
      /\brainbow\s*pet/i,
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

export function analyzeScript(
  scriptId: number,
  scriptName: string,
  content: string
): AnalysisResult[] {
  const lines = content.split("\n");
  const results: AnalysisResult[] = [];

  for (const def of TOPIC_DEFS) {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of def.patterns) {
        if (pattern.test(line)) {
          const trimmed = line.trim();
          if (trimmed.length < 2) continue;

          // Try to extract numeric value
          const valMatch = line.match(/=\s*([\d.]+)/);
          findings.push({
            scriptId,
            scriptName,
            lineNumber: i + 1,
            snippet: trimmed.slice(0, 200),
            value: valMatch ? valMatch[1] : null,
          });
          break; // one finding per line
        }
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
