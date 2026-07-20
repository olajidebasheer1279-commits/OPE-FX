import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, ImagePlus, Info, Loader2, X, TrendingUp, TrendingDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateTrade,
  useUpdateTrade,
  useGetAccount,
  getListTradesQueryKey,
  getGetDashboardSummaryQueryKey,
  type Trade,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { computeTradeCalc, calcLotSizeFromRisk, getInstrumentSpec, type Market } from "@workspace/calc-engine";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKETS = ["Forex", "Metals", "Indices", "Synthetic Indices", "Crypto"] as const;
type MarketType = (typeof MARKETS)[number];

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------

const tradeFormSchema = z.object({
  symbol: z.string().min(1, "Required"),
  market: z.enum(MARKETS),
  direction: z.enum(["long", "short"]),
  entryPrice: z.coerce.number({ message: "Required" }).positive("Must be > 0"),
  exitPrice: z.coerce.number().optional().or(z.literal("")),
  stopLoss: z.coerce.number().optional().or(z.literal("")),
  takeProfit: z.coerce.number().optional().or(z.literal("")),
  // Normal mode: user enters lot size
  lotSize: z.coerce.number().optional().or(z.literal("")),
  // Risk % mode: user enters target risk %, lot size is computed
  targetRiskPercent: z.coerce.number().optional().or(z.literal("")),
  timeframe: z.string().optional(),
  strategy: z.string().optional(),
  notes: z.string().optional(),
  openedAt: z.string().min(1, "Required"),
  closedAt: z.string().optional(),
});

type TradeFormValues = z.infer<typeof tradeFormSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultValues(trade?: Trade): TradeFormValues {
  return {
    symbol: trade?.symbol ?? "",
    market: (trade?.market as MarketType) ?? "Forex",
    direction: trade?.direction ?? "long",
    entryPrice: trade?.entryPrice ?? ("" as unknown as number),
    exitPrice: trade?.exitPrice ?? ("" as unknown as number),
    stopLoss: trade?.stopLoss ?? ("" as unknown as number),
    takeProfit: trade?.takeProfit ?? ("" as unknown as number),
    lotSize: trade?.lotSize ?? ("" as unknown as number),
    targetRiskPercent: "" as unknown as number,
    timeframe: trade?.timeframe ?? "",
    strategy: trade?.strategy ?? "",
    notes: trade?.notes ?? "",
    openedAt: toDatetimeLocal(trade?.openedAt) || toDatetimeLocal(new Date().toISOString()),
    closedAt: toDatetimeLocal(trade?.closedAt),
  };
}

function fmtNum(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return "—";
  return val.toFixed(decimals);
}

