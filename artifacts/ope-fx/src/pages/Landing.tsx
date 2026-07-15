import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30">
      <header className="px-6 h-16 flex items-center justify-between border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="OPE-FX Logo" className="h-8 w-8" />
          <span className="font-bold text-lg tracking-tight font-mono">OPE-FX</span>
        </div>
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" className="text-muted-foreground hover:text-foreground hidden sm:inline-flex">
            <Link href="/sign-in">Log in</Link>
          </Button>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/sign-up">Initialize</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="px-6 py-24 md:py-32 max-w-5xl mx-auto w-full text-center sm:text-left flex flex-col sm:items-center sm:text-center items-start">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
            System v2.0 Online
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
            Command Center for <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">Disciplined Traders</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
            A professional-grade journaling and analytics cockpit designed to track edges, define rules, and extract raw signal from the noise of the markets.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-500 fill-mode-both">
            <Button asChild size="lg" className="h-12 px-8 text-base font-semibold w-full sm:w-auto">
              <Link href="/sign-up">Access Dashboard</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base font-medium w-full sm:w-auto border-border">
              <Link href="/sign-in">Operator Login</Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border bg-card/50 py-24 px-6 flex-1">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-6 rounded-2xl bg-background border border-border flex flex-col group hover:border-primary/50 transition-colors">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                </div>
                <h3 className="text-xl font-bold mb-3">Analytics Engine</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Advanced metrics to dissect your trading edge. Win rates, drawdowns, and real-time equity curve tracking.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-background border border-border flex flex-col group hover:border-primary/50 transition-colors">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </div>
                <h3 className="text-xl font-bold mb-3">Immutable Journal</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Log your thesis, execution, and psychological state. Tie every outcome back to your documented rules.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-background border border-border flex flex-col group hover:border-primary/50 transition-colors">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
                </div>
                <h3 className="text-xl font-bold mb-3">Performance Rules</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Codify your playbook. The system tracks rule adherence to keep you focused on process over outcome.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <footer className="py-8 text-center text-sm text-muted-foreground border-t border-border">
        <p>&copy; {new Date().getFullYear()} OPE-FX. Engineered for the disciplined.</p>
      </footer>
    </div>
  );
}
