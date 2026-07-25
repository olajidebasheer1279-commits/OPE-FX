import { useEffect, useState } from "react";
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
  Bell,
  Menu,
  Plus,
  X,
  CheckCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  useGetDashboardSummary,
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useClearAllNotifications,
  useGenerateNotifications,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { useAlertStream } from "@/hooks/useAlertStream";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";

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

export function Sidebar({ onClose }: { onClose?: () => void }) {
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
          const isActive =
            location === item.href ||
            (location.startsWith(item.href) && item.href !== "/");
          return (
            <Button
              key={item.href}
              asChild
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              onClick={onClose}
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
              className={`w-full justify-start ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              onClick={onClose}
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);

// Local types — mirrors the server schema; avoids relying on the unbuilt lib dist
type AppNotif = {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
};
type NSnapshot = { prev: unknown };

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);

  // Bug 3 fix: lock body scroll while the popover is open so the page behind
  // doesn't scroll when the user tries to scroll the notification list on iOS.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [clearConfirm, setClearConfirm] = useState(false);

  const QK = getListNotificationsQueryKey();

  const { data: _notifData } = useListNotifications({
    query: { refetchInterval: 60_000 },
  });
  const notifications: AppNotif[] = (_notifData as AppNotif[] | undefined) ?? [];

  // ── Optimistic helpers ──────────────────────────────────────────────────
  async function snapshot(): Promise<NSnapshot> {
    await queryClient.cancelQueries({ queryKey: QK });
    return { prev: queryClient.getQueryData(QK) };
  }
  function rollback(_e: unknown, _v: unknown, ctx: NSnapshot | undefined) {
    queryClient.setQueryData(QK, ctx?.prev);
  }
  function refetch() {
    queryClient.invalidateQueries({ queryKey: QK });
  }

  // ── Mutations ───────────────────────────────────────────────────────────
  const generateMutation = useGenerateNotifications({
    mutation: { onSuccess: refetch },
  });

  const markRead = useMarkNotificationRead({
    mutation: {
      onMutate: async ({ id }: { id: number }) => {
        const ctx = await snapshot();
        queryClient.setQueryData<AppNotif[]>(QK, (old) =>
          (old ?? []).map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        );
        return ctx;
      },
      onError: rollback,
      onSettled: refetch,
    },
  });

  const markAllRead = useMarkAllNotificationsRead({
    mutation: {
      onMutate: async () => {
        const ctx = await snapshot();
        queryClient.setQueryData<AppNotif[]>(QK, (old) =>
          (old ?? []).map((n) => ({ ...n, isRead: true })),
        );
        return ctx;
      },
      onError: rollback,
      onSettled: refetch,
    },
  });

  const deleteNotif = useDeleteNotification({
    mutation: {
      onMutate: async ({ id }: { id: number }) => {
        const ctx = await snapshot();
        queryClient.setQueryData<AppNotif[]>(QK, (old) =>
          (old ?? []).filter((n) => n.id !== id),
        );
        return ctx;
      },
      onError: rollback,
      onSettled: refetch,
    },
  });

  const clearAll = useClearAllNotifications({
    mutation: {
      onMutate: async () => {
        const ctx = await snapshot();
        queryClient.setQueryData(QK, []);
        return ctx;
      },
      onError: rollback,
      onSettled: () => {
        refetch();
        setClearConfirm(false);
        setSelectMode(false);
        setSelectedIds(new Set());
      },
    },
  });

  // Generate on mount (once per session)
  useEffect(() => {
    generateMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset selection + confirm when popover closes
  useEffect(() => {
    if (!open) {
      setSelectMode(false);
      setSelectedIds(new Set());
      setClearConfirm(false);
    }
  }, [open]);

  // ── Select helpers ──────────────────────────────────────────────────────
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function deleteSelected() {
    selectedIds.forEach((id) => deleteNotif.mutate({ id }));
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  const unread = notifications.filter((n) => !n.isRead).length;
  const hasAny = notifications.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground border-0">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 sm:w-96 p-0" align="end" sideOffset={8}>
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && (
              <Badge className="h-5 px-1.5 text-[10px] bg-primary/20 text-primary border-0">
                {unread} new
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!selectMode && (
              <>
                {unread > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </Button>
                )}
                {hasAny && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground px-2"
                    onClick={() => setSelectMode(true)}
                  >
                    Select
                  </Button>
                )}
              </>
            )}

            {selectMode && (
              <>
                {selectedIds.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={deleteSelected}
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete ({selectedIds.size})
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── List ── */}
        {/* Bug 3 fix: plain overflow div instead of Radix ScrollArea so iOS
            touch-scroll works inside the popover without chaining to the page. */}
        <div
          className="max-h-[360px] overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <Bell className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground/60">
                Activity reminders will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-3 px-4 py-3 transition-colors group ${
                    !n.isRead ? "bg-primary/5" : ""
                  } ${selectMode ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/20"} ${
                    selectMode && selectedIds.has(n.id) ? "bg-primary/10 hover:bg-primary/10" : ""
                  }`}
                  onClick={selectMode ? () => toggleSelect(n.id) : undefined}
                >
                  {/* Select checkbox */}
                  {selectMode && (
                    <div className="flex items-center shrink-0 pt-0.5">
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          selectedIds.has(n.id)
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {selectedIds.has(n.id) && (
                          <CheckCheck className="w-2.5 h-2.5 text-primary-foreground" />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm leading-snug ${
                          !n.isRead
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.isRead && !selectMode && (
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Per-row actions (hidden in select mode) */}
                  {!selectMode && (
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!n.isRead && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            markRead.mutate({ id: n.id });
                          }}
                          title="Mark as read"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive/60 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotif.mutate({ id: n.id });
                        }}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer: Clear All ── */}
        {hasAny && !selectMode && (
          <>
            <Separator />
            <div className="px-4 py-2.5">
              {clearConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex-1">
                    Delete all {notifications.length} notification{notifications.length !== 1 ? "s" : ""}?
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => setClearConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => clearAll.mutate()}
                    disabled={clearAll.isPending}
                  >
                    Delete all
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive w-full justify-start"
                  onClick={() => setClearConfirm(true)}
                >
                  <Trash2 className="w-3 h-3" />
                  Clear all notifications
                </Button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function Header() {
  const { user } = useUser();
  const { data } = useGetDashboardSummary();

  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6">
      {/* Mobile hamburger */}
      <div className="flex items-center gap-3 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <Sidebar />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="OPE-FX Logo" className="h-7 w-7" />
          <span className="font-bold tracking-tight font-mono text-sm">OPE-FX</span>
        </div>
      </div>

      {/* Desktop spacer */}
      <div className="hidden lg:block" />

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Balance + P&L — desktop only */}
        <div className="hidden sm:flex items-center gap-4 mr-2">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Balance</span>
            <span className="text-sm font-semibold font-mono tracking-tight text-foreground">
              {data ? formatCurrency(data.currentBalance) : "$---.--"}
            </span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Today's P/L</span>
            <span
              className={`text-sm font-semibold font-mono tracking-tight ${
                data && data.todayPnl < 0 ? "text-destructive" : "text-primary"
              }`}
            >
              {data ? `${data.todayPnl > 0 ? "+" : ""}${formatCurrency(data.todayPnl)}` : "+$---.--"}
            </span>
          </div>
        </div>

        <NotificationBell />

        <Avatar className="h-8 w-8 ring-2 ring-border/50">
          <AvatarImage src={user?.imageUrl} alt={user?.fullName || "User"} />
          <AvatarFallback className="bg-primary/20 text-primary">
            {user?.firstName?.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  // Connect to the real-time alert stream (fires toasts + sounds on alert trigger)
  useAlertStream();
  useWebPushNotifications();

  return (
    <div className="min-h-[100dvh] flex bg-background text-foreground selection:bg-primary/30">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 lg:p-6 lg:pb-12 bg-background/50">
          <div className="max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* Mobile Floating Action Button */}
      <Button
        onClick={() => setLocation("/trades/new")}
        className="lg:hidden fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg shadow-primary/20 p-0 flex items-center justify-center bg-primary hover:bg-primary/90 text-primary-foreground z-50"
        aria-label="Log new trade"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