function fmtCcy(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return `$${Math.abs(val).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Screenshot field (unchanged)
// ---------------------------------------------------------------------------

function ScreenshotField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      // Step 1 — request upload parameters from our API
      const res = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to get upload parameters");
      }
      const params = await res.json() as Record<string, unknown>;

      if (params.uploadType === "cloudinary") {
        // ── Cloudinary: POST FormData directly to Cloudinary CDN ────────────
        // Images are stored permanently on Cloudinary — no workspace dependency.
        const formData = new FormData();
        formData.append("file", file);
        formData.append("api_key", String(params.apiKey));
        formData.append("timestamp", String(params.timestamp));
        formData.append("signature", String(params.signature));
        formData.append("folder", String(params.folder ?? "ope-fx-trades"));
        // Required when the server signs with SHA-256 (accounts created after Nov 2020)
        if (params.signatureAlgorithm === "sha256") {
          formData.append("signature_algorithm", "sha256");
        }

        const uploadRes = await fetch(String(params.uploadURL), {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(uploadErr.error?.message ?? "Cloudinary upload failed");
        }
        const uploadData = await uploadRes.json() as { secure_url: string };
        onChange(uploadData.secure_url);
      } else {
        // ── Replit Object Storage: presigned PUT directly to GCS ─────────────
        const putRes = await fetch(String(params.uploadURL), {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!putRes.ok) throw new Error("Upload to storage failed");
        onChange(String(params.objectPath));
      }
    } catch (err) {
      toast({
        title: "Image upload failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const resolvedSrc = value.startsWith("/objects") ? `/api/storage${value}` : value;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {value ? (
        <div className="relative w-full max-w-[220px]">
          <img
            src={resolvedSrc}
            alt={label}
            className="rounded-lg border border-border w-full h-32 object-cover"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
              const placeholder = target.nextElementSibling as HTMLElement | null;
              if (placeholder) placeholder.style.display = "flex";
            }}
          />
          <div style={{ display: "none" }} className="rounded-lg border border-dashed border-border w-full h-32 flex flex-col items-center justify-center gap-1 bg-secondary/20 text-muted-foreground">
            <ImagePlus className="h-5 w-5" />
            <span className="text-xs">Image unavailable</span>
          </div>
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 w-full max-w-[220px] h-32 rounded-lg border border-dashed border-border bg-secondary/20 cursor-pointer hover:bg-secondary/40 transition-colors">
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Upload image</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculation preview panel
// ---------------------------------------------------------------------------

interface CalcPreviewPanelProps {
  values: TradeFormValues;
  accountBalance: number;
  riskMode: "lot" | "riskPercent";
  manualRiskAmount: string;
  onManualRiskAmountChange: (v: string) => void;
}

function CalcPreviewPanel({ values, accountBalance, riskMode, manualRiskAmount, onManualRiskAmountChange }: CalcPreviewPanelProps) {
  const entry = Number(values.entryPrice) || 0;
  const sl = Number(values.stopLoss) || null;
  const tp = Number(values.takeProfit) || null;
  const exit = Number(values.exitPrice) || null;
  const targetRisk = Number(values.targetRiskPercent) || null;

  // In Risk % mode, compute lot size from risk %; otherwise use entered lot size
  const lotSize = useMemo(() => {
    if (riskMode === "riskPercent" && entry > 0 && sl !== null && targetRisk !== null && targetRisk > 0) {
      return calcLotSizeFromRisk({
        market: values.market as Market,
        symbol: values.symbol || "EURUSD",
        direction: values.direction,
        entryPrice: entry,
        stopLoss: sl,
        riskPercent: targetRisk,
        accountBalance,
      }) ?? 0;
    }
    return Number(values.lotSize) || 0;
  }, [riskMode, entry, sl, tp, targetRisk, values.market, values.symbol, values.direction, values.lotSize, accountBalance]);

  const calc = useMemo(() => {
    if (entry <= 0 || lotSize <= 0) return null;
    return computeTradeCalc({
      market: values.market as Market,
      symbol: values.symbol || "EURUSD",
      direction: values.direction,
      entryPrice: entry,
      stopLoss: sl,
      takeProfit: tp,
      exitPrice: exit,
      lotSize,
      accountBalance,
    });
  }, [entry, sl, tp, exit, lotSize, values.market, values.symbol, values.direction, accountBalance]);

  // Only render if we have at least entry + one of SL/TP
  if (!calc || (sl === null && tp === null)) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
        Enter Entry and Stop Loss to see live calculations
      </div>
    );
  }

  // --- Manual risk override (non-USD Forex cross pairs) ---
  const manualRiskNum = parseFloat(manualRiskAmount) || 0;
  const derivedRiskPct =
    calc.requiresManualRisk && manualRiskNum > 0 && accountBalance > 0
      ? (manualRiskNum / accountBalance) * 100
      : null;
  const derivedPotProfit =
    calc.requiresManualRisk &&
    manualRiskNum > 0 &&
    calc.slPips !== null &&
    calc.tpPips !== null &&
    calc.slPips > 0
      ? manualRiskNum * (calc.tpPips / calc.slPips)
      : null;
  const derivedProfitPct =
    derivedPotProfit !== null && accountBalance > 0
      ? (derivedPotProfit / accountBalance) * 100
      : null;

  const hasRisk = calc.requiresManualRisk ? manualRiskNum > 0 : calc.riskAmount !== null;
  const hasProfit = calc.requiresManualRisk ? derivedPotProfit !== null : calc.potentialProfit !== null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Live Calculations
        </span>
        {riskMode === "riskPercent" && lotSize > 0 && (
          <Badge variant="secondary" className="text-xs">
            Computed lot: {lotSize.toFixed(2)}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* SL distance */}
        <div className="bg-background rounded p-2 text-center">
          <div className="text-xs text-muted-foreground mb-0.5">SL Distance</div>
          <div className="text-sm font-semibold">
            {calc.slPips !== null ? `${calc.slPips} ${calc.usesPoints ? "pts" : "pips"}` : "—"}
          </div>
        </div>

        {/* TP distance */}
        <div className="bg-background rounded p-2 text-center">
          <div className="text-xs text-muted-foreground mb-0.5">TP Distance</div>
          <div className="text-sm font-semibold">
            {calc.tpPips !== null ? `${calc.tpPips} ${calc.usesPoints ? "pts" : "pips"}` : "—"}
          </div>
        </div>

        {/* Risk amount — manual input for cross pairs, auto for everything else */}
        {calc.requiresManualRisk ? (
          <div className="bg-background rounded p-2">
            <div className="text-xs text-muted-foreground mb-0.5">Risk Amount (MT5)</div>
            <input
              type="number"
              step="any"
              min="0"
              value={manualRiskAmount}
              onChange={(e) => onManualRiskAmountChange(e.target.value)}
              placeholder="From MT5"
              className="w-full text-sm font-semibold bg-transparent border-b border-border focus:outline-none focus:border-primary placeholder:text-muted-foreground/50 placeholder:font-normal"
            />
          </div>
        ) : (
          <div className={`rounded p-2 text-center ${hasRisk ? "bg-red-500/10" : "bg-background"}`}>
            <div className="text-xs text-muted-foreground mb-0.5">Risk Amount</div>
            <div className={`text-sm font-semibold ${hasRisk ? "text-red-400" : ""}`}>
              {hasRisk ? fmtCcy(calc.riskAmount) : "—"}
            </div>
          </div>
        )}

        {/* Risk % — derived from manual amount for cross pairs */}
        <div className={`rounded p-2 text-center ${hasRisk ? "bg-red-500/10" : "bg-background"}`}>
          <div className="text-xs text-muted-foreground mb-0.5">Risk %</div>
          <div className={`text-sm font-semibold ${hasRisk ? "text-red-400" : ""}`}>
            {calc.requiresManualRisk
              ? (derivedRiskPct !== null ? `${fmtNum(derivedRiskPct)}%` : "—")
              : (calc.riskPercent !== null ? `${fmtNum(calc.riskPercent)}%` : "—")}
          </div>
        </div>

        {/* Potential profit — derived from pip ratio × manual risk for cross pairs */}
        <div className={`rounded p-2 text-center ${hasProfit ? "bg-emerald-500/10" : "bg-background"}`}>
          <div className="text-xs text-muted-foreground mb-0.5">Pot. Profit</div>
          <div className={`text-sm font-semibold ${hasProfit ? "text-emerald-400" : ""}`}>
            {calc.requiresManualRisk
              ? (derivedPotProfit !== null ? fmtCcy(derivedPotProfit) : "—")
              : (hasProfit ? fmtCcy(calc.potentialProfit) : "—")}
          </div>
        </div>

        {/* Potential profit % */}
        <div className={`rounded p-2 text-center ${hasProfit ? "bg-emerald-500/10" : "bg-background"}`}>
          <div className="text-xs text-muted-foreground mb-0.5">Profit %</div>
          <div className={`text-sm font-semibold ${hasProfit ? "text-emerald-400" : ""}`}>
            {calc.requiresManualRisk
              ? (derivedProfitPct !== null ? `${fmtNum(derivedProfitPct)}%` : "—")
              : (calc.potentialProfitPercent !== null ? `${fmtNum(calc.potentialProfitPercent)}%` : "—")}
          </div>
        </div>

        {/* R:R */}
        <div className="bg-background rounded p-2 text-center col-span-2">
          <div className="text-xs text-muted-foreground mb-0.5">Risk : Reward</div>
          <div className={`text-sm font-semibold ${calc.riskRewardRatio !== null && calc.riskRewardRatio >= 1 ? "text-emerald-400" : calc.riskRewardRatio !== null ? "text-orange-400" : ""}`}>
            {calc.riskRewardRatio !== null ? `1 : ${fmtNum(calc.riskRewardRatio)}` : "—"}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {calc.warnings.length > 0 && (
        <div className="space-y-1">
          {calc.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-orange-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Helper message for cross-currency pairs */}
      {calc.requiresManualRisk && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground border border-border/50 rounded p-2 bg-muted/20">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          <span>
            This pair requires manual Risk Amount because MT5 calculates pip value using live
            currency conversion. Enter the exact Risk Amount from your MT5 trade.
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function TradeFormDialog({
  open,
  onOpenChange,
  trade,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade?: Trade;
}) {
  const { toast } = useToast();
  const [beforeUrl, setBeforeUrl] = useState(trade?.beforeScreenshotUrl ?? "");
  const [afterUrl, setAfterUrl] = useState(trade?.afterScreenshotUrl ?? "");
  const [riskMode, setRiskMode] = useState<"lot" | "riskPercent">("lot");
  const [manualRiskAmount, setManualRiskAmount] = useState(
    trade?.riskAmount != null ? String(trade.riskAmount) : "",
  );

  // Get account balance for live calculations
  const { data: accountData } = useGetAccount();
  const accountBalance = accountData?.currentBalance ?? 10000;

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(tradeFormSchema),
    defaultValues: defaultValues(trade),
  });

  const watchedValues = useWatch({ control: form.control });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues(trade));
      setBeforeUrl(trade?.beforeScreenshotUrl ?? "");
      setAfterUrl(trade?.afterScreenshotUrl ?? "");
      setRiskMode("lot");
      setManualRiskAmount(trade?.riskAmount != null ? String(trade.riskAmount) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trade]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const createMutation = useCreateTrade({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Trade logged" });
        onOpenChange(false);
      },
      onError: (err) =>
        toast({ title: "Failed to save trade", description: err.message, variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateTrade({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Trade updated" });
        onOpenChange(false);
      },
      onError: (err) =>
        toast({ title: "Failed to save trade", description: err.message, variant: "destructive" }),
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: TradeFormValues) => {
    const numOrUndef = (v: number | string | undefined) =>
      v === "" || v === undefined || Number.isNaN(v) ? undefined : Number(v);

    // In Risk % mode, compute lot size from risk %
    let resolvedLotSize: number;
    if (riskMode === "riskPercent") {
      const entry = Number(values.entryPrice);
      const sl = Number(values.stopLoss);
      const riskPct = Number(values.targetRiskPercent);
      if (!entry || !sl || !riskPct) {
        toast({
          title: "Cannot compute lot size",
          description: "Entry, Stop Loss, and Risk % are all required in Risk % mode.",
          variant: "destructive",
        });
        return;
      }
      const computed = calcLotSizeFromRisk({
        market: values.market as Market,
        symbol: values.symbol,
        direction: values.direction,
        entryPrice: entry,
        stopLoss: sl,
        riskPercent: riskPct,
        accountBalance,
      });
      if (!computed || computed <= 0) {
        toast({
          title: "Invalid lot size computed",
          description: "Check your SL distance and risk % values.",
          variant: "destructive",
        });
        return;
      }
      resolvedLotSize = computed;
    } else {
      const ls = Number(values.lotSize);
      if (!ls || ls <= 0) {
        toast({ title: "Lot size is required", variant: "destructive" });
        return;
      }
      resolvedLotSize = ls;
    }

    // For non-USD Forex cross pairs the engine can't reliably compute a dollar
    // risk amount — send the manually entered value so the server stores it.
    const spec = getInstrumentSpec(values.market as Market, values.symbol);
    const isCrossPair = values.market === "Forex" && spec.quoteType === "approximate";
    const manualRiskNum = isCrossPair && manualRiskAmount ? Number(manualRiskAmount) : undefined;

    const payload = {
      symbol: values.symbol.toUpperCase(),
      market: values.market,
      direction: values.direction,
      entryPrice: Number(values.entryPrice),
      exitPrice: numOrUndef(values.exitPrice),
      stopLoss: numOrUndef(values.stopLoss),
      takeProfit: numOrUndef(values.takeProfit),
      lotSize: resolvedLotSize,
      riskAmount: manualRiskNum,
      timeframe: values.timeframe || undefined,
      strategy: values.strategy || undefined,
      notes: values.notes || undefined,
      beforeScreenshotUrl: beforeUrl || undefined,
      afterScreenshotUrl: afterUrl || undefined,
      openedAt: new Date(values.openedAt).toISOString(),
      closedAt: values.closedAt ? new Date(values.closedAt).toISOString() : undefined,
    };

    if (trade) {
      updateMutation.mutate({ id: trade.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  // Build the partial calc values for the preview (use the watched form state)
  const previewValues: TradeFormValues = {
    symbol: watchedValues.symbol ?? "",
    market: (watchedValues.market ?? "Forex") as MarketType,
    direction: (watchedValues.direction ?? "long") as "long" | "short",
    entryPrice: watchedValues.entryPrice ?? ("" as unknown as number),
    exitPrice: watchedValues.exitPrice ?? ("" as unknown as number),
    stopLoss: watchedValues.stopLoss ?? ("" as unknown as number),
    takeProfit: watchedValues.takeProfit ?? ("" as unknown as number),
    lotSize: watchedValues.lotSize ?? ("" as unknown as number),
    targetRiskPercent: watchedValues.targetRiskPercent ?? ("" as unknown as number),
    timeframe: watchedValues.timeframe ?? "",
    strategy: watchedValues.strategy ?? "",
    notes: watchedValues.notes ?? "",
    openedAt: watchedValues.openedAt ?? "",
    closedAt: watchedValues.closedAt ?? "",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trade ? "Edit Trade" : "Log Trade"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* ---- Symbol / Market / Direction ---- */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pair / Symbol</FormLabel>
                    <FormControl>
                      <Input placeholder="EURUSD" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="market"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Market</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MARKETS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Direction</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="long">
                          <span className="flex items-center gap-1.5">
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Long
                          </span>
                        </SelectItem>
                        <SelectItem value="short">
                          <span className="flex items-center gap-1.5">
                            <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Short
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="entryPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entry Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stopLoss"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stop Loss</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="takeProfit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Take Profit</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ---- Risk Mode Toggle + Lot Size / Risk % ---- */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Position sizing:</span>
                <div className="flex rounded-md overflow-hidden border border-border">
                  <button
                    type="button"
                    onClick={() => setRiskMode("lot")}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${riskMode === "lot" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  >
                    Lot Size
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskMode("riskPercent")}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${riskMode === "riskPercent" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  >
                    Risk % Mode
                  </button>
                </div>
              </div>

              {riskMode === "lot" ? (
                <FormField
                  control={form.control}
                  name="lotSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lot Size</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" placeholder="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="targetRiskPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Risk % of Balance</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="10"
                          placeholder="e.g. 1.5"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        Balance: ${accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* ---- Live Calculation Preview ---- */}
            <CalcPreviewPanel
              values={previewValues}
              accountBalance={accountBalance}
              riskMode={riskMode}
              manualRiskAmount={manualRiskAmount}
              onManualRiskAmountChange={setManualRiskAmount}
            />

            {/* ---- Exit Price ---- */}
            <FormField
              control={form.control}
              name="exitPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Exit Price</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" placeholder="Leave blank if open" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ---- Timeframe / Strategy / Dates ---- */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="timeframe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timeframe</FormLabel>
                    <FormControl>
                      <Input placeholder="H1, H4, D1..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="strategy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Strategy</FormLabel>
                    <FormControl>
                      <Input placeholder="Order block, breakout..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="openedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opened At</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="closedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Closed At</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Setup notes, execution quality..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <ScreenshotField label="Before Screenshot" value={beforeUrl} onChange={setBeforeUrl} />
              <ScreenshotField label="After Screenshot" value={afterUrl} onChange={setAfterUrl} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {trade ? "Save Changes" : "Log Trade"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
