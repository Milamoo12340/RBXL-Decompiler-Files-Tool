import { Link, useLocation } from "wouter";
import { FileCode2, BarChart2, Activity, ChevronRight, Terminal, Zap, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionHeaderProps {
  sessionId: number;
  sessionName?: string;
  activeTab: "scripts" | "analysis" | "stats" | "event" | "flags";
}

export function SessionHeader({ sessionId, sessionName, activeTab }: SessionHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card/50 px-4 shrink-0">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <Link href="/" className="text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors shrink-0">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="hidden sm:inline-block font-semibold">RBXL_DECOMPILER</span>
        </Link>
        <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
        <span className="font-medium text-foreground truncate max-w-[180px]" title={sessionName}>
          {sessionName || `Session #${sessionId}`}
        </span>
      </div>

      <nav className="flex items-center gap-0.5">
        <Link
          href={`/sessions/${sessionId}`}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "scripts"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Scripts</span>
        </Link>

        <Link
          href={`/sessions/${sessionId}/event`}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "event"
              ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Event</span>
        </Link>

        <Link
          href={`/sessions/${sessionId}/analysis`}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "analysis"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Activity className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Analysis</span>
        </Link>

        <Link
          href={`/sessions/${sessionId}/flags`}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "flags"
              ? "bg-violet-500/15 text-violet-400 border border-violet-500/30"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Flag className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Flags</span>
        </Link>

        <Link
          href={`/sessions/${sessionId}/stats`}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "stats"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Stats</span>
        </Link>
      </nav>
    </header>
  );
}
