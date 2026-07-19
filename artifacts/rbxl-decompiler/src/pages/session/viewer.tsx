import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  Terminal
} from "lucide-react";

import { 
  useGetSession, 
  useGetSessionScripts,
  useGetScript,
  getGetSessionQueryKey,
  getGetSessionScriptsQueryKey,
  getGetScriptQueryKey
} from "@workspace/api-client-react";
import type { Script, ScriptScriptType } from "@workspace/api-client-react/src/generated/api.schemas";

import { SessionHeader } from "@/components/session-header";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

export default function SessionViewer() {
  const params = useParams();
  const [location] = useLocation();
  const sessionId = parseInt(params.id || "0", 10);
  
  const queryParams = new URLSearchParams(location.split("?")[1] || "");
  const initialScriptIdStr = queryParams.get("scriptId");
  
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(
    initialScriptIdStr ? parseInt(initialScriptIdStr, 10) : null
  );

  // Track which Prism elements we actually appended so cleanup never throws
  const prismRefs = useRef<{
    script?: HTMLScriptElement;
    lua?: HTMLScriptElement;
    lineNumbers?: HTMLScriptElement;
    css?: HTMLLinkElement;
  }>({});

  useEffect(() => {
    // Don't add duplicates if Prism is already there
    if ((window as any).Prism) return;

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
    lineNumbers.src = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.js";
    lineNumbers.async = true;
    document.body.appendChild(lineNumbers);
    prismRefs.current.lineNumbers = lineNumbers;

    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.css";
    document.head.appendChild(css);
    prismRefs.current.css = css;

    return () => {
      const refs = prismRefs.current;
      if (refs.script && document.body.contains(refs.script)) document.body.removeChild(refs.script);
      if (refs.lua && document.body.contains(refs.lua)) document.body.removeChild(refs.lua);
      if (refs.lineNumbers && document.body.contains(refs.lineNumbers)) document.body.removeChild(refs.lineNumbers);
      if (refs.css && document.head.contains(refs.css)) document.head.removeChild(refs.css);
    };
  }, []);

  useEffect(() => {
    if (scriptContent && (window as any).Prism) {
      setTimeout(() => (window as any).Prism.highlightAll(), 0);
    }
  }, [scriptContent]);

  const { data: session, isLoading: isLoadingSession } = useGetSession(sessionId, { 
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) } 
  });
  
  const { data: scripts, isLoading: isLoadingScripts } = useGetSessionScripts(sessionId, { 
    query: { enabled: !!sessionId, queryKey: getGetSessionScriptsQueryKey(sessionId) } 
  });

  const { data: scriptContent, isLoading: isLoadingContent } = useGetScript(
    sessionId,
    selectedScriptId as number,
    { query: { enabled: !!sessionId && !!selectedScriptId, queryKey: getGetScriptQueryKey(sessionId, selectedScriptId as number) } }
  );

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

  const filteredScripts = scripts?.filter(script => {
    const matchesSearch =
      script.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      script.scriptPath.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilters.length === 0 || typeFilters.includes(script.scriptType);
    return matchesSearch && matchesType;
  }) || [];

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
          <ResizablePanel defaultSize={25} minSize={15} maxSize={40} className="flex flex-col bg-card/30 border-r border-border">
            {/* Sidebar Header */}
            <div className="p-3 border-b border-border flex flex-col gap-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search scripts..."
                  className="pl-8 h-9 text-xs font-mono bg-background"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <ToggleGroup
                  type="multiple"
                  size="sm"
                  className="justify-start gap-1 overflow-x-auto w-full"
                  value={typeFilters}
                  onValueChange={setTypeFilters}
                >
                  <ToggleGroupItem value="Script" className="h-6 px-2 text-[10px] font-mono data-[state=on]:bg-primary/20 data-[state=on]:text-primary border border-transparent data-[state=on]:border-primary/50">Server</ToggleGroupItem>
                  <ToggleGroupItem value="LocalScript" className="h-6 px-2 text-[10px] font-mono data-[state=on]:bg-chart-2/20 data-[state=on]:text-chart-2 border border-transparent data-[state=on]:border-chart-2/50">Local</ToggleGroupItem>
                  <ToggleGroupItem value="ModuleScript" className="h-6 px-2 text-[10px] font-mono data-[state=on]:bg-chart-3/20 data-[state=on]:text-chart-3 border border-transparent data-[state=on]:border-chart-3/50">Module</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>{filteredScripts.length.toLocaleString()} / {scripts?.length?.toLocaleString() ?? 0} scripts</span>
              </div>
            </div>

            {/* Script List */}
            <ScrollArea className="flex-1">
              <div className="p-2 flex flex-col gap-0.5">
                {isLoadingScripts ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-sm" />
                  ))
                ) : filteredScripts.length === 0 ? (
                  <div className="text-center p-4 text-xs text-muted-foreground font-mono">
                    NO_SCRIPTS_FOUND
                  </div>
                ) : (
                  filteredScripts.map(script => {
                    const Icon = SCRIPT_ICONS[script.scriptType] || FileText;
                    const isSelected = selectedScriptId === script.id;
                    return (
                      <button
                        key={script.id}
                        onClick={() => setSelectedScriptId(script.id)}
                        className={cn(
                          "flex items-start gap-2 p-1.5 rounded-sm text-left transition-colors w-full",
                          isSelected
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50"
                        )}
                      >
                        <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", SCRIPT_COLORS[script.scriptType])} />
                        <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                          <span className="text-xs font-mono font-medium truncate">
                            {script.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate font-mono opacity-80" title={script.scriptPath}>
                            {script.scriptPath.replace(`${session.originalName}/`, "")}
                          </span>
                        </div>
                        {script.isBytecode && (
                          <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0 ml-1 border-chart-4/50 text-chart-4">BIN</Badge>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            
            {/* Sidebar Footer */}
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

          <ResizablePanel defaultSize={75}>
            {selectedScriptId ? (
              <div className="flex flex-col h-full bg-background relative">
                {/* Code Header */}
                <div className="h-10 flex items-center justify-between px-4 border-b border-border bg-card/30 shrink-0">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-muted-foreground truncate max-w-[400px]" title={scriptContent?.scriptPath}>
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

                {/* Code Viewer */}
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
