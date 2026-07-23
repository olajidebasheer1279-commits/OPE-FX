/**
 * useAlertStream — connects to the SSE stream and handles real-time
 * alert_fired events with full Prompt-4 delivery:
 *
 *  • Toast notification (title = Trigger Name)
 *  • Browser Notification (title = Trigger Name)
 *  • Rich alert sound (6 types + volume + repeat mode)
 *  • Voice assistant ("POI Trigger. Basheer, Check your chart.")
 *  • Phone vibration (if supported)
 *  • Notification bell badge invalidation
 *  • Urgent Alert Mode — repeats voice every 10 s until dismissed
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAlertSettings } from "./useAlertSettings";

// ── SSE event shape ───────────────────────────────────────────────────────────

interface AlertFiredEvent {
  alertId: number;
  symbol: string;
  condition: "above" | "below" | "equals";
  targetValue: number;
  price: number;
  message: string;
  sound: string;
  color: string;
  triggerName: string | null;  // display name e.g. "POI Trigger"
  triggerKey: string | null;   // raw key  e.g. "poi"
}

// ── Sound engine ─────────────────────────────────────────────────────────────

function createCtx() {
  try { return new AudioContext(); } catch { return null; }
}

function scheduleClose(ctx: AudioContext, delay: number) {
  setTimeout(() => { try { void ctx.close(); } catch { /* ignore */ } }, delay);
}

function playEmergencyAlarm(ctx: AudioContext, vol: number) {
  const dur = 0.08;
  const freqs = [880, 1100];
  let t = ctx.currentTime;
  for (let i = 0; i < 8; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.value = freqs[i % 2];
    g.gain.setValueAtTime(vol * 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur);
    t += dur + 0.02;
  }
  scheduleClose(ctx, (t - ctx.currentTime + 0.2) * 1000);
}

function playLoudBell(ctx: AudioContext, vol: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "triangle";
  osc.frequency.setValueAtTime(294, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 1.5);
  g.gain.setValueAtTime(vol * 0.9, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
  osc.start(); osc.stop(ctx.currentTime + 1.8);
  scheduleClose(ctx, 2200);
}

function playSiren(ctx: AudioContext, vol: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.5);
  osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 1.0);
  osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 1.5);
  g.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.6);
  osc.start(); osc.stop(ctx.currentTime + 1.6);
  scheduleClose(ctx, 2000);
}

