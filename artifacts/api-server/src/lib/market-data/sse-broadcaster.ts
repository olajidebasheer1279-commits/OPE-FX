import type { Response } from "express";

/**
 * Manages Server-Sent Event client connections, keyed by userId.
 * Thread-safe for single-process Node.js (no real concurrency risk).
 */
class SseBroadcaster {
  private clients = new Map<string, Set<Response>>();

  addClient(userId: string, res: Response): void {
    let set = this.clients.get(userId);
    if (!set) {
      set = new Set();
      this.clients.set(userId, set);
    }
    set.add(res);
  }

  removeClient(userId: string, res: Response): void {
    const set = this.clients.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.clients.delete(userId);
  }

  /** Send an SSE event to a specific user (all their open connections). */
  sendToUser(userId: string, event: string, data: unknown): void {
    const set = this.clients.get(userId);
    if (!set || set.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try {
        res.write(payload);
      } catch {
        // Connection already closed; will be cleaned up on req 'close'
      }
    }
  }

  /** Broadcast an SSE event to every connected user. */
  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const set of this.clients.values()) {
      for (const res of set) {
        try {
          res.write(payload);
        } catch {
          // ignore
        }
      }
    }
  }

  get totalConnections(): number {
    let n = 0;
    for (const set of this.clients.values()) n += set.size;
    return n;
  }
}

export const sseBroadcaster = new SseBroadcaster();
