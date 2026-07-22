/**
 * useAlertStream — connects to the server-sent events stream and handles
 * real-time alert_fired events.
 *
 * On each alert_fired event:
 *   • Invalidates the notifications query (bell badge updates immediately)
 *   • Shows a toast
 *   • Plays the configured alert sound via Web Audio API
 *   • Fires a browser notification if permission was granted
 *
 * The EventSource auto-reconnects on network drops.
 * The hook cleans up on unmount.
 */
import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// ── Sound engine (Web Audio API) ─────────────────────────────────────────────

function playAlertSound(sound: "none" | "chime" | "beep" | "bell") {
  if (sound === "none") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (sound === "chime") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (sound === "beep") {
      osc.type = "square";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (sound === "bell") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1047, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    }

    // Close the context after the sound finishes to free resources
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // AudioContext unavailable or blocked — silent fail
  }
}

// ── SSE event shapes ─────────────────────────────────────────────────────────

interface AlertFiredEvent {
  alertId: number;
  symbol: string;
  condition: "above" | "below" | "equals";
  targetValue: number;
  price: number;
  message: string;
  sound: "none" | "chime" | "beep" | "bell";
  color: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAlertStream() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!isSignedIn) return;

    // Build the SSE URL. Works whether served from / or a sub-path.
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const url = `${base}/api/market/stream`;

    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener("alert_fired", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as AlertFiredEvent;

        // Refresh notification bell immediately
        queryClient.invalidateQueries({
          queryKey: getListNotificationsQueryKey(),
        });

        // Toast
        toast({
          title: `🔔 ${data.symbol} Alert`,
          description: data.message,
          duration: 6000,
        });

        // Sound
        playAlertSound(data.sound);

        // Browser notification (best-effort)
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          new Notification(`🔔 ${data.symbol} Alert`, {
            body: data.message,
            tag: `alert-${data.alertId}`,
          });
        }
      } catch {
        // malformed event, ignore
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects — no explicit handling needed
    };

    return () => {
      es.close();
    };
  }, [isSignedIn, queryClient, toast]);

  // Request browser notification permission on first load (non-blocking)
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
