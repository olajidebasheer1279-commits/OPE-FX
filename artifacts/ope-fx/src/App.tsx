import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import TradeLog from "@/pages/TradeLog";
import TradeDetails from "@/pages/TradeDetails";
import Journal from "@/pages/Journal";
import Rules from "@/pages/Rules";
import Reviews from "@/pages/Reviews";
import Analytics from "@/pages/Analytics";
import Assistant from "@/pages/Assistant";
import Settings from "@/pages/Settings";
import Placeholder from "@/pages/Placeholder";
import AppLayout from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Resolve the publishable key. publishableKeyFromHost handles satellite/custom-
// domain setups; we always fall back to the plain env var so the app works on
// any deployment platform (Replit, Render, etc.) even if the hostname isn't
// registered with Clerk. Do NOT throw here — module-level throws crash the
// entire app before React mounts, producing a blank page with no error UI.
// Validation is done inside ClerkProviderWithRoutes where ErrorBoundary can catch it.
const clerkPubKey =
  publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) ??
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  '';

// The Render service serves both the frontend and the Clerk proxy endpoint.
// Always use that same origin in production so a stale custom proxy hostname
// cannot make Clerk fail before the application renders. Local development
// may still opt into an explicitly configured proxy URL.
const configuredClerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL?.trim();
const clerkProxyUrl = import.meta.env.PROD
  ? `${window.location.origin}/api/__clerk`
  : configuredClerkProxyUrl || undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(221 83% 53%)",
    colorForeground: "hsl(210 40% 98%)",
    colorMutedForeground: "hsl(215 20% 65%)",
    colorDanger: "hsl(0 62.8% 30.6%)",
    colorBackground: "hsl(222 47% 8%)",
    colorInput: "hsl(217 33% 17%)",
    colorInputForeground: "hsl(210 40% 98%)",
    colorNeutral: "hsl(217 33% 17%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card border border-border rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-semibold",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground bg-card px-2",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-green-500",
    alertText: "text-foreground",
    logoBox: "h-12 flex items-center justify-center",
    logoImage: "h-10",
    socialButtonsBlockButton: "border border-border hover:bg-muted/50 transition-colors",
    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground transition-colors",
    formFieldInput: "bg-input border border-border text-foreground rounded-md",
    footerAction: "bg-card border-t border-border",
    dividerLine: "bg-border",
    alert: "bg-destructive/20 border border-destructive text-foreground",
    otpCodeFieldInput: "bg-input border border-border text-foreground",
    formFieldRow: "mb-4",
    main: "flex flex-col gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component, title, description }: { component: React.ComponentType, title?: string, description?: string }) {
  return (
    <>
      <Show when="signed-in">
        <AppLayout>
          {title ? <Placeholder title={title} description={description} /> : <Component />}
        </AppLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  // Keep the missing-configuration state inside the mounted React tree so a
  // bad production build can never turn into an unexplained blank page.
  if (!clerkPubKey) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-semibold text-foreground">
            OPE-FX is starting up
          </h1>
          <p className="text-sm text-muted-foreground">
            Authentication is not configured for this frontend build. Set
            VITE_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY and rebuild.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Access OPE-FX",
            subtitle: "Enter your command center",
          },
        },
        signUp: {
          start: {
            title: "Initialize OPE-FX",
            subtitle: "Begin your professional trading journey",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            
            <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
            
            <Route path="/trades" component={() => <ProtectedRoute component={TradeLog} />} />
            <Route path="/trades/new" component={() => <ProtectedRoute component={TradeLog} />} />
            <Route path="/trades/:id" component={() => <ProtectedRoute component={TradeDetails} />} />
            <Route path="/journal" component={() => <ProtectedRoute component={Journal} />} />
            <Route path="/reviews" component={() => <ProtectedRoute component={Reviews} />} />
            <Route path="/rules" component={() => <ProtectedRoute component={Rules} />} />
            <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
            <Route path="/assistant" component={() => <ProtectedRoute component={Assistant} />} />
            <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
            <Route path="/help" component={() => <ProtectedRoute component={Placeholder} title="Help" description="Documentation and support resources." />} />
            
            <Route component={() => (
              <div className="flex h-[100dvh] items-center justify-center">
                <div className="text-center space-y-4">
                  <h1 className="text-4xl font-bold font-mono">404</h1>
                  <p className="text-muted-foreground">Coordinates unmapped. Sector not found.</p>
                </div>
              </div>
            )} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  // Ensure dark mode class is always applied for consistency if any external component expects it
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <ErrorBoundary>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ErrorBoundary>
  );
}

export default App;