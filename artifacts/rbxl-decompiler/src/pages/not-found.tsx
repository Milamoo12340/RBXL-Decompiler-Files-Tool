import { Link } from "wouter";
import { FileTerminal } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground">
      <FileTerminal className="w-16 h-16 text-primary mb-6 opacity-80" />
      <h1 className="text-4xl font-bold mb-2 tracking-tight">404</h1>
      <p className="text-muted-foreground mb-6 text-sm uppercase tracking-widest">
        Segment Fault // Page Not Found
      </p>
      <Link href="/" className="text-primary hover:text-primary/80 underline underline-offset-4 decoration-primary/50 text-sm">
        Return to Workbench
      </Link>
    </div>
  );
}
