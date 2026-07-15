import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  RefreshCcw,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { TradeFormDialog } from "@/components/trades/TradeFormDialog";
import { useToast } from "@/hooks/use-toast";
import {
  useGetTrade,
  useDeleteTrade,
  getListTradesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetTradeQueryKey,
  getGetTradeQueryOptions,
  type Trade,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/objects")) return `/api${path}`;
  return path;
}

function outcomeBadge(trade: Trade) {
  if (trade.status === "open") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs uppercase font-medium tracking-wider bg-primary/20 text-primary border border-primary/30 animate-pulse">
        Open
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs uppercase font-medium tracking-wider border ${styles}`}>
      {outcome ?? "Closed"}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-medium leading-tight">{value ?? <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 sm:p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

function FullscreenImage({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-4 right-4 text-white hover:bg-white/10 z-10"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>
      <img
        src={src}
        alt={label}
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
};

const fmt = (value: number | string | null | undefined, decimals = 5) => {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "—";
  return n.toFixed(decimals);
};

export default function TradeDetails() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fullscreenImg, setFullscreenImg] = useState<{ src: string; label: string } | null>(null);

  const tradeId = parseInt(id ?? "", 10);
  const safeId = isNaN(tradeId) ? -1 : tradeId;
  const {
    data: trade,
    isLoading,
    error,
    refetch,
  } = useGetTrade(safeId, {
    query: { ...getGetTradeQueryOptions(safeId), enabled: safeId > 0 },
  });

  const deleteMutation = useDeleteTrade({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Trade deleted" });
        setLocation("/trades");
      },
      onError: (err) =>
        toast({ title: "Failed to delete trade", description: err.message, variant: "destructive" }),
    },
  });

  const handleEditSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getGetTradeQueryKey(tradeId) });
    queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  if (isNaN(tradeId)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Invalid trade ID</h2>
        <Button onClick={() => setLocation("/trades")}>Back to Trade Log</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500 pb-24 lg:pb-0">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center border border-border bg-card/50 rounded-xl p-8">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Trade not found</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">
          This trade may have been deleted or the ID is invalid.
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCcw className="h-4 w-4" /> Retry
          </Button>
          <Button onClick={() => setLocation("/trades")}>Back to Trade Log</Button>
        </div>
      </div>
    );
  }

  const beforeUrl = resolveImageUrl(trade.beforeScreenshotUrl);
  const afterUrl = resolveImageUrl(trade.afterScreenshotUrl);
  const pnlNum = trade.pnl != null ? (typeof trade.pnl === "string" ? parseFloat(trade.pnl) : trade.pnl) : null;

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-24 lg:pb-0 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setLocation("/trades")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-mono">{trade.symbol}</h1>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider shrink-0 ${
                  trade.direction === "long"
                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
                }`}
              >
                {trade.direction === "long" ? (
                  <ArrowUpRight className="h-3 w-3 mr-0.5" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 mr-0.5" />
                )}
                {trade.direction}
              </span>
              {outcomeBadge(trade)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {trade.market} · {format(new Date(trade.openedAt), "MMM d, yyyy · HH:mm")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-11 sm:ml-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* P/L banner */}
      {pnlNum != null && (
        <div
          className={`p-4 rounded-xl border text-center ${
            pnlNum > 0
              ? "bg-emerald-500/10 border-emerald-500/20"
              : pnlNum < 0
                ? "bg-destructive/10 border-destructive/20"
                : "bg-secondary border-border"
          }`}
        >
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Net P / L</p>
          <p
            className={`text-3xl font-bold font-mono tracking-tight ${
              pnlNum > 0 ? "text-emerald-500" : pnlNum < 0 ? "text-destructive" : "text-foreground"
            }`}
          >
            {pnlNum > 0 ? "+" : ""}
            {formatCurrency(pnlNum)}
          </p>
        </div>
      )}

      {/* Execution details */}
      <Section title="Execution Details">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-5">
          <Field label="Pair" value={trade.symbol} />
          <Field label="Market" value={trade.market} />
          <Field
            label="Direction"
            value={
              <span className={trade.direction === "long" ? "text-emerald-500" : "text-destructive"}>
                {trade.direction.toUpperCase()}
              </span>
            }
          />
          <Field label="Outcome" value={outcomeBadge(trade)} />
          <Field label="Opened" value={format(new Date(trade.openedAt), "MMM d, yyyy")} />
          <Field label="Time" value={format(new Date(trade.openedAt), "HH:mm")} />
          {trade.closedAt && (
            <Field label="Closed" value={format(new Date(trade.closedAt), "MMM d, yyyy HH:mm")} />
          )}
          {trade.timeframe && <Field label="Timeframe" value={trade.timeframe} />}
          {trade.strategy && <Field label="Strategy" value={trade.strategy} />}
        </div>
      </Section>

      {/* Price & risk */}
      <Section title="Price & Risk">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-5">
          <Field label="Entry" value={fmt(trade.entryPrice, 5)} />
          <Field label="Exit" value={trade.exitPrice != null ? fmt(trade.exitPrice, 5) : undefined} />
          <Field label="Stop Loss" value={trade.stopLoss != null ? fmt(trade.stopLoss, 5) : undefined} />
          <Field label="Take Profit" value={trade.takeProfit != null ? fmt(trade.takeProfit, 5) : undefined} />
          <Field label="Lot Size" value={fmt(trade.lotSize, 2)} />
          <Field label="Risk %" value={trade.riskPercent != null ? `${fmt(trade.riskPercent, 2)}%` : undefined} />
          <Field label="Risk Amount" value={formatCurrency(trade.riskAmount)} />
          <Field label="Pips" value={trade.pips != null ? `${fmt(trade.pips, 1)} pips` : undefined} />
          <Field
            label="Risk : Reward"
            value={trade.riskRewardRatio != null ? `${fmt(trade.riskRewardRatio, 2)}R` : undefined}
          />
        </div>
      </Section>

      {/* Notes */}
      {trade.notes && (
        <Section title="Notes">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{trade.notes}</p>
        </Section>
      )}

      {/* Screenshots */}
      {(beforeUrl || afterUrl) ? (
        <Section title="Screenshots">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {beforeUrl && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Before</p>
                <button
                  type="button"
                  onClick={() => setFullscreenImg({ src: beforeUrl, label: "Before screenshot" })}
                  className="block w-full rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Open before screenshot fullscreen"
                >
                  <img
                    src={beforeUrl}
                    alt="Before screenshot"
                    className="w-full h-40 sm:h-52 object-cover hover:opacity-90 transition-opacity"
                    loading="lazy"
                  />
                </button>
                <p className="text-[10px] text-muted-foreground text-center">Tap to enlarge</p>
              </div>
            )}
            {afterUrl && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">After</p>
                <button
                  type="button"
                  onClick={() => setFullscreenImg({ src: afterUrl, label: "After screenshot" })}
                  className="block w-full rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Open after screenshot fullscreen"
                >
                  <img
                    src={afterUrl}
                    alt="After screenshot"
                    className="w-full h-40 sm:h-52 object-cover hover:opacity-90 transition-opacity"
                    loading="lazy"
                  />
                </button>
                <p className="text-[10px] text-muted-foreground text-center">Tap to enlarge</p>
              </div>
            )}
          </div>
        </Section>
      ) : (
        <div className="p-4 rounded-xl border border-dashed border-border bg-card/50 flex items-center justify-center gap-3 text-muted-foreground">
          <ImageIcon className="h-5 w-5 shrink-0" />
          <span className="text-sm">No screenshots attached to this trade</span>
        </div>
      )}

      {/* Fullscreen image overlay */}
      {fullscreenImg && (
        <FullscreenImage
          src={fullscreenImg.src}
          label={fullscreenImg.label}
          onClose={() => setFullscreenImg(null)}
        />
      )}

      {/* Edit form dialog */}
      <TradeFormDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) handleEditSuccess();
        }}
        trade={trade}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{trade.symbol}</strong> from your trade log and reverse
              its balance impact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ id: trade.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
