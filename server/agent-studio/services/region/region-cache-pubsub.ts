/**
 * Region cache cross-process pub-sub — V2 Phase MR-1 Phase-2 twelfth
 * slice. PR-V1-160.
 *
 * Closes the "Multi-process cache invalidation" SOU §5 deferred item
 * via Postgres LISTEN/NOTIFY. Postgres is already a dependency
 * (Drizzle ASDB pool) — no Redis or other infra added.
 *
 * Pattern mirrors `approval-event-bus.ts` D-RESUME-5 upgrade path
 * (planned LISTEN/NOTIFY for cross-process approval-decided events;
 * not yet implemented). This is the first cross-process pub-sub
 * shipped in this codebase; the shape can be reused for future
 * needs.
 *
 * Channel: `ags_region_routing_invalidate`.
 * Payload: free-form reason string (max 8000 chars per PG NOTIFY limit;
 *          we use short labels like "pin change" or "region change").
 *
 * Sender (`notifyRegionCacheInvalidation`):
 *   - Issues `NOTIFY ags_region_routing_invalidate, '<reason>'` via the
 *     Drizzle pool. Fire-and-forget. Logs warning on failure but does
 *     NOT throw — the write that triggered the notify already
 *     committed and a notify failure doesn't roll it back.
 *
 * Subscriber (`subscribeRegionCacheInvalidations`):
 *   - Opens a dedicated `pg.Client` to the ASDB URL.
 *   - Issues `LISTEN ags_region_routing_invalidate`.
 *   - On each NOTIFY, calls the provided handler with the payload.
 *   - On connection error, logs + schedules a reconnect with linear
 *     backoff (10s, 20s, 30s, capped at 60s).
 *
 * Operator opt-in: only spawn the subscriber when running multi-
 * region (`AGS_REGION_PUBSUB=on`). Single-region operators don't
 * need cross-process invalidation; the existing in-process hooks
 * (#903 / #904) handle their case.
 *
 * Hard-rule compliance:
 *   - The single env read is the `AGS_REGION_PUBSUB` opt-in flag.
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` /
 *     `neo4j-driver` imports.
 */

import pg from "pg";
import { sql } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";

const CHANNEL = "ags_region_routing_invalidate";
const DEFAULT_AS_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/asdb")
  : "postgresql://localhost:5432/asdb";

interface SubscriberState {
  client: pg.Client | null;
  handler: ((reason: string) => void) | null;
  reconnectMs: number;
  stopped: boolean;
  timer: NodeJS.Timeout | null;
  /** PR-V1-167: observability counters. */
  connectedAt: Date | null;
  lastMessageAt: Date | null;
  lastMessageReason: string | null;
  messagesReceived: number;
  reconnectAttempts: number;
}

const _subscriber: SubscriberState = {
  client: null,
  handler: null,
  reconnectMs: 10_000,
  stopped: false,
  timer: null,
  connectedAt: null,
  lastMessageAt: null,
  lastMessageReason: null,
  messagesReceived: 0,
  reconnectAttempts: 0,
};

/**
 * Fire a cross-process invalidation notification. Fire-and-forget;
 * any failure is logged but not thrown so a pubsub hiccup never
 * rolls back the write that triggered it.
 *
 * Safe to call from any context (including non-multi-region
 * deployments — NOTIFY without LISTENers is a no-op at the PG level).
 */
