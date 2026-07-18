import { useParams } from "wouter";
import { 
  BarChart2, 
  Loader2, 
  Database,
  Cpu,
  FileCode2,
  PieChart as PieChartIcon
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

import { 
  useGetSession, 
  useGetSessionStats,
  getGetSessionQueryKey,
  getGetSessionStatsQueryKey
} from "@workspace/api-client-react";

import { SessionHeader } from "@/components/session-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";

// Recharts specific colors using our theme variables conceptually
const CHART_COLORS = {
  primary: "hsl(160, 100%, 50%)",    // Cyan
  secondary: "hsl(280, 100%, 60%)",  // Purple
  tertiary: "hsl(40, 100%, 50%)",    // Orange
  destructive: "hsl(340, 100%, 50%)", // Pink
  blue: "hsl(200, 100%, 50%)"         // Blue
};

export default function SessionStats() {
  const params = useParams();
  const sessionId = parseInt(params.id || "0", 10);
  
  const { data: session, isLoading: isLoadingSession } = useGetSession(sessionId, { 
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) } 
  });
  
  const { data: stats, isLoading: isLoadingStats } = useGetSessionStats(sessionId, { 
    query: { enabled: !!sessionId, queryKey: getGetSessionStatsQueryKey(sessionId) } 
  });

  if (isLoadingSession) {
    return <div className="min-h-[100dvh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!session) {
    return <div className="min-h-[100dvh] flex items-center justify-center font-mono">SESSION_NOT_FOUND</div>;
  }

  // Format data for charts
  const typeChartData = stats ? Object.entries(stats.scriptTypes).map(([name, count], index) => ({
    name,
    count,
    fill: Object.values(CHART_COLORS)[index % Object.values(CHART_COLORS).length]
  })).sort((a, b) => b.count - a.count) : [];

  const bytecodeData = stats ? [
    { name: 'Bytecode', value: stats.bytecodeCount, fill: CHART_COLORS.destructive },
    { name: 'Plain Source', value: stats.totalScripts - stats.bytecodeCount, fill: CHART_COLORS.primary }
  ] : [];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background overflow-hidden">
      <SessionHeader sessionId={sessionId} sessionName={session.originalName} activeTab="stats" />

      <ScrollArea className="flex-1">
        <main className="max-w-6xl w-full mx-auto p-6 flex flex-col gap-6 pb-12">
          <div className="flex items-center gap-2 mb-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Decompilation Metrics</h1>
          </div>

          {isLoadingStats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
              <Skeleton className="h-80 w-full rounded-xl lg:col-span-2" />
              <Skeleton className="h-80 w-full rounded-xl lg:col-span-2" />
              <Skeleton className="h-96 w-full rounded-xl lg:col-span-4" />
            </div>
          ) : stats ? (
            <>
              {/* Top Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider font-mono">Total Scripts</CardTitle>
                    <FileCode2 className="w-4 h-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats.totalScripts.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">EXTRACTED ENTITIES</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider font-mono">Codebase Size</CardTitle>
                    <Database className="w-4 h-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{formatBytes(stats.totalSizeBytes)}</div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">TOTAL PAYLOAD</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider font-mono">Bytecode Ratio</CardTitle>
                    <Cpu className="w-4 h-4 text-destructive" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-destructive">
                      {((stats.bytecodeCount / Math.max(stats.totalScripts, 1)) * 100).toFixed(1)}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">RECONSTRUCTED BINS</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider font-mono">Core Type</CardTitle>
                    <PieChartIcon className="w-4 h-4 text-chart-3" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-chart-3 truncate">
                      {typeChartData.length > 0 ? typeChartData[0].name : 'None'}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">MOST COMMON</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <CardTitle className="text-lg">Script Distribution</CardTitle>
                    <CardDescription>Breakdown by Roblox script type</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={typeChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false}
                          fontFamily="var(--app-font-mono)"
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(value) => `${value}`}
                          fontFamily="var(--app-font-mono)"
                        />
                        <RechartsTooltip 
                          cursor={{ fill: 'hsl(var(--accent))' }}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '6px',
                            fontFamily: 'var(--app-font-mono)'
                          }}
                          itemStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Bar 
                          dataKey="count" 
                          radius={[4, 4, 0, 0]} 
                          maxBarSize={60}
                        >
                          {typeChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <CardTitle className="text-lg">Source Obfuscation</CardTitle>
                    <CardDescription>Raw Lua vs Compiled Bytecode segments</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={bytecodeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={110}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {bytecodeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '6px',
                            fontFamily: 'var(--app-font-mono)'
                          }}
                        />
                        <Legend 
                          verticalAlign="bottom" 
                          height={36} 
                          iconType="circle"
                          wrapperStyle={{ fontFamily: 'var(--app-font-mono)', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Largest Scripts Table */}
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Heaviest Payloads</CardTitle>
                  <CardDescription>Top files by byte size extracted in this session</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative w-full overflow-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-muted/50">
                        <tr className="font-mono text-xs text-muted-foreground text-left">
                          <th className="px-4 py-3 font-medium">NAME</th>
                          <th className="px-4 py-3 font-medium">PATH</th>
                          <th className="px-4 py-3 font-medium">TYPE</th>
                          <th className="px-4 py-3 font-medium text-right">SIZE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {stats.topScripts.map((script) => (
                          <tr key={script.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-semibold font-mono text-xs">
                              {script.name}
                              {script.isBytecode && (
                                <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1 border-destructive text-destructive">BIN</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs opacity-80 truncate max-w-[300px]">
                              {script.scriptPath}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className="font-mono text-[10px] bg-background">
                                {script.scriptType}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-primary">
                              {formatBytes(script.sizeBytes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </main>
      </ScrollArea>
    </div>
  );
}
