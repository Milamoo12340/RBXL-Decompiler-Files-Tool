import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  Activity,
  Loader2,
  Hash,
  Code2,
  TerminalSquare,
  AlertCircle,
  Percent,
  Table2,
} from "lucide-react";

import {
  useGetSession,
  useGetSessionAnalysis,
  useGetSessionTopics,
  useGetTopicDetail,
  getGetSessionQueryKey,
  getGetSessionAnalysisQueryKey,
  getGetSessionTopicsQueryKey,
  getGetTopicDetailQueryKey,
} from "@workspace/api-client-react";

import { SessionHeader } from "@/components/session-header";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Probability helpers ────────────────────────────────────────────────────────

interface ProbRow {
  name: string;
  pct: number;
}

/**
 * Extract PS99-style `{"PetName", 89.9}` entries from a code snippet.
 * Returns null if fewer than 2 entries found (not a rate table).
 */
function parseProbabilityTable(snippet: string): ProbRow[] | null {
  const pattern = /\{\s*"([^"]+)"\s*,\s*([\d.]+)\s*\}/g;
  const rows: ProbRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(snippet)) !== null) {
    const pct = parseFloat(m[2]);
    if (pct > 0 && pct <= 100) rows.push({ name: m[1], pct });
  }
  return rows.length >= 2 ? rows : null;
}

/** Convert a percentage to a human "1 in X" string. */
function pctToRatio(pct: number): string {
  const ratio = 100 / pct;
  if (ratio < 2) return `${pct.toFixed(1)}%`;
  if (ratio < 100) return `1 in ${ratio.toFixed(1)}`;
  if (ratio < 10_000) return `1 in ${Math.round(ratio).toLocaleString()}`;
  if (ratio < 1_000_000) return `1 in ${(ratio / 1000).toFixed(1)}k`;
  return `1 in ${(ratio / 1_000_000).toFixed(2)}M`;
}