export async function notifyRegionCacheInvalidation(
  reason: string,
): Promise<void> {
  const db = getAsDb();
  if (!db) return;
  try {
    // Quote-escape single quotes in the reason — defensive, since we
    // control the call sites but a future caller might pass operator
    // text. Limit to 200 chars (well under PG's 8000 cap).
    const safe = reason.replace(/'/g, "''").slice(0, 200);
    await db.execute(sql.raw(`NOTIFY ${CHANNEL}, '${safe}'`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ags-region-cache-pubsub] NOTIFY failed (reason=${reason}): ${msg}`,
    );
  }
}

/**
 * Spawn a long-lived subscriber that LISTENs on the channel and
 * calls `handler(reason)` for each notification. Idempotent —
 * calling twice replaces the prior handler and restarts the
 * connection.
 *
 * Returns an unsubscribe function. Calling unsubscribe disconnects
 * the client and stops the reconnect loop.
 *
 * Wired by the routing bridge (#903/#904 + this PR) so an operator-
 * triggered pin/region write on one process notifies every other
 * subscribed process's cache.
 */
export function subscribeRegionCacheInvalidations(
  handler: (reason: string) => void,
  options: { url?: string } = {},
): () => void {
  // Restart cleanly if already running.
  unsubscribeRegionCacheInvalidations();
  _subscriber.handler = handler;
  _subscriber.stopped = false;
  _subscriber.reconnectMs = 10_000;
  const url = options.url ?? process.env.DATABASE_URL_ASDB ?? DEFAULT_AS_URL;

  function connect(): void {
    if (_subscriber.stopped) return;
    const client = new pg.Client({ connectionString: url });
    _subscriber.client = client;
    client.on("notification", (msg) => {
      if (msg.channel !== CHANNEL) return;
      const reason = msg.payload ?? "";
      _subscriber.lastMessageAt = new Date();
      _subscriber.lastMessageReason = reason;
      _subscriber.messagesReceived += 1;
      try {
        _subscriber.handler?.(reason);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        console.warn(`[ags-region-cache-pubsub] handler threw: ${m}`);
      }
    });
    client.on("error", (err) => {
      const m = err instanceof Error ? err.message : String(err);
      console.warn(`[ags-region-cache-pubsub] client error: ${m}`);
      _subscriber.connectedAt = null;
      scheduleReconnect();
    });
    void (async () => {
      try {
        await client.connect();
        await client.query(`LISTEN ${CHANNEL}`);
        console.log(
          `[ags-region-cache-pubsub] LISTEN ${CHANNEL} established`,
        );
        // Reset backoff on success.
        _subscriber.reconnectMs = 10_000;
        _subscriber.connectedAt = new Date();
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        console.warn(`[ags-region-cache-pubsub] connect failed: ${m}`);
        scheduleReconnect();
      }
    })();
  }

  function scheduleReconnect(): void {
    if (_subscriber.stopped) return;
    if (_subscriber.timer) return;
    _subscriber.reconnectAttempts += 1;
    const delay = Math.min(_subscriber.reconnectMs, 60_000);
    _subscriber.reconnectMs = Math.min(_subscriber.reconnectMs + 10_000, 60_000);
    _subscriber.timer = setTimeout(() => {
      _subscriber.timer = null;
      try {
        _subscriber.client?.end().catch(() => {});
      } catch {
        /* ignore */
      }
      _subscriber.client = null;
      connect();
    }, delay);
  }

  connect();
  return unsubscribeRegionCacheInvalidations;
}

/**
 * Stop the subscriber + disconnect the client.
 */
export function unsubscribeRegionCacheInvalidations(): void {
  _subscriber.stopped = true;
  if (_subscriber.timer) {
    clearTimeout(_subscriber.timer);
    _subscriber.timer = null;
  }
  if (_subscriber.client) {
    try {
      void _subscriber.client.end().catch(() => {});
    } catch {
      /* ignore */
    }
    _subscriber.client = null;
  }
  _subscriber.handler = null;
  _subscriber.connectedAt = null;
  // Preserve lastMessageAt / lastMessageReason / messagesReceived /
  // reconnectAttempts so operators can still see the lifetime
  // counters after a stop. A fresh process restart resets them
  // (module reload).
}

/**
 * Boot-time opt-in. Reads `AGS_REGION_PUBSUB=on` and spawns the
 * subscriber if set. Returns whether the subscriber was started.
 */
export function maybeSubscribeRegionCachePubsub(
  handler: (reason: string) => void,
): boolean {
  if (process.env.AGS_REGION_PUBSUB !== "on") return false;
  subscribeRegionCacheInvalidations(handler);
  return true;
}

/**
 * PR-V1-167: operator observability surface — current subscriber
 * state, including whether the LISTEN connection is up, when the
 * last cross-process notification arrived, and how many reconnect
 * cycles have happened over the process's lifetime.
 *
 * Useful for the operator dashboard to verify multi-process
 * pubsub is actually wired up. A `connectedAt == null` after the
 * boot opt-in fired means LISTEN never succeeded; a stale
 * `lastMessageAt` on a process that should be receiving traffic
 * suggests a config issue.
 */
export interface RegionCachePubsubStatus {
  readonly subscribed: boolean;
  readonly connectedAt: Date | null;
  readonly lastMessageAt: Date | null;
  readonly lastMessageReason: string | null;
  readonly messagesReceived: number;
  readonly reconnectAttempts: number;
}

export function getRegionCachePubsubStatus(): RegionCachePubsubStatus {
  return {
    subscribed: _subscriber.handler !== null,
    connectedAt: _subscriber.connectedAt,
    lastMessageAt: _subscriber.lastMessageAt,
    lastMessageReason: _subscriber.lastMessageReason,
    messagesReceived: _subscriber.messagesReceived,
    reconnectAttempts: _subscriber.reconnectAttempts,
  };
}
