import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import {
  Zap, Search, Loader2, AlertCircle, ChevronDown, ChevronRight,
  ExternalLink, Box, Star, Crown, Gem, Package,
  Filter, RefreshCw, TrendingUp
} from "lucide-react";
import { useGetSession, getGetSessionQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";

import { SessionHeader } from "@/components/session-header";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types (mirror the backend) ──────────────────────────────────────────────
interface DropEntry {
  name: string;
  itemType: string;
  tier?: number;
  amount?: string;
  weight: number;
  totalWeight: number;
  pct: number;
  isHuge: boolean;
  isTitanic: boolean;
  isGargantuan: boolean;
  modifiers: string[];
}
interface GroupedEntry {
  name: string;
  itemType: string;
  totalPct: number;
  isHuge: boolean;
  isTitanic: boolean;
  isGargantuan: boolean;
  variants: DropEntry[];
}
interface ScriptDropTable {
  scriptId: number;
  scriptName: string;
  scriptPath: string;
  tableType: string;
  format: "weighted" | "percentage";
  entries: DropEntry[];
  grouped: GroupedEntry[];
}
interface DetectedEvent { name: string; confidence: string; keywords: string[]; matchCount: number; }
interface EventIntelResponse {
  detected: DetectedEvent;
  keyword: string;
  totalMatched: number;
  tables: ScriptDropTable[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pctToRatio(pct: number): string {
  const r = 100 / pct;
  if (r < 2)       return `${pct.toFixed(2)}%`;
  if (r < 100)     return `1 in ${r.toFixed(1)}`;
  if (r < 10_000)  return `1 in ${Math.round(r).toLocaleString()}`;
  if (r < 1_000_000) return `1 in ${(r / 1000).toFixed(1)}k`;
  return `1 in ${(r / 1_000_000).toFixed(2)}M`;
}

function rarityColor(pct: number): string {
  if (pct >= 50)   return "text-green-400";
  if (pct >= 10)   return "text-blue-400";
  if (pct >= 1)    return "text-violet-400";
  if (pct >= 0.1)  return "text-orange-400";
  if (pct >= 0.01) return "text-yellow-400";
  return "text-red-400";
}

function itemTypeIcon(type: string, isHuge: boolean, isTitanic: boolean, isGarg: boolean) {
  if (isGarg)  return <Crown className="w-3.5 h-3.5 text-red-400" />;
  if (isTitanic) return <Star className="w-3.5 h-3.5 text-purple-400" />;
  if (isHuge)  return <Gem className="w-3.5 h-3.5 text-orange-400" />;
  if (type === "Lootbox") return <Package className="w-3.5 h-3.5 text-chart-2" />;
  if (type === "Pet") return <Box className="w-3.5 h-3.5 text-primary" />;
  return <div className="w-3.5 h-3.5 rounded-sm bg-muted-foreground/30" />;
}

function tableTypeLabel(t: string) {
  const MAP: Record<string, { label: string; color: string }> = {
    loot_chest: { label: "Chest / Gift", color: "border-yellow-500/40 text-yellow-400" },
    egg_hatch:  { label: "Egg Hatch",    color: "border-green-500/40  text-green-400" },
    booster:    { label: "Booster",      color: "border-blue-500/40   text-blue-400" },
    currency:   { label: "Currency",     color: "border-primary/40    text-primary" },
    generic:    { label: "General",      color: "border-border        text-muted-foreground" },
  };
  return MAP[t] ?? MAP.generic;
}

const TABLE_TYPE_ORDER: Record<string, number> = {
  egg_hatch: 0, loot_chest: 1, booster: 2, currency: 3, generic: 4,
};

// ─── Drop table row ───────────────────────────────────────────────────────────
function GroupedRow({ entry, sessionId, scriptId }: { entry: GroupedEntry; sessionId: number; scriptId: number }) {
  const [open, setOpen] = useState(false);
  const hasVariants = entry.variants.length > 1;
  const pctColor = rarityColor(entry.totalPct);
  const isSpecial = entry.isGargantuan || entry.isTitanic || entry.isHuge;

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/40 transition-colors group cursor-pointer",
          isSpecial ? "bg-orange-500/5 hover:bg-orange-500/10" : "hover:bg-accent/30",
          open && "bg-accent/20"
        )}
        onClick={() => hasVariants && setOpen(!open)}
      >
        <td className="px-3 py-2 w-5">
          {hasVariants
            ? (open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />)
            : <div className="w-3 h-3" />}
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-2">
            {itemTypeIcon(entry.itemType, entry.isHuge, entry.isTitanic, entry.isGargantuan)}
            <span className={cn("text-xs font-mono font-medium", isSpecial ? "text-foreground" : "text-foreground/90")}>
              {entry.name}
            </span>
            {entry.isGargantuan && <Badge className="text-[8px] h-3.5 px-1 bg-red-500/20 text-red-400 border-red-500/30">GARG</Badge>}
            {entry.isTitanic  && <Badge className="text-[8px] h-3.5 px-1 bg-purple-500/20 text-purple-400 border-purple-500/30">TITAN</Badge>}
            {entry.isHuge     && <Badge className="text-[8px] h-3.5 px-1 bg-orange-500/20 text-orange-400 border-orange-500/30">HUGE</Badge>}
          </div>
        </td>
        <td className="px-2 py-2 text-xs text-muted-foreground font-mono">{entry.itemType}</td>
        <td className={cn("px-3 py-2 text-right text-sm font-mono font-bold tabular-nums", pctColor)}>
          {entry.totalPct >= 0.001 ? `${entry.totalPct.toFixed(entry.totalPct < 0.1 ? 4 : entry.totalPct < 1 ? 3 : 2)}%` : `${entry.totalPct.toExponential(2)}%`}
        </td>
        <td className={cn("px-3 py-2 text-right text-xs font-mono tabular-nums", pctColor, "opacity-80")}>
          {pctToRatio(entry.totalPct)}
        </td>
        <td className="px-2 py-2 text-right">
          <Link
            href={`/sessions/${sessionId}?scriptId=${scriptId}`}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-primary" />
          </Link>
        </td>
      </tr>
      {open && entry.variants.map((v, vi) => (
        <tr key={vi} className="border-b border-border/20 bg-muted/20 hover:bg-muted/30">
          <td />
          <td className="px-2 py-1.5 pl-8 text-[11px] font-mono text-muted-foreground">
            {v.tier ? `Tier ${v.tier}` : v.amount ? `×${v.amount}` : `variant ${vi + 1}`}
          </td>
          <td />
          <td className={cn("px-3 py-1.5 text-right text-[11px] font-mono tabular-nums", rarityColor(v.pct))}>
            {v.pct.toFixed(4)}%
          </td>
          <td className={cn("px-3 py-1.5 text-right text-[11px] font-mono tabular-nums", rarityColor(v.pct))}>
            {pctToRatio(v.pct)}
          </td>
          <td />
        </tr>
      ))}
    </>
  );
}

