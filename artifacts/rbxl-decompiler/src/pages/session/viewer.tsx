import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  FileCode2,
  Search,
  Filter,
  Download,
  ArchiveRestore,
  AlertTriangle,
  Loader2,
  Box,
  FileJson,
  FileText,
  Terminal,
  SortAsc,
  Zap,
} from "lucide-react";

import {
  useGetSession,
  useGetSessionScripts,
  useGetScript,
  getGetSessionQueryKey,
  getGetSessionScriptsQueryKey,
  getGetScriptQueryKey,
} from "@workspace/api-client-react";
import type { ScriptScriptType } from "@workspace/api-client-react/src/generated/api.schemas";

import { SessionHeader } from "@/components/session-header";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatBytes } from "@/lib/utils";

const SCRIPT_ICONS: Record<ScriptScriptType, React.ElementType> = {
  Script: FileCode2,
  LocalScript: FileJson,
  ModuleScript: Box,
};

const SCRIPT_COLORS: Record<ScriptScriptType, string> = {
  Script: "text-primary",
  LocalScript: "text-chart-2",
  ModuleScript: "text-chart-3",
};

// Keywords that indicate event / limited-time content in PS99
const EVENT_KEYWORDS = [
  "event", "limited", "holiday", "christmas", "halloween", "summer",
  "winter", "spring", "autumn", "seasonal", "lunar", "valentine",
  "easter", "birthday", "anniversary", "collab",
];

function isEventScript(name: string, path: string) {
  const haystack = (name + " " + path).toLowerCase();
  return EVENT_KEYWORDS.some((k) => haystack.includes(k));
}

type SortMode = "alpha" | "newest" | "largest" | "events";

