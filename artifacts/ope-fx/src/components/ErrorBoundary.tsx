import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Optional fallback to render instead of the default UI */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary — catches uncaught React render errors and
 * shows a user-friendly recovery screen instead of a blank white crash.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[OPE-FX] Unhandled render error:", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center space-y-5">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertTriangle className="h-10 w-10 text-destructive/70" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Your data is safe — please try refreshing
            the page or navigating back to the dashboard.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={this.reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button onClick={() => window.location.reload()} className="gap-2">
            Reload Page
          </Button>
        </div>
        {import.meta.env.DEV && this.state.error && (
          <details className="text-left text-xs text-muted-foreground max-w-lg">
            <summary className="cursor-pointer">Error details (dev only)</summary>
            <pre className="mt-2 p-3 bg-muted rounded-lg overflow-auto whitespace-pre-wrap">
              {this.state.error.stack ?? this.state.error.message}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
