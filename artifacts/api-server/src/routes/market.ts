/**
 * Market routes
 *
 * GET /market/stream     — SSE stream for alert_fired events + heartbeat
 * GET /market/status     — JSON provider health & subscribed symbols
 * GET /market/price/:sym — Last known price for a symbol
 */
import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { sseBroadcaster } from "../lib/market-data/sse-broadcaster.js";
import { marketEngine } from "../lib/market-data/engine.js";

const router: IRouter = Router();

// ─── SSE stream ──────────────────────────────────────────────────────────────

router.get("/market/stream", requireAuth, (req, res): void => {
  const userId = req.userId!;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disable buffering in nginx / Replit proxy
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Register this response object as an SSE client
  sseBroadcaster.addClient(userId, res);

  // Initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  // Heartbeat every 25 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    sseBroadcaster.removeClient(userId, res);
  });
});

// ─── Provider status ─────────────────────────────────────────────────────────

router.get("/market/status", requireAuth, (_req, res): void => {
  res.json({
    providers: marketEngine.getStatuses(),
    subscribedSymbols: marketEngine.getSubscribedSymbols(),
    sseConnections: sseBroadcaster.totalConnections,
  });
});

// ─── Last known price ────────────────────────────────────────────────────────

router.get("/market/price/:symbol", requireAuth, (req, res): void => {
  const symbol = (req.params["symbol"] as string ?? "").toUpperCase();
  const price = marketEngine.getLastPrice(symbol);
  if (!price) {
    res.status(404).json({ error: "No price data for symbol" });
    return;
  }
  res.json(price);
});

export default router;
