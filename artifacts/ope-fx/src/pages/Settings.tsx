import { useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { UserProfile } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import {
  User,
  Wallet,
  TrendingUp,
  Download,
  Upload,
  LogOut,
  Save,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Archive,
  FileText,
  FileDown,
  Loader2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import {
  useGetAccount,
  useUpdateAccount,
  getGetAccountQueryKey,
  useListTrades,
  type Trade,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/apiFetch";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Australia/Sydney",
];

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "ZAR", "NGN", "KES"];

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function AccountTab() {
  const { toast } = useToast();
  const { data: account, isLoading } = useGetAccount();
  const updateAccount = useUpdateAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAccountQueryKey() });
        toast({ title: "Account settings saved" });
      },
      onError: (err) => {
        toast({ title: "Failed to save", description: err.message, variant: "destructive" });
      },
    },
  });

  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [timezone, setTimezone] = useState("UTC");
  const [accountType, setAccountType] = useState<"live" | "demo" | "prop">("live");
  const [showBalanceAlert, setShowBalanceAlert] = useState(false);
  const [pendingBalance, setPendingBalance] = useState<string>("");
  const [startingBalance, setStartingBalance] = useState("");

  // Populate form from loaded account
  const populated = useRef(false);
  if (account && !populated.current) {
    populated.current = true;
    setName(account.name ?? "");
    setBroker(account.broker ?? "");
    setCurrency(account.currency ?? "USD");
    setTimezone(account.timezone ?? "UTC");
    setAccountType(account.accountType ?? "live");
    setStartingBalance(String(account.startingBalance ?? "10000"));
  }

  const handleSave = () => {
    updateAccount.mutate({
      data: {
        name: name || undefined,
        broker: broker || undefined,
        currency,
        timezone,
        accountType,
      },
    });
  };

  const handleBalanceChange = () => {
    const val = parseFloat(pendingBalance);
    if (isNaN(val) || val <= 0) {
      toast({ title: "Invalid balance", description: "Please enter a positive number.", variant: "destructive" });
      return;
    }
    updateAccount.mutate(
      { data: { startingBalance: val } },
      {
        onSuccess: () => {
          setStartingBalance(String(val));
          setPendingBalance("");
        },
      },
    );
    setShowBalanceAlert(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Details</CardTitle>
          <CardDescription>Your trading account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Account Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Trading Account" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="broker">Broker</Label>
              <Input id="broker" value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="e.g. Deriv, FTMO, Prop firm" />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={accountType} onValueChange={(v) => setAccountType(v as "live" | "demo" | "prop")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="demo">Demo</SelectItem>
                  <SelectItem value="prop">Prop Firm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSave} disabled={updateAccount.isPending} className="w-full sm:w-auto">
            {updateAccount.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Account Details
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Starting Balance</CardTitle>
          <CardDescription>
            Changing this will recalculate your current balance from scratch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Current Starting Balance</Label>
              <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm font-medium">
                {formatCurrency(parseFloat(startingBalance) || 0, currency)}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Current Balance</Label>
              <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm font-medium">
                {formatCurrency(parseFloat(String(account?.currentBalance ?? "0")), currency)}
              </div>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="newBalance">New Starting Balance</Label>
              <Input
                id="newBalance"
                type="number"
                min="0"
                step="100"
                value={pendingBalance}
                onChange={(e) => setPendingBalance(e.target.value)}
                placeholder="Enter new starting balance..."
              />
            </div>
            <Button
              variant="outline"
              onClick={() => { if (pendingBalance) setShowBalanceAlert(true); }}
              disabled={!pendingBalance || updateAccount.isPending}
              className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Update Balance
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showBalanceAlert} onOpenChange={setShowBalanceAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Starting Balance?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set your starting balance to{" "}
              <strong>{formatCurrency(parseFloat(pendingBalance) || 0, currency)}</strong> and
              recalculate your current balance based on all your trade P&L. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBalanceChange}>Confirm Update</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DefaultsTab() {
  const { toast } = useToast();
  const { data: account } = useGetAccount();
  const updateAccount = useUpdateAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAccountQueryKey() });
        toast({ title: "Trading defaults saved" });
      },
      onError: (err) => {
        toast({ title: "Failed to save", description: err.message, variant: "destructive" });
      },
    },
  });

  const [defaultRiskPercent, setDefaultRiskPercent] = useState("");
  const [defaultLotSize, setDefaultLotSize] = useState("");

  const populated = useRef(false);
  if (account && !populated.current) {
    populated.current = true;
    setDefaultRiskPercent(String(account.defaultRiskPercent ?? "1"));
    setDefaultLotSize(String(account.defaultLotSize ?? "0.01"));
  }

  const handleSave = () => {
    updateAccount.mutate({
      data: {
        defaultRiskPercent: parseFloat(defaultRiskPercent) || undefined,
        defaultLotSize: parseFloat(defaultLotSize) || undefined,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trading Defaults</CardTitle>
        <CardDescription>Default values pre-filled when logging a new trade</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="riskPercent">Default Risk % per Trade</Label>
            <Input
              id="riskPercent"
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={defaultRiskPercent}
              onChange={(e) => setDefaultRiskPercent(e.target.value)}
              placeholder="1.0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lotSize">Default Lot Size</Label>
            <Input
              id="lotSize"
              type="number"
              min="0.01"
              step="0.01"
              value={defaultLotSize}
              onChange={(e) => setDefaultLotSize(e.target.value)}
              placeholder="0.01"
            />
          </div>
        </div>

        <div className="bg-muted/20 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Risk Discipline Reminders</p>
          <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
            <li>Risk only 1–2% of your account per trade</li>
            <li>Never risk more than 5% in a single day</li>
            <li>Always set a stop loss before entering a trade</li>
            <li>Aim for a minimum 1.5:1 risk-to-reward ratio</li>
          </ul>
        </div>

        <Button onClick={handleSave} disabled={updateAccount.isPending} className="w-full sm:w-auto">
          {updateAccount.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Defaults
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// PDF generation helpers (print-to-PDF via new window)
// ---------------------------------------------------------------------------

function printHtmlInNewWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
  return true;
}

const PDF_STYLE = `
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #111; }
  h1 { color: #1a56db; font-size: 22px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .entry { margin-bottom: 28px; border-bottom: 1px solid #e5e7eb; padding-bottom: 24px; }
  .entry:last-child { border-bottom: none; }
  .entry h3 { font-size: 16px; margin: 0 0 8px; }
  .ratings { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0; color: #555; font-size: 13px; }
  .field { margin-top: 10px; }
  .field strong { display: block; color: #333; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3px; }
  .field p { font-size: 14px; margin: 0; white-space: pre-wrap; }
  @media print { .entry { page-break-inside: avoid; } }
`;

function generateJournalPDF(journals: Array<Record<string, unknown>>): string {
  if (journals.length === 0) return "";
  const entries = journals
    .map((j) => {
      const ratings = [
        j.mood != null && `Mood: ${j.mood}/10`,
        j.confidence != null && `Confidence: ${j.confidence}/10`,
        j.discipline != null && `Discipline: ${j.discipline}/10`,
        j.focus != null && `Focus: ${j.focus}/10`,
        j.fear != null && `Fear: ${j.fear}/10`,
        j.greed != null && `Greed: ${j.greed}/10`,
        j.sleep != null && `Sleep: ${j.sleep}/10`,
      ]
        .filter(Boolean)
        .join("  |  ");

      const fields = [
        j.tradingPlan && `<div class="field"><strong>Trading Plan</strong><p>${j.tradingPlan}</p></div>`,
        j.notes && `<div class="field"><strong>Session Notes</strong><p>${j.notes}</p></div>`,
        j.mistakes && `<div class="field"><strong>Mistakes</strong><p>${j.mistakes}</p></div>`,
        j.lessons && `<div class="field"><strong>Lessons</strong><p>${j.lessons}</p></div>`,
        j.tomorrowGoal && `<div class="field"><strong>Tomorrow's Goal</strong><p>${j.tomorrowGoal}</p></div>`,
      ]
        .filter(Boolean)
        .join("");

      return `
        <div class="entry">
          <h3>${j.date}${j.isDraft ? " (Draft)" : ""}</h3>
          ${ratings ? `<div class="ratings">${ratings}</div>` : ""}
          ${fields}
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OPE-FX Journal</title><style>${PDF_STYLE}</style></head><body>
    <h1>OPE-FX Trading Journal</h1>
    <p class="meta">Exported ${new Date().toLocaleDateString()} — ${journals.length} entries</p>
    ${entries}
  </body></html>`;
}

function generateReviewsPDF(reviews: Array<Record<string, unknown>>): string {
  if (reviews.length === 0) return "";
  const entries = reviews
    .map((r) => {
      const fields = [
        r.content && `<div class="field"><strong>Overview</strong><p>${r.content}</p></div>`,
        r.strengths && `<div class="field"><strong>Strengths</strong><p>${r.strengths}</p></div>`,
        r.mistakes && `<div class="field"><strong>Mistakes</strong><p>${r.mistakes}</p></div>`,
        r.lessons && `<div class="field"><strong>Lessons Learned</strong><p>${r.lessons}</p></div>`,
        r.actionPlan && `<div class="field"><strong>Action Plan</strong><p>${r.actionPlan}</p></div>`,
      ]
        .filter(Boolean)
        .join("");

      const dateLine = r.startDate && r.endDate ? ` (${r.startDate} → ${r.endDate})` : "";
      return `
        <div class="entry">
          <h3>${r.title}${dateLine}</h3>
          <div class="ratings">${String(r.period ?? "").toUpperCase()}${r.rating ? `  |  Rating: ${r.rating}/10` : ""}</div>
          ${fields}
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OPE-FX Reviews</title><style>${PDF_STYLE}</style></head><body>
    <h1>OPE-FX Performance Reviews</h1>
    <p class="meta">Exported ${new Date().toLocaleDateString()} — ${reviews.length} reviews</p>
    ${entries}
  </body></html>`;
}

// ---------------------------------------------------------------------------
// Export & Backup Tab
// ---------------------------------------------------------------------------

function ExportTab() {
  const { toast } = useToast();
  const { data: tradesData } = useListTrades({ status: "closed" });
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [loadingJournalPDF, setLoadingJournalPDF] = useState(false);
  const [loadingReviewsPDF, setLoadingReviewsPDF] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // ---- Helpers ----

  async function fetchBackupData(): Promise<Record<string, unknown> | null> {
    const res = await apiFetch("/api/backup");
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  }

  // ---- Export handlers ----

  const exportTradesToCSV = () => {
    const items = tradesData?.items ?? [];
    if (items.length === 0) {
      toast({ title: "No closed trades to export" });
      return;
    }
    const headers = [
      "ID", "Symbol", "Market", "Direction", "Status", "Entry Price", "Exit Price",
      "Stop Loss", "Take Profit", "Lot Size", "Risk %", "Risk Amount", "P&L",
      "Pips", "R:R", "Outcome", "Timeframe", "Strategy", "Notes", "Opened At", "Closed At",
    ];
    const rows = items.map((t: Trade) => [
      t.id, t.symbol, t.market, t.direction, t.status,
      t.entryPrice, t.exitPrice ?? "", t.stopLoss ?? "", t.takeProfit ?? "",
      t.lotSize, t.riskPercent ?? "", t.riskAmount ?? "", t.pnl ?? "",
      t.pips ?? "", t.riskRewardRatio ?? "", t.outcome ?? "",
      t.timeframe ?? "", t.strategy ?? "",
      `"${(t.notes ?? "").replace(/"/g, '""')}"`,
      t.openedAt, t.closedAt ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ope-fx-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${items.length} closed trades to CSV` });
  };

  const downloadFullBackup = async () => {
    setLoadingBackup(true);
    try {
      const data = await fetchBackupData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ope-fx-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Full backup downloaded successfully" });
    } catch (err) {
      toast({ title: "Backup failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingBackup(false);
    }
  };

  const exportJournalPDF = async () => {
    setLoadingJournalPDF(true);
    try {
      const data = await fetchBackupData();
      const journals = (data?.journals ?? []) as Array<Record<string, unknown>>;
      if (journals.length === 0) {
        toast({ title: "No journal entries found" });
        return;
      }
      const html = generateJournalPDF(journals);
      if (!printHtmlInNewWindow(html)) {
        toast({ title: "Pop-up blocked", description: "Please allow pop-ups for this site and try again.", variant: "destructive" });
        return;
      }
      toast({ title: `Journal export ready (${journals.length} entries) — use Print → Save as PDF` });
    } catch (err) {
      toast({ title: "Export failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingJournalPDF(false);
    }
  };

  const exportReviewsPDF = async () => {
    setLoadingReviewsPDF(true);
    try {
      const data = await fetchBackupData();
      const reviews = (data?.reviews ?? []) as Array<Record<string, unknown>>;
      if (reviews.length === 0) {
        toast({ title: "No reviews found" });
        return;
      }
      const html = generateReviewsPDF(reviews);
      if (!printHtmlInNewWindow(html)) {
        toast({ title: "Pop-up blocked", description: "Please allow pop-ups for this site and try again.", variant: "destructive" });
        return;
      }
      toast({ title: `Reviews export ready (${reviews.length} reviews) — use Print → Save as PDF` });
    } catch (err) {
      toast({ title: "Export failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingReviewsPDF(false);
    }
  };

  // ---- Import handler ----

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      const text = await file.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        toast({ title: "Invalid file", description: "The selected file is not valid JSON.", variant: "destructive" });
        return;
      }

      if (!data.version) {
        toast({ title: "Invalid backup file", description: "This doesn't appear to be a valid OPE-FX backup.", variant: "destructive" });
        return;
      }

      setRestoring(true);
      const res = await apiFetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Restore failed" }));
        throw new Error(err.error ?? "Restore failed");
      }

      const result = await res.json() as { imported: { trades: number; journals: number; reviews: number; rules: number } };
      const { imported } = result;

      // Invalidate all queries so UI reflects restored data
      queryClient.invalidateQueries();

      toast({
        title: "Backup restored successfully",
        description: `Imported: ${imported.trades} trades, ${imported.journals} journal entries, ${imported.reviews} reviews, ${imported.rules} rules`,
      });
    } catch (err) {
      toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Export section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileDown className="w-4 h-4" />
            Export Data
          </CardTitle>
          <CardDescription>Download your trading data in various formats</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button variant="outline" onClick={exportTradesToCSV} className="gap-2 justify-start">
              <FileText className="w-4 h-4 text-green-500" />
              <div className="text-left">
                <div className="text-sm font-medium">Trade Log (CSV)</div>
                <div className="text-xs text-muted-foreground">All closed trades</div>
              </div>
            </Button>

            <Button variant="outline" onClick={exportJournalPDF} disabled={loadingJournalPDF} className="gap-2 justify-start">
              {loadingJournalPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-blue-500" />}
              <div className="text-left">
                <div className="text-sm font-medium">Journal (PDF)</div>
                <div className="text-xs text-muted-foreground">All journal entries</div>
              </div>
            </Button>

            <Button variant="outline" onClick={exportReviewsPDF} disabled={loadingReviewsPDF} className="gap-2 justify-start">
              {loadingReviewsPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-purple-500" />}
              <div className="text-left">
                <div className="text-sm font-medium">Reviews (PDF)</div>
                <div className="text-xs text-muted-foreground">All performance reviews</div>
              </div>
            </Button>

            <Button variant="outline" onClick={downloadFullBackup} disabled={loadingBackup} className="gap-2 justify-start">
              {loadingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4 text-orange-500" />}
              <div className="text-left">
                <div className="text-sm font-medium">Full Backup (JSON)</div>
                <div className="text-xs text-muted-foreground">All trades, journals, reviews, rules</div>
              </div>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            CSV opens in Excel or Google Sheets. PDF exports open your browser's print dialog — choose "Save as PDF". JSON backup can be imported below.
          </p>
        </CardContent>
      </Card>

      {/* Import section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import Backup
          </CardTitle>
          <CardDescription>
            Restore data from a previously exported OPE-FX backup file (.json)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <p className="text-xs text-orange-300">
              Import adds data to your existing account (it does not overwrite). Journal entries for dates that already exist will be skipped.
            </p>
          </div>

          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />

          <Button
            onClick={() => importRef.current?.click()}
            disabled={restoring}
            className="gap-2 w-full sm:w-auto"
          >
            {restoring ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
            ) : (
              <><Upload className="w-4 h-4" /> Select Backup File</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Data & Privacy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data &amp; Privacy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 bg-muted/20 rounded-lg p-4">
            <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Your data is stored securely on Replit's managed PostgreSQL database.</p>
              <p>Authentication is handled by Clerk. Your credentials are never stored by OPE-FX.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Settings() {
  const { signOut } = useClerk();
  const { user } = useUser();

  const clerkAppearance = {
    theme: shadcn,
    cssLayerName: "clerk",
    variables: {
      colorPrimary: "hsl(221 83% 53%)",
      colorForeground: "hsl(210 40% 98%)",
      colorMutedForeground: "hsl(215 20% 65%)",
      colorBackground: "hsl(222 47% 8%)",
      colorInput: "hsl(217 33% 17%)",
      colorInputForeground: "hsl(210 40% 98%)",
      colorNeutral: "hsl(217 33% 17%)",
      fontFamily: "'Inter', sans-serif",
      borderRadius: "0.5rem",
    },
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your profile, account, and trading preferences.</p>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto sm:h-10 gap-1 sm:gap-0 mb-6">
          <TabsTrigger value="account" className="gap-2">
            <Wallet className="w-4 h-4" />
            <span className="hidden sm:inline">Account</span>
            <span className="sm:hidden">Account</span>
          </TabsTrigger>
          <TabsTrigger value="defaults" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">Trading Defaults</span>
            <span className="sm:hidden">Defaults</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-2">
            <User className="w-4 h-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <AccountTab />
        </TabsContent>

        <TabsContent value="defaults">
          <DefaultsTab />
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Profile &amp; Authentication
                <Badge variant="outline" className="text-xs">Managed by Clerk</Badge>
              </CardTitle>
              <CardDescription>
                Manage your name, email, and security settings via your Clerk account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-border">
                <UserProfile
                  routing="hash"
                  appearance={clerkAppearance}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base text-destructive/90">Session</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Signed in as</p>
                  <p className="text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
                </div>
                <Button
                  variant="outline"
                  className="border-destructive/50 text-destructive hover:bg-destructive/10 gap-2"
                  onClick={() => signOut()}
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export">
          <ExportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
