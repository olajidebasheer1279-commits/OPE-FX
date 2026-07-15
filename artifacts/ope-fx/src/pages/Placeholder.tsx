import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex h-[calc(100vh-8rem)] w-full flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-500">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary mb-6 shadow-sm border border-border">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight mb-2 text-foreground">{title}</h2>
      {description && <p className="text-muted-foreground max-w-sm mb-8">{description}</p>}
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" className="border-border">
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