export default function SessionViewer() {
  const params = useParams();
  const [location] = useLocation();
  const sessionId = parseInt(params.id || "0", 10);

  const queryParams = new URLSearchParams(location.split("?")[1] || "");
  const initialScriptIdStr = queryParams.get("scriptId");

  // ── State ──────────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(
    initialScriptIdStr ? parseInt(initialScriptIdStr, 10) : null
  );

  // ── Refs ───────────────────────────────────────────────────────────────────
  const prismRefs = useRef<{
    script?: HTMLScriptElement;
    lua?: HTMLScriptElement;
    lineNumbers?: HTMLScriptElement;
    css?: HTMLLinkElement;
  }>({});

  // ── Data fetching (ALL hooks BEFORE effects that reference their values) ───
  const { data: session, isLoading: isLoadingSession } = useGetSession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) },
  });

  const { data: scripts, isLoading: isLoadingScripts } = useGetSessionScripts(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionScriptsQueryKey(sessionId) },
  });

  const { data: scriptContent, isLoading: isLoadingContent } = useGetScript(
    sessionId,
    selectedScriptId as number,
    {
      query: {
        enabled: !!sessionId && !!selectedScriptId,
        queryKey: getGetScriptQueryKey(sessionId, selectedScriptId as number),
      },
    }
  );

  // ── Effects (safe to reference scriptContent now) ──────────────────────────
  useEffect(() => {
    if ((window as any).Prism) return; // already loaded

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js";
    script.async = true;
    document.body.appendChild(script);
    prismRefs.current.script = script;

    const lua = document.createElement("script");
    lua.src = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-lua.min.js";
    lua.async = true;
    document.body.appendChild(lua);
    prismRefs.current.lua = lua;

    const lineNumbers = document.createElement("script");
    lineNumbers.src =
      "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.js";
    lineNumbers.async = true;
    document.body.appendChild(lineNumbers);
    prismRefs.current.lineNumbers = lineNumbers;

    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href =
      "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.css";
    document.head.appendChild(css);
    prismRefs.current.css = css;

    return () => {
      const refs = prismRefs.current;
      if (refs.script && document.body.contains(refs.script)) document.body.removeChild(refs.script);
      if (refs.lua && document.body.contains(refs.lua)) document.body.removeChild(refs.lua);
      if (refs.lineNumbers && document.body.contains(refs.lineNumbers))
        document.body.removeChild(refs.lineNumbers);
      if (refs.css && document.head.contains(refs.css)) document.head.removeChild(refs.css);
    };
  }, []);

  useEffect(() => {
    if (scriptContent && (window as any).Prism) {
      setTimeout(() => (window as any).Prism.highlightAll(), 50);
    }
  }, [scriptContent]);

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const handleDownloadAll = useCallback(() => {
    const a = document.createElement("a");
    a.href = `/api/sessions/${sessionId}/download-all`;
    a.download = `session_${sessionId}_scripts.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [sessionId]);

  const handleDownloadScript = useCallback(() => {
    if (!scriptContent) return;
    const a = document.createElement("a");
    a.href = `/api/sessions/${sessionId}/scripts/${scriptContent.id}/download`;
    a.download = `${scriptContent.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}.lua`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [sessionId, scriptContent]);

  // ── Derived: filter + sort ─────────────────────────────────────────────────
  const allScripts = scripts ?? [];

  const filtered = allScripts.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.scriptPath.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilters.length === 0 || typeFilters.includes(s.scriptType);
    const matchesEvent =
      !typeFilters.includes("Events") || isEventScript(s.name, s.scriptPath);
    return matchesSearch && matchesType && matchesEvent;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case "newest":
        // Higher DB id = later in RBXL file = more recently modified in-game
        return b.id - a.id;
      case "largest":
        return b.sizeBytes - a.sizeBytes;
      case "events": {
        const aEv = isEventScript(a.name, a.scriptPath) ? 0 : 1;
        const bEv = isEventScript(b.name, b.scriptPath) ? 0 : 1;
        if (aEv !== bEv) return aEv - bEv;
        return b.sizeBytes - a.sizeBytes; // within group: largest first
      }
      case "alpha":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoadingSession) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center font-mono">
        SESSION_NOT_FOUND
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background h-screen overflow-hidden">
      <SessionHeader sessionId={sessionId} sessionName={session.originalName} activeTab="scripts" />

      <main className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <ResizablePanel
            defaultSize={25}
            minSize={15}
            maxSize={40}
            className="flex flex-col bg-card/30 border-r border-border"
          >
            {/* Search */}
            <div className="p-3 border-b border-border flex flex-col gap-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search scripts..."
                  className="pl-8 h-9 text-xs font-mono bg-background"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Sort */}
              <div className="flex items-center gap-2">
                <SortAsc className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                  <SelectTrigger className="h-7 text-[11px] font-mono flex-1 bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest" className="text-xs font-mono">
                      🕐 Newest First
                    </SelectItem>
                    <SelectItem value="events" className="text-xs font-mono">
                      ⚡ Events First
                    </SelectItem>
                    <SelectItem value="largest" className="text-xs font-mono">
                      📦 Largest First
                    </SelectItem>
                    <SelectItem value="alpha" className="text-xs font-mono">
                      🔤 A → Z
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Type filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <ToggleGroup
                  type="multiple"
                  size="sm"
                  className="justify-start gap-1 overflow-x-auto w-full flex-wrap"
                  value={typeFilters}
                  onValueChange={setTypeFilters}
                >
                  <ToggleGroupItem
                    value="Script"
                    className="h-6 px-2 text-[10px] font-mono data-[state=on]:bg-primary/20 data-[state=on]:text-primary border border-transparent data-[state=on]:border-primary/50"
                  >
                    Server
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="LocalScript"
                    className="h-6 px-2 text-[10px] font-mono data-[state=on]:bg-chart-2/20 data-[state=on]:text-chart-2 border border-transparent data-[state=on]:border-chart-2/50"
                  >
                    Local
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="ModuleScript"
                    className="h-6 px-2 text-[10px] font-mono data-[state=on]:bg-chart-3/20 data-[state=on]:text-chart-3 border border-transparent data-[state=on]:border-chart-3/50"
                  >
                    Module
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="Events"
                    className="h-6 px-2 text-[10px] font-mono data-[state=on]:bg-yellow-500/20 data-[state=on]:text-yellow-400 border border-transparent data-[state=on]:border-yellow-500/50"
                  >
                    ⚡ Events
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>
                  {sorted.length.toLocaleString()} / {allScripts.length.toLocaleString()} scripts
                </span>
                {sortMode === "events" && (
                  <span className="text-yellow-400/70">⚡ event scripts first</span>
                )}
                {sortMode === "newest" && (
                  <span className="text-primary/70">🕐 recent first</span>
                )}
              </div>
            </div>

            {/* Script list */}
            <ScrollArea className="flex-1">
              <div className="p-2 flex flex-col gap-0.5">
                {isLoadingScripts ? (
                  Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-sm" />
                  ))
                ) : sorted.length === 0 ? (
                  <div className="text-center p-4 text-xs text-muted-foreground font-mono">
                    NO_SCRIPTS_FOUND
                  </div>
                ) : (
                  sorted.map((script) => {
                    const Icon = SCRIPT_ICONS[script.scriptType] || FileText;
                    const isSelected = selectedScriptId === script.id;
                    const isEvent = isEventScript(script.name, script.scriptPath);
                    return (
                      <button
                        key={script.id}
                        onClick={() => setSelectedScriptId(script.id)}
                        className={cn(
                          "flex items-start gap-2 p-1.5 rounded-sm text-left transition-colors w-full group",
                          isSelected
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50"
                        )}
                      >
                        <Icon
                          className={cn(
                            "w-4 h-4 shrink-0 mt-0.5",
                            SCRIPT_COLORS[script.scriptType]
                          )}
                        />
                        <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                          <span className="text-xs font-mono font-medium truncate flex items-center gap-1">
                            {isEvent && (
                              <Zap className="w-2.5 h-2.5 text-yellow-400 shrink-0" />
                            )}
                            {script.name}
                          </span>
                          <span
                            className="text-[10px] text-muted-foreground truncate font-mono opacity-80"
                            title={script.scriptPath}
                          >
                            {script.scriptPath.replace(`${session.originalName}/`, "")}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          {script.isBytecode && (
                            <Badge
                              variant="outline"
                              className="text-[8px] h-4 px-1 border-chart-4/50 text-chart-4"
                            >
                              BIN
                            </Badge>
                          )}
                          <span className="text-[9px] text-muted-foreground/50 font-mono">
                            {formatBytes(script.sizeBytes)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-border shrink-0 bg-background/50">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs font-mono justify-start h-8 hover:border-primary/50 hover:text-primary"
                onClick={handleDownloadAll}
              >
                <ArchiveRestore className="w-3.5 h-3.5 mr-2" />
                DUMP_ALL_ZIP
              </Button>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── Code pane ───────────────────────────────────────────────────── */}
          <ResizablePanel defaultSize={75}>
            {selectedScriptId ? (
              <div className="flex flex-col h-full bg-background">
                {/* Header */}
                <div className="h-10 flex items-center justify-between px-4 border-b border-border bg-card/30 shrink-0">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span
                      className="text-muted-foreground truncate max-w-[400px]"
                      title={scriptContent?.scriptPath}
                    >
                      {scriptContent?.scriptPath || "…"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {scriptContent?.isBytecode && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-chart-4">
                        <AlertTriangle className="w-3 h-3" />
                        BYTECODE RECONSTRUCTED
                      </span>
                    )}
                    <span className="text-xs font-mono text-muted-foreground">
                      {scriptContent ? formatBytes(scriptContent.sizeBytes) : ""}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={handleDownloadScript}
                      disabled={!scriptContent}
                      title="Download this script"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Code */}
                <div className="flex-1 overflow-auto bg-[#1d1f21]">
                  {isLoadingContent ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
                    </div>
                  ) : scriptContent ? (
                    <pre className="line-numbers text-sm font-mono p-4 min-h-full">
                      <code className="language-lua">
                        {scriptContent.content || "-- Empty script"}
                      </code>
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-sm">
                      FAILED_TO_LOAD_CONTENT
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                <Terminal className="w-16 h-16 mb-4 opacity-50" />
                <h3 className="text-lg font-mono font-bold tracking-widest">AWAITING_INPUT</h3>
                <p className="text-sm">Select a script from the tree to view its contents.</p>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
