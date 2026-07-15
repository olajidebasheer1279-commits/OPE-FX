import { useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { UserProfile } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import {
  User,
  Wallet,
  TrendingUp,
  Download,
  LogOut,
  Save,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
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
  const [accountType, setAccountType] = useState<"live" | "demo" | "prop">("live");
  const [timezone, setTimezone] = useState("UTC");
  const [startingBalance, setStartingBalance] = useState("");
  const [currentBalanceOverride, setCurrentBalanceOverride] = useState("");
  const [showBalanceConfirm, setShowBalanceConfirm] = useState(false);
  const [initialized, setInitialized] = useState(false);

  if (account && !initialized) {
    setName(account.name);
    setBroker(account.broker ?? "");
    setCurrency(account.currency);
    setAccountType((account.accountType as "live" | "demo" | "prop") ?? "live");
    setTimezone(account.timezone ?? "UTC");
    setStartingBalance(account.startingBalance.toString());
    setCurrentBalanceOverride(account.currentBalance.toFixed(2));
    setInitialized(true);
  }

  const handleSave = () => {
    const sb = parseFloat(startingBalance);
    if (isNaN(sb) || sb <= 0) {
      toast({ title: "Invalid starting balance", variant: "destructive" });
      return;
    }
    updateAccount.mutate({
      data: {
        name,
        broker: broker || null,
        currency,
        accountType,
        timezone,
        startingBalance: sb,
      },
    });
  };

  const handleBalanceOverride = () => {
    const cb = parseFloat(currentBalanceOverride);
    if (isNaN(cb) || cb < 0) {
      toast({ title: "Invalid balance amount", variant: "destructive" });
      return;
    }
    updateAccount.mutate({ data: { currentBalance: cb } });
    setShowBalanceConfirm(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Info</CardTitle>
          <CardDescription>Your primary trading account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Primary Account" />
            </div>
            <div className="space-y-2">
              <Label>Broker</Label>
              <Input value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="e.g. IC Markets, Deriv" />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={accountType} onValueChange={(v) => setAccountType(v as "live" | "demo" | "prop")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            Save Account Info
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance Settings</CardTitle>
          <CardDescription>
            Current Balance = Starting Balance + Total Closed P&amp;L. Edit starting balance here — current balance recalculates automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Starting Balance ({currency})</Label>
              <Input
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                placeholder="10000"
                min={0}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground">Base amount before any trades</p>
            </div>
            <div className="space-y-2">
              <Label>Current Balance ({currency})</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={currentBalanceOverride}
                  onChange={(e) => setCurrentBalanceOverride(e.target.value)}
                  min={0}
                  step={0.01}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBalanceConfirm(true)}
                  className="shrink-0"
                >
                  Override
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Auto-calculated from trades • manually override with caution</p>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Calculated Current Balance</p>
              <p className="text-2xl font-bold font-mono text-primary">
                {account ? formatCurrency(account.currentBalance, currency) : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Starting Balance</p>
              <p className="text-lg font-mono">
                {account ? formatCurrency(account.startingBalance, currency) : "—"}
              </p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={updateAccount.isPending} className="w-full sm:w-auto">
            {updateAccount.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Balance Settings
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showBalanceConfirm} onOpenChange={setShowBalanceConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Override Current Balance?</AlertDialogTitle>
            <AlertDialogDescription>
              This manually sets your current balance to{" "}
              <strong>{formatCurrency(parseFloat(currentBalanceOverride) || 0, currency)}</strong>.
              It won't change your trade records and will be overwritten next time a trade is saved.
              Use this only to correct an initial discrepancy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBalanceOverride}>Confirm Override</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DefaultsTab() {
  const { toast } = useToast();
  const { data: account, isLoading } = useGetAccount();
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

  const [defaultRisk, setDefaultRisk] = useState("");
  const [defaultLot, setDefaultLot] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (account && !initialized) {
    setDefaultRisk(account.defaultRiskPercent?.toString() ?? "");
    setDefaultLot(account.defaultLotSize?.toString() ?? "");
    setInitialized(true);
  }

  const handleSave = () => {
    updateAccount.mutate({
      data: {
        defaultRiskPercent: defaultRisk ? parseFloat(defaultRisk) : null,
        defaultLotSize: defaultLot ? parseFloat(defaultLot) : null,
      },
    });
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trading Defaults</CardTitle>
        <CardDescription>Pre-fill values when logging new trades</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Default Risk % per Trade</Label>
            <div className="relative">
              <Input
                type="number"
                value={defaultRisk}
                onChange={(e) => setDefaultRisk(e.target.value)}
                placeholder="1.0"
                min={0}
                max={100}
                step={0.1}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Recommended: 1–2% per trade</p>
          </div>
          <div className="space-y-2">
            <Label>Default Lot Size</Label>
            <Input
              type="number"
              value={defaultLot}
              onChange={(e) => setDefaultLot(e.target.value)}
              placeholder="0.10"
              min={0}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground">Standard lots (0.01 = 1 micro lot)</p>
          </div>
        </div>

        <div className="bg-muted/20 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Risk Discipline Reminders
          </p>
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

function ExportTab() {
  const { toast } = useToast();
  const { data: tradesData } = useListTrades({ status: "closed" });

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
    toast({ title: `Exported ${items.length} trades to CSV` });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Data</CardTitle>
          <CardDescription>Download your trading data for analysis in other tools</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={exportTradesToCSV} className="gap-2">
              <Download className="w-4 h-4" />
              Export Trades (CSV)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            CSV exports all closed trades with full field details. Open in Excel, Google Sheets, or any spreadsheet app.
          </p>
        </CardContent>
      </Card>

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
