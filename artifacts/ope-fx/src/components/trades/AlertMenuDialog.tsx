/**
 * AlertMenuDialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages up to 3 price alerts attached to a trade.
 *
 * Prompt-4 additions:
 *   • Read-only Trade ID / Market / Pair info bar at the top
 *   • Trigger Name dropdown (POI Trigger, BOS, CHOCH, etc.) + Custom text input
 *   • Settings tab (gear icon) → AlertSettingsPanel embedded inside the dialog
 *   • Updated notification format: title = trigger name, body = condition + price
 *   • Trigger name badge on AlertCard
 */
import { useState } from "react";
import {
  Bell, MoreVertical, Plus, Pencil, Trash2,
  ToggleLeft, ToggleRight, Volume2,
  Repeat, Clock, X, Check, Settings, ArrowLeft,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertSettingsPanel } from "@/components/alerts/AlertSettingsPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertCondition = "above" | "below" | "equals";
export type AlertSound = "none" | "chime" | "beep" | "bell" | "emergency_alarm" | "loud_bell" | "siren" | "air_horn" | "loud_chime" | "default_notification";
export type TriggerName = "poi" | "bos" | "choch" | "liquidity_sweep" | "entry" | "take_profit" | "stop_loss" | "custom";

export interface LocalAlert {
  /** Present when already saved to the backend */
  id?: number;
  price: string;
  condition: AlertCondition;
  note: string;
  repeat: boolean;
  color: string;
  sound: AlertSound;
  isEnabled: boolean;
  triggerName?: TriggerName;
  triggerNameCustom?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ALERTS = 3;

/** Exported so TradeFormDialog can compute the alert `name` field. */
export const TRIGGER_NAME_LABELS: Record<TriggerName, string> = {
  poi:             "POI Trigger",
  bos:             "Break of Structure Trigger",
  choch:           "CHOCH Trigger",
  liquidity_sweep: "Liquidity Sweep Trigger",
  entry:           "Entry Trigger",
  take_profit:     "Take Profit Trigger",
  stop_loss:       "Stop Loss Trigger",
  custom:          "Custom Trigger",
};

export function getTriggerDisplayName(alert: LocalAlert): string {
  if (!alert.triggerName) return "";
  if (alert.triggerName === "custom") return alert.triggerNameCustom?.trim() || "Custom Trigger";
  return TRIGGER_NAME_LABELS[alert.triggerName];
}

const BLANK_ALERT: Omit<LocalAlert, "id"> = {
  price: "",
  condition: "above",
  note: "",
  repeat: true,
  color: "#3b82f6",
  sound: "none",
  isEnabled: true,
  triggerName: undefined,
  triggerNameCustom: "",
};

const COLOR_SWATCHES = [
  { hex: "#3b82f6", label: "Blue" },
  { hex: "#22c55e", label: "Green" },
  { hex: "#eab308", label: "Yellow" },
  { hex: "#f97316", label: "Orange" },
  { hex: "#ef4444", label: "Red" },
  { hex: "#a855f7", label: "Purple" },
];

const CONDITION_LABELS: Record<AlertCondition, string> = {
  above:  "Price Goes Above",
  below:  "Price Goes Below",
  equals: "Price Equals",
};

const SOUND_LABELS: Record<AlertSound, string> = {
  none:                 "No Sound",
  chime:                "Chime",
  beep:                 "Beep",
  bell:                 "Bell",
  emergency_alarm:      "Emergency Alarm",
  loud_bell:            "Loud Bell",
  siren:                "Siren",
  air_horn:             "Air Horn",
  loud_chime:           "Loud Chime",
  default_notification: "Default Notification",
};

// ─── Web Audio sound preview ──────────────────────────────────────────────────

function playPreview(sound: AlertSound) {
  if (sound === "none") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const close = (d: number) => setTimeout(() => { try { void ctx.close(); } catch { /* ignore */ } }, d);

    if (sound === "chime") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4); close(700);
    } else if (sound === "beep") {
      osc.type = "square";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15); close(400);
    } else if (sound === "bell") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1047, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(); osc.stop(ctx.currentTime + 0.6); close(1000);
    } else if (sound === "loud_bell") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(294, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 1.2);
      gain.gain.setValueAtTime(0.7, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
      osc.start(); osc.stop(ctx.currentTime + 1.4); close(1700);
    } else if (sound === "default_notification") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1047, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3); close(600);
    } else {
      // For remaining rich sounds just do a generic preview ding
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3); close(600);
    }
  } catch { /* silent fail */ }
}

