import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImagePlus, Loader2, X } from "lucide-react";
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
import { useUpload } from "@workspace/object-storage-web";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateTrade,
  useUpdateTrade,
  getListTradesQueryKey,
  getGetDashboardSummaryQueryKey,
  type Trade,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

const MARKETS = ["Forex", "Synthetic Indices"] as const;

const tradeFormSchema = z.object({
  symbol: z.string().min(1, "Required"),
  market: z.enum(MARKETS),
  direction: z.enum(["long", "short"]),
  entryPrice: z.coerce.number({ message: "Required" }),
  exitPrice: z.coerce.number().optional().or(z.literal("")),
  stopLoss: z.coerce.number().optional().or(z.literal("")),
  takeProfit: z.coerce.number().optional().or(z.literal("")),
  lotSize: z.coerce.number({ message: "Required" }).positive(),
  riskPercent: z.coerce.number().optional().or(z.literal("")),
  riskAmount: z.coerce.number().optional().or(z.literal("")),
  timeframe: z.string().optional(),
  strategy: z.string().optional(),
  notes: z.string().optional(),
  openedAt: z.string().min(1, "Required"),
  closedAt: z.string().optional(),
});

type TradeFormValues = z.infer<typeof tradeFormSchema>;

function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultValues(trade?: Trade): TradeFormValues {
  return {
    symbol: trade?.symbol ?? "",
    market: (trade?.market as (typeof MARKETS)[number]) ?? "Forex",
    direction: trade?.direction ?? "long",
    entryPrice: trade?.entryPrice ?? ("" as unknown as number),
    exitPrice: trade?.exitPrice ?? ("" as unknown as number),
    stopLoss: trade?.stopLoss ?? ("" as unknown as number),
    takeProfit: trade?.takeProfit ?? ("" as unknown as number),
    lotSize: trade?.lotSize ?? ("" as unknown as number),
    riskPercent: trade?.riskPercent ?? ("" as unknown as number),
    riskAmount: trade?.riskAmount ?? ("" as unknown as number),
    timeframe: trade?.timeframe ?? "",
    strategy: trade?.strategy ?? "",
    notes: trade?.notes ?? "",
    openedAt: toDatetimeLocal(trade?.openedAt) || toDatetimeLocal(new Date().toISOString()),
    closedAt: toDatetimeLocal(trade?.closedAt),
  };
}

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
  const { uploadFile, isUploading } = useUpload({
    onError: (err) =>
      toast({ title: "Image upload failed", description: err.message, variant: "destructive" }),
  });

  const handleFile = async (file: File) => {
    const result = await uploadFile(file);
    if (result) onChange(result.objectPath);
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
          />
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

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(tradeFormSchema),
    defaultValues: defaultValues(trade),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues(trade));
      setBeforeUrl(trade?.beforeScreenshotUrl ?? "");
      setAfterUrl(trade?.afterScreenshotUrl ?? "");
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
      onError: (err) => toast({ title: "Failed to save trade", description: err.message, variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateTrade({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Trade updated" });
        onOpenChange(false);
      },
      onError: (err) => toast({ title: "Failed to save trade", description: err.message, variant: "destructive" }),
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: TradeFormValues) => {
    const numOrUndef = (v: number | string | undefined) =>
      v === "" || v === undefined || Number.isNaN(v) ? undefined : Number(v);

    const payload = {
      symbol: values.symbol.toUpperCase(),
      market: values.market,
      direction: values.direction,
      entryPrice: Number(values.entryPrice),
      exitPrice: numOrUndef(values.exitPrice),
      stopLoss: numOrUndef(values.stopLoss),
      takeProfit: numOrUndef(values.takeProfit),
      lotSize: Number(values.lotSize),
      riskPercent: numOrUndef(values.riskPercent),
      riskAmount: numOrUndef(values.riskAmount),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trade ? "Edit Trade" : "Log Trade"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lotSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lot Size</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} />
                    </FormControl>
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
              <FormField
                control={form.control}
                name="riskPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Risk %</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="riskAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Risk Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
