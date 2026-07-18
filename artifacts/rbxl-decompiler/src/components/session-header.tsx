import { Link, useLocation } from "wouter";
import { FileCode2, BarChart2, Activity, ChevronRight, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionHeaderProps {
  sessionId: number;
  sessionName?: string;
  activeTab: "scripts" | "analysis" | "stats";
}

export function SessionHeader({ sessionId, sessionName, activeTab }: SessionHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card/50 px-4 shrink-0">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="hidden sm:inline-block font-semibold">RBXL_DECOMPILER</span>
        </Link>
        <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
        <span className="font-medium text-foreground max-w-[200px] truncate" title={sessionName}>
          {sessionName || `Session #${sessionId}`}
        </span>
      </div>

      <nav className="flex items-center gap-1">
        <Link 
          href={`/sessions/${sessionId}`}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "scripts" 
              ? "bg-primary/10 text-primary" 
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span>Scripts</span>
        </Link>
        <Link 
          href={`/sessions/${sessionId}/analysis`}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "analysis" 
              ? "bg-primary/10 text-primary" 
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Analysis</span>
        </Link>
        <Link 
          href={`/sessions/${sessionId}/stats`}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "stats" 
              ? "bg-primary/10 text-primary" 
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          <span>Stats</span>
        </Link>
      </nav>
    </header>
  );
}