function playAirHorn(ctx: AudioContext, vol: number) {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g = ctx.createGain();
  osc1.connect(g); osc2.connect(g); g.connect(ctx.destination);
  osc1.type = "sawtooth"; osc1.frequency.value = 120;
  osc2.type = "sawtooth"; osc2.frequency.value = 160;
  g.gain.setValueAtTime(vol * 0.6, ctx.currentTime);
  g.gain.setValueAtTime(vol * 0.6, ctx.currentTime + 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc1.start(); osc1.stop(ctx.currentTime + 0.8);
  osc2.start(); osc2.stop(ctx.currentTime + 0.8);
  scheduleClose(ctx, 1200);
}

function playLoudChime(ctx: AudioContext, vol: number) {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  let t = ctx.currentTime;
  for (const freq of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.start(t); osc.stop(t + 0.6);
    t += 0.18;
  }
  scheduleClose(ctx, 1600);
}

function playDefaultNotification(ctx: AudioContext, vol: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(1047, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25);
  g.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.start(); osc.stop(ctx.currentTime + 0.3);
  scheduleClose(ctx, 600);
}

// Legacy sounds (backward compat)
function playLegacyChime(ctx: AudioContext, vol: number) {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
  g.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(); osc.stop(ctx.currentTime + 0.4);
  scheduleClose(ctx, 800);
}
function playLegacyBeep(ctx: AudioContext, vol: number) {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "square"; osc.frequency.value = 660;
  g.gain.setValueAtTime(vol * 0.2, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.start(); osc.stop(ctx.currentTime + 0.15);
  scheduleClose(ctx, 400);
}
function playLegacyBell(ctx: AudioContext, vol: number) {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "triangle"; osc.frequency.setValueAtTime(1047, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.6);
  g.gain.setValueAtTime(vol * 0.35, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc.start(); osc.stop(ctx.currentTime + 0.6);
  scheduleClose(ctx, 1000);
}

/** Play a single sound impulse at a given volume. */
function playOnce(soundName: string, vol: number) {
  const ctx = createCtx();
  if (!ctx) return;
  switch (soundName) {
    case "emergency_alarm":        playEmergencyAlarm(ctx, vol); break;
    case "loud_bell":              playLoudBell(ctx, vol); break;
    case "siren":                  playSiren(ctx, vol); break;
    case "air_horn":               playAirHorn(ctx, vol); break;
    case "loud_chime":             playLoudChime(ctx, vol); break;
    case "default_notification":   playDefaultNotification(ctx, vol); break;
    case "chime":                  playLegacyChime(ctx, vol); break;
    case "beep":                   playLegacyBeep(ctx, vol); break;
    case "bell":                   playLegacyBell(ctx, vol); break;
    default: break;
  }
}

/**
 * Approximate duration (ms) for one play of each sound.
 * Used to space repeated plays.
 */
const SOUND_DURATION: Record<string, number> = {
  emergency_alarm: 900, loud_bell: 1800, siren: 1600, air_horn: 800,
  loud_chime: 1600, default_notification: 300, chime: 400, beep: 150, bell: 600,
};

function playSoundWithRepeat(
  soundName: string,
  vol: number,
  repeat: "once" | "twice" | "three_times" | "continuous",
): ReturnType<typeof setInterval> | null {
  if (soundName === "none") return null;
  const count = repeat === "once" ? 1 : repeat === "twice" ? 2 : 3;
  const dur = SOUND_DURATION[soundName] ?? 800;

  if (repeat === "continuous") {
    playOnce(soundName, vol);
    const id = setInterval(() => playOnce(soundName, vol), dur + 400);
    return id;
  }

  // Play `count` times with a gap
  let i = 0;
  playOnce(soundName, vol);
  i++;
  if (i >= count) return null;
  const id = setInterval(() => {
    playOnce(soundName, vol);
    i++;
    if (i >= count) clearInterval(id);
  }, dur + 300);
  return null; // non-continuous intervals self-terminate
}

// ── Voice assistant ───────────────────────────────────────────────────────────

let voicesLoaded = false;
function ensureVoicesLoaded() {
  if (voicesLoaded) return;
  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.getVoices(); // trigger async load in Chrome
    voicesLoaded = true;
  }
}

function speakAlert(
  triggerDisplayName: string,
  spokenName: string,
  volume: number,
  speed: number,
  gender: "male" | "female",
) {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel(); // clear any queued speech
  const text = `${triggerDisplayName}. ${spokenName}, Check your chart.`;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.volume = Math.max(0, Math.min(1, volume));
  utterance.rate = Math.max(0.5, Math.min(2, speed));
  const voices = speechSynthesis.getVoices();
  if (voices.length > 0) {
    const preferred = voices.find((v) =>
      gender === "male"
        ? /male|man|guy/i.test(v.name)
        : /female|woman|girl/i.test(v.name),
    );
    utterance.voice = preferred ?? voices[0];
  }
  speechSynthesis.speak(utterance);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAlertStream() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { settings } = useAlertSettings();

  /** Map of alertId → urgent repeat intervalId (cleared on dismiss). */
  const urgentIntervals = useRef<Map<number, ReturnType<typeof setInterval>>>(
    new Map(),
  );

  const dismissUrgent = (alertId: number) => {
    const id = urgentIntervals.current.get(alertId);
    if (id !== undefined) {
      clearInterval(id);
      urgentIntervals.current.delete(alertId);
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  };

  useEffect(() => {
    ensureVoicesLoaded();
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;

    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const url = `${base}/api/market/stream`;
    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener("alert_fired", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as AlertFiredEvent;

        // Determine which sound to play
        const effectiveSound =
          data.sound && data.sound !== "none" ? data.sound : settings.soundName;

        // Determine trigger display name (fallback to symbol)
        const triggerDisplay = data.triggerName ?? `🔔 ${data.symbol} Alert`;

        // 1. Invalidate notification bell
        queryClient.invalidateQueries({
          queryKey: getListNotificationsQueryKey(),
        });

        // 2. Toast
        if (settings.toastNotifications) {
          const isUrgent = settings.urgentMode;
          toast({
            title: triggerDisplay,
            description: data.message,
            duration: isUrgent ? 0 : 8000, // persistent if urgent
            style: { borderLeft: `4px solid ${data.color}` },
          });
        }

        // 3. Sound (with repeat)
        const soundInterval = playSoundWithRepeat(
          effectiveSound,
          settings.soundVolume,
          settings.urgentMode ? "continuous" : settings.soundRepeat,
        );
        if (soundInterval !== null) {
          // Store so urgent mode can clear it
          urgentIntervals.current.set(data.alertId, soundInterval);
        }

        // 4. Voice assistant
        if (settings.voiceEnabled) {
          speakAlert(
            data.triggerName ?? data.symbol,
            settings.spokenName,
            settings.voiceVolume,
            settings.voiceSpeed,
            settings.voiceGender,
          );
        }

        // 5. Browser notification
        if (
          settings.browserNotifications &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          new Notification(triggerDisplay, {
            body: data.message,
            tag: `alert-${data.alertId}`,
          });
        }

        // 6. Vibration
        if (settings.vibrationEnabled && typeof navigator.vibrate === "function") {
          navigator.vibrate([200, 100, 200]);
        }

        // 7. Urgent mode — repeat voice every 10 s until dismissed
        if (settings.urgentMode && settings.voiceEnabled) {
          const urgentId = setInterval(() => {
            speakAlert(
              data.triggerName ?? data.symbol,
              settings.spokenName,
              settings.voiceVolume,
              settings.voiceSpeed,
              settings.voiceGender,
            );
          }, 10_000);
          urgentIntervals.current.set(data.alertId, urgentId);
        }
      } catch {
        // malformed event — ignore
      }
    });

    es.onerror = () => { /* EventSource auto-reconnects */ };

    return () => {
      es.close();
      // Clear any lingering urgent intervals
      urgentIntervals.current.forEach((id) => clearInterval(id));
      urgentIntervals.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, queryClient, toast, settings]);

  // Request browser notification permission on first load
  useEffect(() => {
    if (
      isSignedIn &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission();
    }
  }, [isSignedIn]);
}