/** Colour-code a rarity based on drop %: Common → Epic → Legendary. */
function rarityStyle(pct: number): { label: string; className: string } {
  if (pct >= 50)  return { label: "Common",    className: "bg-green-500/15 text-green-400 border-green-500/30" };
  if (pct >= 10)  return { label: "Uncommon",  className: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  if (pct >= 1)   return { label: "Rare",      className: "bg-violet-500/15 text-violet-400 border-violet-500/30" };
  if (pct >= 0.1) return { label: "Epic",      className: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
  if (pct >= 0.01)return { label: "Legendary", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" };
  return             { label: "Mythic",    className: "bg-red-500/15 text-red-400 border-red-500/30" };
}

/** Probability decode table rendered inside a finding card. */
function ProbabilityTable({ rows }: { rows: ProbRow[] }) {
  const total = rows.reduce((s, r) => s + r.pct, 0);
  return (
    <div className="mt-3 rounded-md border border-border overflow-hidden bg-card/60">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/40">
        <Table2 className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-mono font-semibold tracking-widest text-muted-foreground uppercase">
          Decoded Rates
        </span>
        {Math.abs(total - 100) < 0.5 && (
          <Badge variant="outline" className="ml-auto h-4 text-[9px] px-1 border-green-500/40 text-green-400">
            ✓ sums to {total.toFixed(1)}%
          </Badge>
        )}
      </div>
      <div className="divide-y divide-border/50">
        {rows.map((row) => {
          const r = rarityStyle(row.pct);
          return (
            <div
              key={row.name}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono hover:bg-accent/30 transition-colors"
            >
              {/* Rarity bar */}
              <div
                className="h-1.5 rounded-full bg-current opacity-60 shrink-0"
                style={{ width: `${Math.max(4, Math.min(80, row.pct))}px`, color: "var(--primary)" }}
              />
              <span className="flex-1 truncate text-foreground">{row.name}</span>
              <span className="text-muted-foreground w-16 text-right">{row.pct}%</span>
              <span className="text-primary/80 w-24 text-right">{pctToRatio(row.pct)}</span>
              <Badge
                variant="outline"
                className={cn("text-[9px] h-4 px-1 border shrink-0 ml-1", r.className)}
              >
                {r.label}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Topic detail view ──────────────────────────────────────────────────────────

const PROB_CATEGORIES = new Set(["hatch_chances", "egg_rates"]);

function TopicDetailView({
  sessionId,
  topicId,
}: {
  sessionId: number;
  topicId: number;
}) {
  const { data: detail, isLoading } = useGetTopicDetail(sessionId, topicId, {
    query: {
      enabled: !!topicId,
      queryKey: getGetTopicDetailQueryKey(sessionId, topicId),
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/4 mb-4" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground p-6 text-center flex-col">
        <AlertCircle className="w-10 h-10 mb-4 opacity-50 text-destructive" />
        <p className="font-mono text-sm">COULD_NOT_LOAD_TOPIC_DATA</p>
      </div>
    );
  }

  const showProbTable = PROB_CATEGORIES.has(detail.category);

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="h-16 flex flex-col justify-center px-6 border-b border-border bg-card/30 shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-lg font-bold tracking-tight">{detail.name}</h2>
          <Badge
            variant="outline"
            className="text-[10px] font-mono border-primary/50 text-primary"
          >
            {detail.category.toUpperCase()}
          </Badge>
          {showProbTable && (
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-yellow-500/40 text-yellow-400 flex items-center gap-1"
            >
              <Percent className="w-2.5 h-2.5" />
              RATES DECODED
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-mono">
          FOUND {detail.matchCount} RELEVANT{" "}
          {detail.matchCount === 1 ? "SNIPPET" : "SNIPPETS"}
        </p>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-12">
          {detail.findings.map((finding, idx) => {
            const probRows = showProbTable
              ? parseProbabilityTable(finding.snippet)
              : null;

            return (
              <div
                key={`${finding.scriptId}-${idx}`}
                className="flex flex-col border border-border rounded-md overflow-hidden bg-card/50 hover:border-primary/50 transition-colors"
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <TerminalSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Link
                      href={`/sessions/${sessionId}?scriptId=${finding.scriptId}`}
                      className="font-mono text-xs font-semibold hover:text-primary hover:underline underline-offset-4 truncate"
                    >
                      {finding.scriptName}
                    </Link>
                    <span className="text-muted-foreground text-xs font-mono shrink-0">
                      :L{finding.lineNumber}
                    </span>
                  </div>
                  {finding.value && (
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px] shrink-0 ml-2"
                    >
                      {finding.value}
                    </Badge>
                  )}
                </div>

                {/* Raw code snippet */}
                <div className="p-3 bg-[#1d1f21] overflow-x-auto text-sm font-mono">
                  <pre className="m-0">
                    <code className="text-[13px] text-slate-300 leading-relaxed">
                      {finding.snippet}
                    </code>
                  </pre>
                </div>

                {/* Decoded probability table */}
                {probRows && (
                  <div className="px-3 pb-3 bg-background/50">
                    <ProbabilityTable rows={probRows} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SessionAnalysis() {
  const params = useParams();
  const sessionId = parseInt(params.id || "0", 10);

  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);

  const { data: session, isLoading: isLoadingSession } = useGetSession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) },
  });

  const { data: analysis, isLoading: isLoadingAnalysis } = useGetSessionAnalysis(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionAnalysisQueryKey(sessionId) },
  });

  const { data: topics, isLoading: isLoadingTopics } = useGetSessionTopics(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionTopicsQueryKey(sessionId) },
  });

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
      <SessionHeader
        sessionId={sessionId}
        sessionName={session.originalName}
        activeTab="analysis"
      />

      <main className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Topic list */}
          <ResizablePanel
            defaultSize={30}
            minSize={20}
            maxSize={45}
            className="flex flex-col bg-card/30 border-r border-border"
          >
            <div className="p-4 border-b border-border shrink-0">
              <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-muted-foreground">
                <Activity className="w-4 h-4 text-primary" />
                Discovered Topics{" "}
                {analysis && (
                  <span className="text-xs text-primary/70">
                    ({analysis.topicCount})
                  </span>
                )}
              </h2>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 flex flex-col gap-2">
                {isLoadingTopics ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-md" />
                  ))
                ) : topics?.length === 0 ? (
                  <div className="text-center p-6 text-xs text-muted-foreground font-mono">
                    NO_TOPICS_IDENTIFIED
                  </div>
                ) : (
                  topics?.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={cn(
                        "flex flex-col gap-1 p-3 rounded-md text-left transition-all border",
                        selectedTopicId === topic.id
                          ? "bg-primary/10 border-primary/50 text-foreground"
                          : "bg-card border-transparent hover:border-border hover:bg-card/80 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold text-sm truncate pr-2">
                          {topic.name}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 h-4 bg-background shrink-0"
                        >
                          {topic.matchCount}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs opacity-70 font-mono">
                        <Hash className="w-3 h-3" />
                        <span>{topic.category.replace("_", " ")}</span>
                        {PROB_CATEGORIES.has(topic.category) && (
                          <Percent className="w-3 h-3 text-yellow-400/70 ml-auto" />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Finding detail */}
          <ResizablePanel defaultSize={70}>
            {selectedTopicId ? (
              <TopicDetailView
                sessionId={sessionId}
                topicId={selectedTopicId}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                <Code2 className="w-16 h-16 mb-4 opacity-50" />
                <h3 className="text-lg font-mono font-bold tracking-widest">
                  AWAITING_SELECTION
                </h3>
                <p className="text-sm">
                  Select an analysis topic to explore extracted mechanics.
                </p>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
