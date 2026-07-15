import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { 
  LayoutDashboard, 
  BookOpen, 
  FileText, 
  BarChart2, 
  ClipboardList, 
  BrainCircuit, 
  Settings, 
  HelpCircle,
  LogOut,
  Search,
  Bell,
  Menu,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Trade Log", href: "/trades", icon: BookOpen },
  { label: "Journal", href: "/journal", icon: FileText },
  { label: "Reviews", href: "/reviews", icon: ClipboardList },
  { label: "Rules", href: "/rules", icon: BarChart2 },
  { label: "Analytics", href: "/analytics", icon: BarChart2 },
  { label: "Trading Assistant", href: "/assistant", icon: BrainCircuit },
];

const BOTTOM_NAV_ITEMS = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Help", href: "/help", icon: HelpCircle },
];

export function Sidebar() {
  const [location] = useLocation();
  const { signOut } = useClerk();

  return (
    <div className="w-64 border-r border-border bg-sidebar h-full flex flex-col text-sidebar-foreground">
      <div className="h-16 px-6 flex items-center border-b border-border">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="OPE-FX Logo" className="h-8 w-8" />
          <span className="font-bold text-lg tracking-tight font-mono">OPE-FX</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (location.startsWith(item.href) && item.href !== '/');
          return (
            <Button
              key={item.href}
              asChild
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Link href={item.href}>
                <item.icon className="mr-3 h-5 w-5 opacity-80" />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </div>

      <div className="p-3 border-t border-border flex flex-col gap-1">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Button
              key={item.href}
              asChild
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Link href={item.href}>
                <item.icon className="mr-3 h-5 w-5 opacity-80" />
                {item.label}
              </Link>
            </Button>
          );
        })}
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground mt-2"
          onClick={() => signOut()}
        >
          <LogOut className="mr-3 h-5 w-5 opacity-80" />
          Logout
        </Button>
      </div>
    </div>
  );
}

import { useGetDashboardSummary } from "@workspace/api-client-react";

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);

export function Header() {
  const { user } = useUser();
  const { data } = useGetDashboardSummary();

  // We'll hardcode the header stats visually here and populate them from dashboard API in the real app, 
  // or simply keep them static/omitted if the global state doesn't have it. 
  // For the cockpit feel, we can just show the profile and search. The dashboard itself holds the numbers.
  // Wait, the prompt says "Header contains: OPE-FX logo (for mobile?), a search bar, Current Balance, Today's P/L, a notification bell, and a profile avatar".
  // Since we only fetch this in dashboard, we can either mock the header stats or use a context. 
  // To avoid complexity and meet the requirement, I'll show some static placeholders that look like real data, 
  // or maybe better, we don't have global data context right now, so I'll put some generic placeholders like "-.--"

  return (
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40 w-full">
      <div className="flex items-center lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden text-foreground">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-sidebar border-r border-border">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
            </SheetHeader>
            <Sidebar />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2 ml-2">
          <img src="/logo.svg" alt="OPE-FX Logo" className="h-6 w-6" />
        </div>
      </div>

      <div className="hidden lg:flex items-center max-w-md w-full ml-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            type="search" 
            placeholder="Search symbols, trades, journal..." 
            className="w-full pl-10 bg-secondary/50 border-border h-9 focus-visible:ring-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 lg:gap-6 ml-auto">
        <div className="hidden md:flex items-center gap-6 mr-4 border-r border-border pr-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Current Balance</span>
            <span className="text-sm font-semibold font-mono tracking-tight">{data ? formatCurrency(data.currentBalance) : "$---.--"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Today's P/L</span>
            <span className={`text-sm font-semibold font-mono tracking-tight ${data && data.todayPnl < 0 ? 'text-destructive' : 'text-primary'}`}>
              {data ? `${data.todayPnl > 0 ? '+' : ''}${formatCurrency(data.todayPnl)}` : "+$---.--"}
            </span>
          </div>
        </div>

        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary border-2 border-background"></span>
        </Button>

        <Avatar className="h-8 w-8 ring-2 ring-border/50">
          <AvatarImage src={user?.imageUrl} alt={user?.fullName || "User"} />
          <AvatarFallback className="bg-primary/20 text-primary">{user?.firstName?.charAt(0) || "U"}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex bg-background text-foreground selection:bg-primary/30">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 lg:pb-12 bg-background/50">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Floating Action Button */}
      <Button 
        className="lg:hidden fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg shadow-primary/20 p-0 flex items-center justify-center bg-primary hover:bg-primary/90 text-primary-foreground z-50"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
