import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  Upload, 
  FileCode2, 
  Terminal, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Trash2 
} from "lucide-react";
import { formatBytes, formatDate } from "@/lib/utils";
import { 
  useListSessions, 
  useDeleteSession,
  getListSessionsQueryKey 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const { data: sessions, isLoading: isLoadingSessions } = useListSessions();
  const deleteSession = useDeleteSession();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith('.rbxl') && !file.name.endsWith('.rbxlx')) {
      toast({
        title: "Invalid file type",
        description: "Only .rbxl and .rbxlx files are supported.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/sessions/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }
      
      const session = await res.json();
      
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      toast({
        title: "Upload successful",
        description: "Session created. Processing started.",
      });
      
      setLocation(`/sessions/${session.id}`);
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message || "An error occurred during upload.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (confirm("Delete this session?")) {
      deleteSession.mutate({ sessionId: id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({ title: "Session deleted" });
        }
      });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="flex h-14 items-center px-6 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-tight">RBXL_DECOMPILER</span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 flex flex-col gap-8">
        <section>
          <div className="mb-4">
            <h1 className="text-2xl font-bold tracking-tight">New Decompilation Session</h1>
            <p className="text-sm text-muted-foreground">Upload a Roblox place file to extract and analyze its scripts.</p>
          </div>
          
          <label 
            className={`
              relative flex flex-col items-center justify-center w-full h-64 
              border-2 border-dashed rounded-lg cursor-pointer transition-colors
              ${isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card/50 hover:bg-card hover:border-primary/50'}
              ${isUploading ? 'opacity-50 pointer-events-none' : ''}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {isUploading ? (
                <>
                  <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                  <p className="text-sm text-muted-foreground font-mono">UPLOADING_FILE...</p>
                </>
              ) : (
                <>
                  <div className="p-4 bg-background border border-border rounded-full mb-4 shadow-sm">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground/70 font-mono">
                    .rbxl or .rbxlx (MAX. 100MB)
                  </p>
                </>
              )}
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept=".rbxl,.rbxlx" 
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </label>
        </section>

        <section className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight">Recent Sessions</h2>
            <Badge variant="outline" className="font-mono">{sessions?.length || 0} TOTAL</Badge>
          </div>

          {isLoadingSessions ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 rounded-lg bg-card/50 border border-border animate-pulse" />
              ))}
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.map(session => (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <Card className="hover-elevate cursor-pointer transition-all border-border hover:border-primary/50 group h-full flex flex-col">
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileCode2 className="w-4 h-4 text-primary shrink-0" />
                          <h3 className="font-mono text-sm font-bold truncate" title={session.originalName}>
                            {session.originalName}
                          </h3>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => handleDelete(e, session.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      
                      <div className="mt-auto grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-mono">
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground/50">STATUS</span>
                          <div className="flex items-center gap-1.5">
                            {session.status === 'complete' && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                            {session.status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-secondary-foreground animate-spin" />}
                            {session.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                            {session.status === 'pending' && <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                            <span className="uppercase">{session.status}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground/50">SCRIPTS</span>
                          <span>{session.scriptCount.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground/50">SIZE</span>
                          <span>{session.fileSizeBytes ? formatBytes(session.fileSizeBytes) : '--'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground/50">CREATED</span>
                          <span className="truncate" title={formatDate(session.createdAt)}>{formatDate(session.createdAt).split(',')[0]}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 px-4 rounded-lg border border-dashed border-border bg-card/30">
              <Terminal className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <h3 className="text-sm font-semibold mb-1">No sessions found</h3>
              <p className="text-xs text-muted-foreground">Upload a file above to begin.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
