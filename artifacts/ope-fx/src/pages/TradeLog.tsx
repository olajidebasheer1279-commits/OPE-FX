import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Pencil,
  Trash2,
  AlertCircle,
  RefreshCcw,
  BookOpen,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { format } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce";
import { TradeFormDialog } from "@/components/trades/TradeFormDialog";
import { useToast } from "@/hooks/use-toast";
import {
  useListTrades,
  useDeleteTrade,
  getListTradesQueryKey,
  getGetDashboardSummaryQueryKey,
  type Trade,
  type ListTradesParams,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

const PAGE_SIZE = 15;

const formatCurrency = (value: number | null) =>
  value === null
    ? "-"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);

function outcomeBadge(trade: Trade) {
  if (trade.status === "open") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-medium tracking-wider bg-primary/20 text-primary border border-primary/30 animate-pulse">
        open
      </span>
    );
  }
  const outcome = trade.outcome;
  const styles =
    outcome === "win"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
      : outcome === "loss"
        ? "bg-destructive/10 text-destructive border-destructive/20"
        : "bg-secondary text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-medium tracking-wider border ${styles}`}>
      {outcome ?? "closed"}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: Trade["direction"] }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
        direction === "long"
          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
          : "bg-destructive/10 text-destructive border border-destructive/20"
      }`}
    >
      {direction === "long" ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
      {direction}
    </span>
  );
}

export default function TradeLog() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [direction, setDirection] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [outcome, setOutcome] = useState<string>("all");
  const [sort, setSort] = useState<string>("openedAt:desc");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | undefined>(undefined);
  const [deletingTrade, setDeletingTrade] = useState<Trade | undefined>(undefined);

  const [sortBy, sortDir] = sort.split(":") as [ListTradesParams["sortBy"], ListTradesParams["sortDir"]];

  const params: ListTradesParams = {
    search: debouncedSearch || undefined,
    direction: direction === "all" ? undefined : (direction as ListTradesParams["direction"]),
    status: status === "all" ? undefined : (status as ListTradesParams["status"]),
    outcome: outcome === "all" ? undefined : (outcome as ListTradesParams["outcome"]),
    sortBy,
    sortDir,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, error, refetch } = useListTrades(params);

  const deleteMutation = useDeleteTrade({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Trade deleted" });
        setDeletingTrade(undefined);
      },
      onError: (err) => toast({ title: "Failed to delete trade", description: err.message, variant: "destructive" }),
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const openCreate = () => {
    setEditingTrade(undefined);
    setFormOpen(true);
  };

  useEffect(() => {
    if (location.endsWith("/trades/new")) {
      openCreate();
      setLocation("/trades", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const openEdit = (trade: Trade) => {
    setEditingTrade(trade);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Trade Log</h1>
          <p className="text-sm text-muted-foreground">Every execution, tracked and analyzed.</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary text-primary-foreground">
          <Plus className="h-4 w-4" /> Log Trade
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search symbol, strategy, notes..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select value={direction} onValueChange={(v) => { setDirection(v); setPage(1); }}>
          <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Direction" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="long">Long</SelectItem>
            <SelectItem value="short">Short</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={outcome} onValueChange={(v) => { setOutcome(v); setPage(1); }}>
          <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Outcome" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="win">Win</SelectItem>
            <SelectItem value="loss">Loss</SelectItem>
            <SelectItem value="breakeven">Breakeven</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="openedAt:desc">Newest first</SelectItem>
            <SelectItem value="openedAt:asc">Oldest first</SelectItem>
            <SelectItem value="pnl:desc">Highest P/L</SelectItem>
            <SelectItem value="pnl:asc">Lowest P/L</SelectItem>
            <SelectItem value="riskRewardRatio:desc">Best R:R</SelectItem>
            <SelectItem value="symbol:asc">Symbol A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-center border border-border bg-card/50 rounded-xl p-8">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Failed to load trades</h2>
          <Button onClick={() => refetch()} className="gap-2">
            <RefreshCcw className="h-4 w-4" /> Retry
          </Button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-lg bg-secondary/20">
          <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-4">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">No trades found</p>
          <p className="text-sm text-muted-foreground max-w-sm mb-4">
            {debouncedSearch || direction !== "all" || status !== "all" || outcome !== "all"
              ? "No trades match your current filters."
              : "Your trade ledger is empty. Log your first execution to start tracking your performance."}
          </p>
          <Button onClick={openCreate} variant="outline" className="border-border">Log First Trade</Button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider font-mono">
                    <th className="py-3 px-4 font-medium">Date</th>
                    <th className="py-3 px-4 font-medium">Symbol</th>
                    <th className="py-3 px-4 font-medium">Dir</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Entry</th>
                    <th className="py-3 px-4 font-medium text-right">Exit</th>
                    <th className="py-3 px-4 font-medium text-right">Pips</th>
                    <th className="py-3 px-4 font-medium text-right">R:R</th>
                    <th className="py-3 px-4 font-medium text-right">Net P/L</th>
                    <th className="py-3 px-4 font-medium text-center">Shots</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-mono">
                  {data.items.map((trade) => (
                    <tr key={trade.id} className="group hover:bg-secondary/30 transition-colors">
                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{format(new Date(trade.openedAt), "MMM d, yyyy")}</td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        {trade.symbol}
                        <div className="text-[10px] text-muted-foreground font-sans">{trade.market}</div>
                      </td>
                      <td className="py-3 px-4"><DirectionBadge direction={trade.direction} /></td>
                      <td className="py-3 px-4">{outcomeBadge(trade)}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{trade.entryPrice}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{trade.exitPrice ?? "-"}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{trade.pips?.toFixed(1) ?? "-"}</td>
                      <td className="py-3 px-4 text-right">{trade.riskRewardRatio ? `${trade.riskRewardRatio.toFixed(2)}R` : "-"}</td>
                      <td className={`py-3 px-4 text-right font-semibold ${trade.pnl ? (trade.pnl > 0 ? "text-emerald-500" : trade.pnl < 0 ? "text-destructive" : "text-muted-foreground") : "text-muted-foreground"}`}>
                        {formatCurrency(trade.pnl)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(trade.beforeScreenshotUrl || trade.afterScreenshotUrl) ? (
                          <ImageIcon className="h-4 w-4 text-primary inline" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(trade)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingTrade(trade)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {data.items.map((trade) => (
              <div key={trade.id} className="p-4 rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold font-mono">{trade.symbol}</span>
                    <span className="text-xs text-muted-foreground ml-2 font-sans">{trade.market}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(trade)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeletingTrade(trade)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <DirectionBadge direction={trade.direction} />
                  {outcomeBadge(trade)}
                  <span className="text-xs text-muted-foreground font-mono ml-auto">{format(new Date(trade.openedAt), "MMM d, yyyy")}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div><p className="text-muted-foreground">Entry</p><p>{trade.entryPrice}</p></div>
                  <div><p className="text-muted-foreground">Exit</p><p>{trade.exitPrice ?? "-"}</p></div>
                  <div><p className="text-muted-foreground">R:R</p><p>{trade.riskRewardRatio ? `${trade.riskRewardRatio.toFixed(2)}R` : "-"}</p></div>
                </div>
                <div className={`mt-3 text-right font-mono font-semibold ${trade.pnl ? (trade.pnl > 0 ? "text-emerald-500" : trade.pnl < 0 ? "text-destructive" : "text-muted-foreground") : "text-muted-foreground"}`}>
                  {formatCurrency(trade.pnl)}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <PaginationItem key={p}>
                    <PaginationLink isActive={p === page} onClick={() => setPage(p)} className="cursor-pointer">
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      <TradeFormDialog open={formOpen} onOpenChange={setFormOpen} trade={editingTrade} />

      <AlertDialog open={!!deletingTrade} onOpenChange={(open) => !open && setDeletingTrade(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deletingTrade?.symbol} from your trade log and adjust your account balance accordingly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingTrade && deleteMutation.mutate({ id: deletingTrade.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
