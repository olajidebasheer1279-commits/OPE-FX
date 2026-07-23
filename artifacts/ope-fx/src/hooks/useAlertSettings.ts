/**
 * useAlertSettings — fetches and updates the current user's alert delivery
 * preferences (voice, sounds, notifications, colours, urgent mode).
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/react";

export interface AlertSettings {
  voiceEnabled: boolean;
  voiceGender: "male" | "female";
  voiceVolume: number;
  voiceSpeed: number;
  spokenName: string;
  soundName:
    | "emergency_alarm"
    | "loud_bell"
    | "siren"
    | "air_horn"
    | "loud_chime"
    | "default_notification";
  soundVolume: number;
  soundRepeat: "once" | "twice" | "three_times" | "continuous";
  browserNotifications: boolean;
  toastNotifications: boolean;
  vibrationEnabled: boolean;
  alertColor1: string;
  alertColor2: string;
  alertColor3: string;
  urgentMode: boolean;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  voiceEnabled: true,
  voiceGender: "female",
  voiceVolume: 0.8,
  voiceSpeed: 1.0,
  spokenName: "Basheer",
  soundName: "loud_bell",
  soundVolume: 0.8,
  soundRepeat: "once",
  browserNotifications: true,
  toastNotifications: true,
  vibrationEnabled: true,
  alertColor1: "#3b82f6",
  alertColor2: "#eab308",
  alertColor3: "#ef4444",
  urgentMode: false,
};

export function useAlertSettings() {
  const { isSignedIn } = useAuth();
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    if (!isSignedIn) { setLoading(false); return; }
    fetch(`${base}/api/alert-settings`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setSettings({ ...DEFAULT_ALERT_SETTINGS, ...data }); })
      .catch(() => {/* keep defaults */})
      .finally(() => setLoading(false));
  }, [isSignedIn, base]);

  const updateSettings = useCallback(
    async (patch: Partial<AlertSettings>) => {
      setSaving(true);
      // Optimistic update
      setSettings((prev) => ({ ...prev, ...patch }));
      try {
        const res = await fetch(`${base}/api/alert-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const data = await res.json();
          setSettings({ ...DEFAULT_ALERT_SETTINGS, ...data });
        }
      } catch {
        /* keep optimistic */
      } finally {
        setSaving(false);
      }
    },
    [base],
  );

  return { settings, loading, saving, updateSettings };
}