// ─── Drop table card ───────────────────────────────────────────────────────────
function DropTableCard({ table, sessionId, search }: { table: ScriptDropTable; sessionId: number; search: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const { label, color } = tableTypeLabel(table.tableType);

  const filteredGroups = useMemo(() => {
    if (!search) return table.grouped;
    const kw = search.toLowerCase();
    return table.grouped.filter((g) => g.name.toLowerCase().includes(kw) || g.itemType.toLowerCase().includes(kw));
  }, [table.grouped, search]);

  const hugeCount   = table.grouped.filter(g => g.isHuge).length;
  const titanCount  = table.grouped.filter(g => g.isTitanic).length;
  const gargCount   = table.grouped.filter(g => g.isGargantuan).length;

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card/40 hover:border-border/80 transition-colors">
      {/* Card header */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
          <span className="text-sm font-mono font-semibold truncate">{table.scriptName}</span>
          <Badge variant="outline" className={cn("text-[9px] h-4 px-1 shrink-0 border", color)}>{label}</Badge>
          <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 text-muted-foreground">
            {table.format === "percentage" ? "%" : "W"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {gargCount > 0 && <Badge className="text-[8px] h-4 px-1 bg-red-500/20 text-red-400">{gargCount} Garg</Badge>}
          {titanCount > 0 && <Badge className="text-[8px] h-4 px-1 bg-purple-500/20 text-purple-400">{titanCount} Titan</Badge>}
          {hugeCount > 0 && <Badge className="text-[8px] h-4 px-1 bg-orange-500/20 text-orange-400">{hugeCount} Huge</Badge>}
          <span className="text-[10px] text-muted-foreground font-mono">{table.grouped.length} items</span>
        </div>
      </button>

      {/* Table */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-background/40">
                <th className="w-5" />
                <th className="px-2 py-1.5 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Item</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Chance %</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">1 in X</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filteredGroups.length === 0 ? (
                <tr><td colSpan={6} className="py-4 text-center text-xs text-muted-foreground font-mono">NO_MATCHING_ITEMS</td></tr>
              ) : (
                filteredGroups.map((g, i) => (
                  <GroupedRow key={`${g.name}-${i}`} entry={g} sessionId={sessionId} scriptId={table.scriptId} />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SessionEvent() {
  const params = useParams();
  const sessionId = parseInt(params.id || "0", 10);

  const [eventSearch, setEventSearch] = useState("");
  const [itemSearch,  setItemSearch]  = useState("");
  const [typeFilter,  setTypeFilter]  = useState<string>("all");
  const [submittedSearch, setSubmittedSearch] = useState("");

  const { data: session, isLoading: isLoadingSession } = useGetSession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) },
  });

  const { data, isLoading, error, refetch } = useQuery<EventIntelResponse>({
    queryKey: ["event-intel", sessionId, submittedSearch],
    queryFn: async () => {
      const url = submittedSearch
        ? `/api/sessions/${sessionId}/event-intel?search=${encodeURIComponent(submittedSearch)}`
        : `/api/sessions/${sessionId}/event-intel`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: !!sessionId,
    staleTime: 60_000,
  });

  const handleSearch = () => setSubmittedSearch(eventSearch.trim());

  const sortedTables = useMemo(() => {
    if (!data?.tables) return [];
    let t = [...data.tables];
    if (typeFilter !== "all") t = t.filter(tbl => tbl.tableType === typeFilter);
    return t.sort((a, b) => (TABLE_TYPE_ORDER[a.tableType] ?? 9) - (TABLE_TYPE_ORDER[b.tableType] ?? 9));
  }, [data?.tables, typeFilter]);

  // Highlight counts
  const hugeTotal   = useMemo(() => data?.tables.reduce((s, t) => s + t.grouped.filter(g => g.isHuge).length,      0) ?? 0, [data]);
  const titanTotal  = useMemo(() => data?.tables.reduce((s, t) => s + t.grouped.filter(g => g.isTitanic).length,    0) ?? 0, [data]);
  const gargTotal   = useMemo(() => data?.tables.reduce((s, t) => s + t.grouped.filter(g => g.isGargantuan).length, 0) ?? 0, [data]);

  if (!session && isLoadingSession) {
    return <div className="min-h-[100dvh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background h-screen overflow-hidden">
      <SessionHeader sessionId={sessionId} sessionName={session?.originalName} activeTab="event" />

      <main className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* ── Left: event selector ──────────────────────────────────────── */}
          <ResizablePanel defaultSize={24} minSize={18} maxSize={35} className="flex flex-col bg-card/30 border-r border-border">
            <div className="p-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Event Intel</span>
              </div>

              {/* Detected event badge */}
              {data?.detected && (
                <div className={cn(
                  "mb-3 rounded-md p-2.5 border text-xs",
                  data.detected.confidence === "high"
                    ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                    : data.detected.confidence === "medium"
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                    : "bg-muted/30 border-border text-muted-foreground"
                )}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap className="w-3 h-3" />
                    <span className="font-semibold">{data.detected.name}</span>
                    <Badge className={cn("ml-auto text-[8px] h-3.5 px-1",
                      data.detected.confidence === "high" ? "bg-yellow-500/20 text-yellow-400" :
                      data.detected.confidence === "medium" ? "bg-blue-500/20 text-blue-400" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {data.detected.confidence.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-[10px] opacity-70">{data.detected.matchCount} matching scripts</div>
                </div>
              )}

              {/* Event search */}
              <div className="flex gap-1.5 mb-3">
                <Input
                  placeholder="Search event (e.g. tap heroes)"
                  className="h-8 text-xs font-mono bg-background flex-1"
                  value={eventSearch}
                  onChange={e => setEventSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
                <Button size="sm" className="h-8 px-2 shrink-0" onClick={handleSearch}>
                  <Search className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Quick event presets */}
              <div className="flex flex-col gap-1">
                <p className="text-[10px] text-muted-foreground font-mono mb-0.5">QUICK SEARCH</p>
                {[
                  ["Tap Heroes", "tap heroes"],
                  ["Lucky Raid", "lucky raid"],
                  ["Conveyor Chest", "conveyor"],
                  ["Fishing Event", "fishing"],
                  ["Tower Defense", "tower defense"],
                  ["Christmas", "christmas"],
                  ["Easter", "easter"],
                ].map(([label, kw]) => (
                  <button
                    key={kw}
                    onClick={() => { setEventSearch(kw); setSubmittedSearch(kw); }}
                    className={cn(
                      "text-left text-xs font-mono px-2 py-1.5 rounded-sm transition-colors border",
                      submittedSearch === kw
                        ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-300"
                        : "border-transparent hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    ⚡ {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Type filter */}
            <div className="p-3 border-b border-border shrink-0">
              <p className="text-[10px] text-muted-foreground font-mono mb-2">TABLE TYPE</p>
              <div className="flex flex-col gap-1">
                {[
                  ["all", "All Tables"],
                  ["egg_hatch", "🥚 Egg Hatch"],
                  ["loot_chest", "🎁 Chest / Gift"],
                  ["booster", "⚡ Boosters"],
                  ["currency", "💎 Currency"],
                  ["generic", "📦 General"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setTypeFilter(v)}
                    className={cn(
                      "text-left text-xs font-mono px-2 py-1.5 rounded-sm transition-colors",
                      typeFilter === v
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            {data && (
              <div className="p-3 mt-auto border-t border-border shrink-0 space-y-1.5">
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Drop Stats</div>
                {gargTotal > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-red-400 font-mono">Gargantuan entries</span>
                    <Badge className="bg-red-500/20 text-red-400 text-[10px]">{gargTotal}</Badge>
                  </div>
                )}
                {titanTotal > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-400 font-mono">Titanic entries</span>
                    <Badge className="bg-purple-500/20 text-purple-400 text-[10px]">{titanTotal}</Badge>
                  </div>
                )}
                {hugeTotal > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-orange-400 font-mono">Huge entries</span>
                    <Badge className="bg-orange-500/20 text-orange-400 text-[10px]">{hugeTotal}</Badge>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-mono">Tables loaded</span>
                  <span className="text-foreground font-mono">{data.tables.length}</span>
                </div>
              </div>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── Right: drop tables ───────────────────────────────────────── */}
          <ResizablePanel defaultSize={76}>
            <div className="flex flex-col h-full">
              {/* Toolbar */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card/30 shrink-0">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter items across all tables..."
                    className="pl-8 h-8 text-xs font-mono bg-background"
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                  />
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => refetch()}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Refresh
                </Button>
                {data && (
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    {sortedTables.length} tables · {data.totalMatched} matched scripts
                  </span>
                )}
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 flex flex-col gap-3 max-w-6xl">
                  {isLoading ? (
                    <div className="flex flex-col gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-md" />
                      ))}
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <AlertCircle className="w-12 h-12 mb-4 text-destructive opacity-50" />
                      <p className="font-mono text-sm text-muted-foreground">FAILED_TO_LOAD_EVENT_DATA</p>
                      <p className="text-xs text-muted-foreground mt-1">{String(error)}</p>
                    </div>
                  ) : sortedTables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-50">
                      <Zap className="w-16 h-16 mb-4 opacity-30" />
                      <h3 className="text-lg font-mono font-bold tracking-widest">NO_EVENT_DATA</h3>
                      <p className="text-sm mt-1">Try a different event keyword on the left, or upload the event map.</p>
                    </div>
                  ) : (
                    sortedTables.map((table) => (
                      <DropTableCard
                        key={table.scriptId}
                        table={table}
                        sessionId={sessionId}
                        search={itemSearch}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
