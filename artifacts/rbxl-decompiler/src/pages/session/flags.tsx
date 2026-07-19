import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { Flag, Search, Loader2, AlertCircle, ToggleLeft, Hash, Type, Cpu, Zap } from "lucide-react";
import { useGetSession, getGetSessionQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";

import { SessionHeader } from "@/components/session-header";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface GameFlag {
  key: string;
  name: string;
  defaultValue: string;
  type: "boolean" | "number" | "string" | "unknown";
  isClient: boolean;
  isServer: boolean;
  category: string;
  eventHint: string | null;
  sourceScript: string;
}

interface FlagsResponse {
  total: number;
  filtered: number;
  categories: Array<{ name: string; count: number }>;
  flags: GameFlag[];
}

function typeIcon(t: GameFlag["type"]) {
  if (t === "boolean") return <ToggleLeft className="w-3.5 h-3.5 text-green-400" />;
  if (t === "number")  return <Hash className="w-3.5 h-3.5 text-blue-400" />;
  if (t === "string")  return <Type className="w-3.5 h-3.5 text-violet-400" />;
  return <Cpu className="w-3.5 h-3.5 text-muted-foreground" />;
}

function defaultValueBadge(val: string, type: GameFlag["type"]) {
  const v = val.trim();
  if (v === "true")  return <Badge className="text-[9px] h-4 px-1 bg-green-500/20 text-green-400 font-mono">true</Badge>;
  if (v === "false") return <Badge className="text-[9px] h-4 px-1 bg-red-500/20 text-red-400 font-mono">false</Badge>;
  if (v === "nil")   return <Badge className="text-[9px] h-4 px-1 bg-muted text-muted-foreground font-mono">nil</Badge>;
  return <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{v.slice(0, 30)}</Badge>;
}

export default function SessionFlags() {
  const params = useParams();
  const sessionId = parseInt(params.id || "0", 10);

  const [search, setSearch]             = useState("");
  const [selectedCat, setSelectedCat]  = useState<string | null>(null);
  const [eventOnly, setEventOnly]       = useState(false);

  const { data: session } = useGetSession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) },
  });

  const { data, isLoading, error } = useQuery<FlagsResponse>({
    queryKey: ["fflags", sessionId],
    queryFn: async () => {
      const r = await fetch(`/api/sessions/${sessionId}/fflags`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: !!sessionId,
    staleTime: 120_000,
  });

  const filteredFlags = useMemo(() => {
    if (!data?.flags) return [];
    let f = data.flags;
    if (eventOnly) f = f.filter(fl => fl.eventHint !== null);
    if (selectedCat) f = f.filter(fl => fl.category === selectedCat);
    if (search) {
      const kw = search.toLowerCase();
      f = f.filter(fl =>
        fl.key.toLowerCase().includes(kw) ||
        fl.name.toLowerCase().includes(kw) ||
        fl.category.toLowerCase().includes(kw) ||
        (fl.eventHint?.toLowerCase().includes(kw) ?? false)
      );
    }
    return f;
  }, [data?.flags, search, selectedCat, eventOnly]);

  const eventCategories = useMemo(() =>
    data?.flags.filter(f => f.eventHint).map(f => f.eventHint!).reduce<Record<string, number>>((acc, h) => {
      acc[h] = (acc[h] ?? 0) + 1; return acc;
    }, {}), [data?.flags]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background h-screen overflow-hidden">
      <SessionHeader sessionId={sessionId} sessionName={session?.originalName} activeTab="flags" />

      <main className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* ── Left sidebar ──────────────────────────────────────────────── */}
          <ResizablePanel defaultSize={24} minSize={18} maxSize={35} className="flex flex-col bg-card/30 border-r border-border">
            <div className="p-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Flag className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Game Flags</span>
                {data && (
                  <Badge className="ml-auto text-[9px] bg-violet-500/20 text-violet-400">{data.total}</Badge>
                )}
              </div>

              {/* Event-only toggle */}
              <button
                onClick={() => setEventOnly(!eventOnly)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono border transition-colors mb-3",
                  eventOnly
                    ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-300"
                    : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Zap className="w-3.5 h-3.5" />
                ⚡ Event flags only
                {eventOnly && data && (
                  <Badge className="ml-auto text-[8px] bg-yellow-500/20 text-yellow-400">
                    {data.flags.filter(f => f.eventHint).length}
                  </Badge>
                )}
              </button>

              {/* All categories */}
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Categories</div>
              <ScrollArea className="h-64">
                <div className="flex flex-col gap-0.5 pr-1">
                  <button
                    onClick={() => setSelectedCat(null)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 rounded-sm text-xs font-mono transition-colors",
                      selectedCat === null
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <span>All Categories</span>
                    <span className="text-[10px]">{data?.total ?? "…"}</span>
                  </button>
                  {data?.categories.map(cat => (
                    <button
                      key={cat.name}
                      onClick={() => setSelectedCat(cat.name === selectedCat ? null : cat.name)}
                      className={cn(
                        "flex items-center justify-between px-2 py-1.5 rounded-sm text-xs font-mono transition-colors",
                        selectedCat === cat.name
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                    >
                      <span className="truncate pr-2">{cat.name}</span>
                      <span className="text-[10px] shrink-0">{cat.count}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Event hints summary */}
            {eventCategories && Object.keys(eventCategories).length > 0 && (
              <div className="p-3 border-t border-border shrink-0">
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Event Hints</div>
                <div className="flex flex-col gap-1">
                  {Object.entries(eventCategories)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([hint, count]) => (
                      <div key={hint} className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-yellow-400/80 truncate">{hint}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── Right: flag table ────────────────────────────────────────── */}
          <ResizablePanel defaultSize={76}>
            <div className="flex flex-col h-full">
              {/* Search bar */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card/30 shrink-0">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search flags by key, name, or category..."
                    className="pl-8 h-8 text-xs font-mono bg-background"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                  {filteredFlags.length} / {data?.total ?? "…"} flags
                </span>
              </div>

              <ScrollArea className="flex-1">
                {isLoading ? (
                  <div className="p-4 flex flex-col gap-2">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-sm" />)}
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertCircle className="w-12 h-12 mb-4 text-destructive opacity-50" />
                    <p className="font-mono text-sm text-muted-foreground">FAILED_TO_LOAD_FLAGS</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      No flag definitions found. Flags are extracted from the large "Custom" config script — ensure the session was fully decompiled.
                    </p>
                  </div>
                ) : filteredFlags.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-50">
                    <Flag className="w-16 h-16 mb-4 opacity-30" />
                    <h3 className="text-lg font-mono font-bold tracking-widest">NO_FLAGS_FOUND</h3>
                    <p className="text-sm mt-1">Try clearing filters or adjusting your search.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border bg-card/80 backdrop-blur-sm">
                        <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider w-8" />
                        <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Key</th>
                        <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Display Name</th>
                        <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider w-24">Category</th>
                        <th className="px-3 py-2 text-center text-[10px] font-mono text-muted-foreground uppercase tracking-wider w-20">Default</th>
                        <th className="px-3 py-2 text-center text-[10px] font-mono text-muted-foreground uppercase tracking-wider w-20">Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFlags.map((flag) => (
                        <tr
                          key={flag.key}
                          className={cn(
                            "border-b border-border/40 hover:bg-accent/30 transition-colors group",
                            flag.eventHint && "bg-yellow-500/5"
                          )}
                        >
                          <td className="px-3 py-2 w-8">
                            <div className="flex items-center gap-1">
                              {typeIcon(flag.type)}
                              {flag.eventHint && <Zap className="w-2.5 h-2.5 text-yellow-400" />}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-foreground/80 max-w-[180px]">
                            <span className="truncate block" title={flag.key}>{flag.key}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[280px]">
                            <span className="truncate block" title={flag.name}>{flag.name}</span>
                            {flag.eventHint && (
                              <span className="text-[9px] text-yellow-400/70">⚡ {flag.eventHint}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-muted-foreground font-mono truncate max-w-[100px]" title={flag.category}>
                            {flag.category}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {defaultValueBadge(flag.defaultValue, flag.type)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {flag.isClient && <Badge className="text-[8px] h-3.5 px-1 bg-chart-2/20 text-chart-2">C</Badge>}
                              {flag.isServer && <Badge className="text-[8px] h-3.5 px-1 bg-chart-3/20 text-chart-3">S</Badge>}
                              {!flag.isClient && !flag.isServer && (
                                <Badge className="text-[8px] h-3.5 px-1 bg-muted text-muted-foreground">—</Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
