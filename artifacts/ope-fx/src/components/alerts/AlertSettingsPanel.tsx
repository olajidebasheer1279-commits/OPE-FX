/**
 * AlertSettingsPanel — per-user alert delivery preferences.
 * Embedded inside AlertMenuDialog as a second "view".
 */
import { useState } from "react";
import {
  Volume2, VolumeX, Mic, MicOff, Bell, BellOff,
  Smartphone, Monitor, Zap, ZapOff, Play, Check,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAlertSettings, type AlertSettings } from "@/hooks/useAlertSettings";

// ── Sound engine (preview only) ───────────────────────────────────────────────

function previewSound(name: string) {
  try {
    const ctx = new AudioContext();
    const vol = 0.6;
    const t = ctx.currentTime;

    const close = (delay: number) =>
      setTimeout(() => { try { void ctx.close(); } catch { /* ignore */ } }, delay);

    switch (name) {
      case "emergency_alarm": {
        const freqs = [880, 1100];
        let st = t;
        for (let i = 0; i < 6; i++) {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = "square"; o.frequency.value = freqs[i % 2];
          g.gain.setValueAtTime(vol * 0.4, st);
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.08);
          o.start(st); o.stop(st + 0.08); st += 0.1;
        }
        close(1200);
        break;
      }
      case "loud_bell": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "triangle"; o.frequency.setValueAtTime(294, t);
        o.frequency.exponentialRampToValueAtTime(220, t + 1.2);
        g.gain.setValueAtTime(vol * 0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        o.start(); o.stop(t + 1.5); close(1800);
        break;
      }
      case "siren": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sawtooth";
        o.frequency.setValueAtTime(300, t);
        o.frequency.linearRampToValueAtTime(1200, t + 0.5);
        o.frequency.linearRampToValueAtTime(300, t + 1.0);
        g.gain.setValueAtTime(vol * 0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
        o.start(); o.stop(t + 1.1); close(1400);
        break;
      }
      case "air_horn": {
        const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator();
        const g = ctx.createGain();
        o1.connect(g); o2.connect(g); g.connect(ctx.destination);
        o1.type = "sawtooth"; o1.frequency.value = 120;
        o2.type = "sawtooth"; o2.frequency.value = 160;
        g.gain.setValueAtTime(vol * 0.6, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        o1.start(); o1.stop(t + 0.7);
        o2.start(); o2.stop(t + 0.7); close(1000);
        break;
      }
      case "loud_chime": {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        let st = t;
        for (const f of notes) {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = "sine"; o.frequency.value = f;
          g.gain.setValueAtTime(vol * 0.5, st);
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
          o.start(st); o.stop(st + 0.5); st += 0.16;
        }
        close(1400);
        break;
      }
      case "default_notification": {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sine"; o.frequency.setValueAtTime(1047, t);
        o.frequency.exponentialRampToValueAtTime(880, t + 0.25);
        g.gain.setValueAtTime(vol * 0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.start(); o.stop(t + 0.3); close(600);
        break;
      }
      default: break;
    }
  } catch { /* AudioContext unavailable */ }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOUNDS: Array<{ id: AlertSettings["soundName"]; label: string }> = [
  { id: "emergency_alarm",      label: "Emergency Alarm" },
  { id: "loud_bell",            label: "Loud Bell" },
  { id: "siren",                label: "Siren" },
  { id: "air_horn",             label: "Air Horn" },
  { id: "loud_chime",           label: "Loud Chime" },
  { id: "default_notification", label: "Default Notification" },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface AlertSettingsPanelProps {
  onBack: () => void;
}

export function AlertSettingsPanel({ onBack }: AlertSettingsPanelProps) {
  const { settings, saving, updateSettings } = useAlertSettings();
  const [saved, setSaved] = useState(false);

  const update = async (patch: Partial<AlertSettings>) => {
    await updateSettings(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Section = ({ title, icon }: { title: string; icon: React.ReactNode }) => (
    <div className="flex items-center gap-2 pt-1 pb-0.5">
      <div className="text-primary">{icon}</div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
    </div>
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/20 px-3 py-2.5">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );

  return (
    <div className="space-y-4 py-1">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Alerts
      </button>

      {/* ── Voice Assistant ── */}
      <Section title="Voice Assistant" icon={<Mic className="h-3.5 w-3.5" />} />

      <Row label="Voice Assistant">
        <Switch
          checked={settings.voiceEnabled}
          onCheckedChange={(v) => void update({ voiceEnabled: v })}
        />
        {settings.voiceEnabled ? (
          <Mic className="h-3.5 w-3.5 text-primary" />
        ) : (
          <MicOff className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Row>

      {settings.voiceEnabled && (
        <>
          <Row label="Voice Gender">
            <div className="flex rounded-md overflow-hidden border border-border h-8">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => void update({ voiceGender: g })}
                  className={`px-3 text-xs font-medium transition-colors ${
                    settings.voiceGender === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </Row>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              Voice Volume
            </label>
            <div className="flex items-center gap-3 px-1">
              <VolumeX className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <input
                type="range" min="0" max="1" step="0.05"
                value={settings.voiceVolume}
                onChange={(e) => void update({ voiceVolume: parseFloat(e.target.value) })}
                className="flex-1 h-1.5 accent-primary cursor-pointer"
              />
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground w-8 text-right">
                {Math.round(settings.voiceVolume * 100)}%
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              Speech Speed
            </label>
            <div className="flex items-center gap-3 px-1">
              <span className="text-[10px] text-muted-foreground flex-shrink-0">Slow</span>
              <input
                type="range" min="0.5" max="2" step="0.1"
                value={settings.voiceSpeed}
                onChange={(e) => void update({ voiceSpeed: parseFloat(e.target.value) })}
                className="flex-1 h-1.5 accent-primary cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground flex-shrink-0">Fast</span>
              <span className="text-xs text-muted-foreground w-8 text-right">
                {settings.voiceSpeed.toFixed(1)}×
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              Spoken Name
            </label>
            <Input
              value={settings.spokenName}
              onChange={(e) => void update({ spokenName: e.target.value })}
              placeholder="e.g. Basheer"
              className="h-9"
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground px-1">
              Used in: "POI Trigger. {settings.spokenName || "Basheer"}, Check your chart."
            </p>
          </div>
        </>
      )}

      {/* ── Alert Sounds ── */}
      <Section title="Alert Sounds" icon={<Volume2 className="h-3.5 w-3.5" />} />

      <div className="space-y-2">
        {SOUNDS.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors cursor-pointer ${
              settings.soundName === s.id
                ? "border-primary/50 bg-primary/5"
                : "border-border bg-muted/10 hover:border-border/70"
            }`}
            onClick={() => void update({ soundName: s.id })}
          >
            {/* Radio indicator */}
            <div
              className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                settings.soundName === s.id ? "border-primary" : "border-border"
              }`}
            >
              {settings.soundName === s.id && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <span className="flex-1 text-sm">{s.label}</span>
            {settings.soundName === s.id && (
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                Default
              </Badge>
            )}
            <button
              type="button"
              onClick={(ev) => { ev.stopPropagation(); previewSound(s.id); }}
              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Preview"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Sound volume */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
          Sound Volume
        </label>
        <div className="flex items-center gap-3 px-1">
          <VolumeX className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <input
            type="range" min="0" max="1" step="0.05"
            value={settings.soundVolume}
            onChange={(e) => void update({ soundVolume: parseFloat(e.target.value) })}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          <Volume2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground w-8 text-right">
            {Math.round(settings.soundVolume * 100)}%
          </span>
        </div>
      </div>

      {/* Repeat */}
      <Row label="Repeat">
        <Select
          value={settings.soundRepeat}
          onValueChange={(v) => void update({ soundRepeat: v as AlertSettings["soundRepeat"] })}
        >
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="once">Once</SelectItem>
            <SelectItem value="twice">Twice</SelectItem>
            <SelectItem value="three_times">Three Times</SelectItem>
            <SelectItem value="continuous">Continuous Until Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      {/* ── Notifications ── */}
      <Section title="Notifications" icon={<Bell className="h-3.5 w-3.5" />} />

      <Row label="Browser Notifications">
        <Switch
          checked={settings.browserNotifications}
          onCheckedChange={(v) => void update({ browserNotifications: v })}
        />
        <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
      </Row>

      <Row label="Toast Notifications">
        <Switch
          checked={settings.toastNotifications}
          onCheckedChange={(v) => void update({ toastNotifications: v })}
        />
        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
      </Row>

      <Row label="Phone Vibration">
        <Switch
          checked={settings.vibrationEnabled}
          onCheckedChange={(v) => void update({ vibrationEnabled: v })}
        />
        <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
      </Row>

      {/* ── Alert Colors ── */}
      <Section title="Alert Colors" icon={<div className="h-3.5 w-3.5 rounded-full bg-primary" />} />

      {(
        [
          { key: "alertColor1" as const, label: "Blue Alert 1"  },
          { key: "alertColor2" as const, label: "Yellow Alert 2" },
          { key: "alertColor3" as const, label: "Red Alert 3"   },
        ] as const
      ).map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2.5">
          <span className="text-sm">{label}</span>
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-full border-2 border-border"
              style={{ backgroundColor: settings[key] }}
            />
            <input
              type="color"
              value={settings[key]}
              onChange={(e) => void update({ [key]: e.target.value })}
              className="h-7 w-14 rounded cursor-pointer bg-transparent border border-border p-0.5"
            />
          </div>
        </div>
      ))}

      {/* ── Urgent Alert Mode ── */}
      <Section title="Urgent Alert Mode" icon={<Zap className="h-3.5 w-3.5" />} />

      <Row label="Urgent Mode">
        <Switch
          checked={settings.urgentMode}
          onCheckedChange={(v) => void update({ urgentMode: v })}
        />
        {settings.urgentMode ? (
          <Zap className="h-3.5 w-3.5 text-yellow-400" />
        ) : (
          <ZapOff className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Row>

      {settings.urgentMode && (
        <p className="text-xs text-yellow-400/80 bg-yellow-400/10 rounded-lg px-3 py-2 border border-yellow-400/20">
          ⚡ Urgent mode: sound repeats continuously and voice repeats every 10 seconds until you dismiss the alert.
        </p>
      )}

      {/* Save indicator */}
      {(saving || saved) && (
        <div className={`flex items-center gap-1.5 text-xs px-1 transition-opacity ${saved ? "text-emerald-400" : "text-muted-foreground"}`}>
          {saved ? <Check className="h-3.5 w-3.5" /> : null}
          {saved ? "Settings saved" : "Saving…"}
        </div>
      )}
    </div>
  );
}