// ─── AlertEditForm ────────────────────────────────────────────────────────────

interface AlertEditFormProps {
  initial: Omit<LocalAlert, "id">;
  symbol: string;
  onSave: (data: Omit<LocalAlert, "id">) => void;
  onCancel: () => void;
}

function AlertEditForm({ initial, symbol, onSave, onCancel }: AlertEditFormProps) {
  const [form, setForm] = useState<Omit<LocalAlert, "id">>(initial);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.price || isNaN(parseFloat(form.price))) return;
    onSave(form);
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
      {/* Price + Trigger Type (condition) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Price Level
          </label>
          <Input
            type="number" step="any"
            placeholder="e.g. 1.0850"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            className="h-9"
            autoFocus
          />
          {symbol && <p className="text-xs text-muted-foreground">{symbol}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Trigger Type
          </label>
          <Select value={form.condition} onValueChange={(v) => set("condition", v as AlertCondition)}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="above">Price Goes Above</SelectItem>
              <SelectItem value="below">Price Goes Below</SelectItem>
              <SelectItem value="equals">Price Equals</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Trigger Name */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Trigger Name
        </label>
        <Select
          value={form.triggerName ?? ""}
          onValueChange={(v) => set("triggerName", v === "" ? undefined : v as TriggerName)}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Select a trigger name…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="poi">POI Trigger</SelectItem>
            <SelectItem value="bos">Break of Structure Trigger</SelectItem>
            <SelectItem value="choch">CHOCH Trigger</SelectItem>
            <SelectItem value="liquidity_sweep">Liquidity Sweep Trigger</SelectItem>
            <SelectItem value="entry">Entry Trigger</SelectItem>
            <SelectItem value="take_profit">Take Profit Trigger</SelectItem>
            <SelectItem value="stop_loss">Stop Loss Trigger</SelectItem>
            <SelectItem value="custom">Custom Trigger</SelectItem>
          </SelectContent>
        </Select>
        {form.triggerName === "custom" && (
          <Input
            placeholder="e.g. London Session, Golden Entry…"
            value={form.triggerNameCustom ?? ""}
            onChange={(e) => set("triggerNameCustom", e.target.value)}
            className="h-9 mt-2"
            maxLength={100}
            autoFocus
          />
        )}
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Note (optional)
        </label>
        <Input
          placeholder="e.g. Key resistance level"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          className="h-9"
          maxLength={200}
        />
      </div>

      {/* Sound + Repeat */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Sound
          </label>
          <Select
            value={form.sound}
            onValueChange={(v) => { set("sound", v as AlertSound); playPreview(v as AlertSound); }}
          >
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Sound</SelectItem>
              <SelectItem value="default_notification">Default Notification</SelectItem>
              <SelectItem value="loud_bell">Loud Bell</SelectItem>
              <SelectItem value="chime">Chime</SelectItem>
              <SelectItem value="bell">Bell</SelectItem>
              <SelectItem value="beep">Beep</SelectItem>
              <SelectItem value="loud_chime">Loud Chime</SelectItem>
              <SelectItem value="emergency_alarm">Emergency Alarm</SelectItem>
              <SelectItem value="siren">Siren</SelectItem>
              <SelectItem value="air_horn">Air Horn</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Repeat
          </label>
          <div className="flex rounded-md overflow-hidden border border-border h-9">
            <button
              type="button"
              onClick={() => set("repeat", true)}
              className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
                form.repeat ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Repeat className="h-3 w-3" /> Repeat
            </button>
            <button
              type="button"
              onClick={() => set("repeat", false)}
              className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
                !form.repeat ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Clock className="h-3 w-3" /> Once
            </button>
          </div>
        </div>
      </div>

      {/* Color swatches */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Color
        </label>
        <div className="flex gap-2">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c.hex}
              type="button"
              title={c.label}
              onClick={() => set("color", c.hex)}
              className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c.hex,
                borderColor: form.color === c.hex ? "white" : "transparent",
                boxShadow: form.color === c.hex ? `0 0 0 2px ${c.hex}` : undefined,
              }}
            >
              {form.color === c.hex && <Check className="h-3.5 w-3.5 text-white mx-auto" />}
            </button>
          ))}
        </div>
      </div>

      {/* Status toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 bg-background">
        <span className="text-sm font-medium">Status</span>
        <button
          type="button"
          onClick={() => set("isEnabled", !form.isEnabled)}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
            form.isEnabled ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"
          }`}
        >
          {form.isEnabled
            ? <><ToggleRight className="h-3.5 w-3.5" /> Enabled</>
            : <><ToggleLeft  className="h-3.5 w-3.5" /> Disabled</>}
        </button>
      </div>

      {/* Notification preview */}
      {(form.triggerName || form.price) && (
        <div className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Notification Preview
          </p>
          <p className="text-sm font-semibold">
            {form.triggerName ? getTriggerDisplayName({ ...form } as LocalAlert) : "Alert"}
          </p>
          {form.price && (
            <p className="text-xs text-muted-foreground">
              {CONDITION_LABELS[form.condition]} {parseFloat(form.price || "0").toFixed(5)}
              {form.note && <><br />Note: {form.note}</>}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          type="button" size="sm"
          onClick={handleSave}
          disabled={!form.price || isNaN(parseFloat(form.price))}
        >
          <Check className="h-3.5 w-3.5 mr-1" /> Save Alert
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── AlertCard ────────────────────────────────────────────────────────────────

interface AlertCardProps {
  alert: LocalAlert;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}

function AlertCard({ alert, index: _index, onEdit, onDelete, onToggleEnabled }: AlertCardProps) {
  const triggerDisplay = getTriggerDisplayName(alert);
  return (
    <div className="relative flex items-start gap-3 rounded-xl border border-border bg-background p-3 overflow-hidden">
      {/* Color bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: alert.color }} />

      {/* Bell icon */}
      <div
        className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${alert.color}20` }}
      >
        <Bell className="h-4 w-4" style={{ color: alert.color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Trigger name (if set) */}
        {triggerDisplay && (
          <p className="text-xs font-semibold text-foreground">{triggerDisplay}</p>
        )}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm font-semibold tabular-nums">
            {parseFloat(alert.price).toFixed(5)}
          </span>
          <span className="text-xs text-muted-foreground">
            {CONDITION_LABELS[alert.condition]}
          </span>
        </div>
        {alert.note && <p className="text-xs text-muted-foreground truncate">{alert.note}</p>}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${
              alert.isEnabled ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/30 text-muted-foreground"
            }`}
          >
            {alert.isEnabled ? "Active" : "Disabled"}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border text-muted-foreground">
            {alert.repeat
              ? <><Repeat className="h-2.5 w-2.5 mr-0.5" />Repeat</>
              : <><Clock  className="h-2.5 w-2.5 mr-0.5" />Once</>}
          </Badge>
          {alert.sound !== "none" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border text-muted-foreground">
              <Volume2 className="h-2.5 w-2.5 mr-0.5" />
              {SOUND_LABELS[alert.sound]}
            </Badge>
          )}
        </div>
      </div>

      {/* ⋮ menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex-shrink-0 h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onToggleEnabled}>
            {alert.isEnabled
              ? <><ToggleLeft  className="h-3.5 w-3.5 mr-2" /> Disable</>
              : <><ToggleRight className="h-3.5 w-3.5 mr-2" /> Enable</>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── AlertMenuDialog ──────────────────────────────────────────────────────────

interface AlertMenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alerts: LocalAlert[];
  onAlertsChange: (alerts: LocalAlert[]) => void;
  /** Inherited from the parent trade form */
  symbol: string;
  market: string;
  /** Trade ID (for display only) — undefined for unsaved trades */
  tradeId?: number;
}

export function AlertMenuDialog({
  open,
  onOpenChange,
  alerts,
  onAlertsChange,
  symbol,
  market,
  tradeId,
}: AlertMenuDialogProps) {
  /**
   * editingIndex:
   *   null  = viewing list
   *   -1    = adding a new alert
   *   >= 0  = editing existing alert at that index
   */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const handleSaveEdit = (data: Omit<LocalAlert, "id">) => {
    if (editingIndex === -1) {
      onAlertsChange([...alerts, data]);
    } else if (editingIndex !== null) {
      const updated = alerts.map((a, i) =>
        i === editingIndex ? { ...data, id: a.id } : a,
      );
      onAlertsChange(updated);
    }
    setEditingIndex(null);
  };

  const handleDelete = (index: number) => {
    onAlertsChange(alerts.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleToggleEnabled = (index: number) => {
    onAlertsChange(alerts.map((a, i) => i === index ? { ...a, isEnabled: !a.isEnabled } : a));
  };

  const handleCancelEdit = () => setEditingIndex(null);

  const editingAlert = editingIndex !== null && editingIndex >= 0 ? alerts[editingIndex] : null;

  const initialForForm: Omit<LocalAlert, "id"> = editingAlert
    ? {
        price: editingAlert.price,
        condition: editingAlert.condition,
        note: editingAlert.note,
        repeat: editingAlert.repeat,
        color: editingAlert.color,
        sound: editingAlert.sound,
        isEnabled: editingAlert.isEnabled,
        triggerName: editingAlert.triggerName,
        triggerNameCustom: editingAlert.triggerNameCustom ?? "",
      }
    : { ...BLANK_ALERT };

  const handleClose = () => {
    setEditingIndex(null);
    setShowSettings(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                {showSettings ? (
                  <Settings className="h-4 w-4 text-primary" />
                ) : (
                  <Bell className="h-4 w-4 text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base">
                  {showSettings ? "Alert Settings" : "Trade Alerts"}
                </DialogTitle>
                {!showSettings && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {symbol ? `Monitoring ${symbol.toUpperCase()}` : "Set price alerts for this trade"}
                    {" · "}Up to {MAX_ALERTS} alerts
                  </p>
                )}
              </div>
            </div>

            {/* Settings / Back toggle */}
            <button
              type="button"
              onClick={() => { setShowSettings((s) => !s); setEditingIndex(null); }}
              className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                showSettings
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={showSettings ? "Back to alerts" : "Alert settings"}
            >
              {showSettings ? <ArrowLeft className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* ── Settings panel ── */}
          {showSettings ? (
            <AlertSettingsPanel onBack={() => setShowSettings(false)} />
          ) : (
            <>
              {/* ── Read-only trade info bar ── */}
              <div className="flex items-center gap-2 flex-wrap rounded-lg bg-muted/30 border border-border/50 px-3 py-2.5">
                {tradeId !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Trade ID</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                      #{tradeId}
                    </Badge>
                  </div>
                )}
                {!tradeId && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Trade</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">New</Badge>
                  </div>
                )}
                <span className="text-muted-foreground/40 text-xs">·</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Market</span>
                  <span className="text-xs font-medium">{market || "—"}</span>
                </div>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Pair</span>
                  <span className="text-xs font-semibold font-mono">{symbol ? symbol.toUpperCase() : "—"}</span>
                </div>
              </div>

              {/* ── Existing alert cards ── */}
              {alerts.map((alert, i) => (
                <div key={i}>
                  {editingIndex === i ? (
                    <AlertEditForm
                      initial={initialForForm}
                      symbol={symbol}
                      onSave={handleSaveEdit}
                      onCancel={handleCancelEdit}
                    />
                  ) : (
                    <AlertCard
                      alert={alert}
                      index={i}
                      onEdit={() => setEditingIndex(i)}
                      onDelete={() => handleDelete(i)}
                      onToggleEnabled={() => handleToggleEnabled(i)}
                    />
                  )}
                </div>
              ))}

              {/* ── New alert form ── */}
              {editingIndex === -1 && (
                <AlertEditForm
                  initial={initialForForm}
                  symbol={symbol}
                  onSave={handleSaveEdit}
                  onCancel={handleCancelEdit}
                />
              )}

              {/* ── Empty state ── */}
              {alerts.length === 0 && editingIndex === null && (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
                  <div className="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center">
                    <Bell className="h-6 w-6 opacity-40" />
                  </div>
                  <p className="text-sm">No alerts yet</p>
                  <p className="text-xs opacity-70">Add up to {MAX_ALERTS} price alerts for this trade</p>
                </div>
              )}

              {/* ── Add Alert button ── */}
              {alerts.length < MAX_ALERTS && editingIndex === null && (
                <button
                  type="button"
                  onClick={() => setEditingIndex(-1)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Add Alert
                  {alerts.length > 0 && (
                    <span className="text-xs opacity-60">({MAX_ALERTS - alerts.length} remaining)</span>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
