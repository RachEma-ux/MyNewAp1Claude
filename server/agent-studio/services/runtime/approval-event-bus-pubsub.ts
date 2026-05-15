/**
 * Approval event bus cross-process pub-sub — D-RESUME-5 closure.
 * PR-V1-165.
 *
 * Closes the D-RESUME-5 LISTEN/NOTIFY upgrade path documented in
 * `approval-event-bus.ts`. Pattern mirrors `region-cache-pubsub.ts`
 * (PR-V1-160) — same Postgres LISTEN/NOTIFY infrastructure; no new
 * dependencies.
 *
 * Channel: `ags_approval_decided`.
 * Payload: JSON `{ approvalRequestId, status, expiresAt? }`.
 *
 * Before this slice (single-process baseline, D-RESUME-4):
 *   - `chat-stream` on process P1 waits on the local in-process bus.
 *   - Operator approves on process P2 (e.g. behind a load balancer).
 *   - P1 never sees P2's emit → waitFor times out → user re-prompts
 *     to pick up the now-allowed row.
 *
 * After this slice (cross-process closure, D-RESUME-5):
 *   - P2's `emit()` fires a Postgres NOTIFY in addition to the local
 *     emit.
 *   - P1's subscriber LISTENs on the channel, parses the payload,
 *     re-emits to P1's local bus.
 *   - `chat-stream` on P1 receives the event and resumes — no
 *     re-prompt round-trip.
 *
 * Opt-in: `AGS_APPROVAL_BUS_PUBSUB=on` (default OFF). Single-process
 * deployments stay on the existing baseline without paying for an
 * idle LISTEN connection.
 *
 * Hard-rule compliance:
 *   - The single env read is the opt-in flag (operator-set, not a
 *     secret).
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` /
 *     `neo4j-driver` imports.
 */

import pg from "pg";
import { sql } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";
import type { ApprovalDecidedEvent } from "./approval-event-bus.js";

const CHANNEL = "ags_approval_decided";
const DEFAULT_AS_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/asdb")
  : "postgresql://localhost:5432/asdb";

interface SubscriberState {
  client: pg.Client | null;
  handler: ((event: ApprovalDecidedEvent) => void) | null;
  reconnectMs: number;
  stopped: boolean;
  timer: NodeJS.Timeout | null;
  /** PR-V1-168: observability counters, symmetric with the region
   *  pubsub status (PR-V1-167). */
  connectedAt: Date | null;
  lastMessageAt: Date | null;
  lastApprovalRequestId: number | null;
  messagesReceived: number;
  malformedReceived: number;
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
  lastApprovalRequestId: null,
  messagesReceived: 0,
  malformedReceived: 0,
  reconnectAttempts: 0,
};

interface ApprovalDecidedPayload {
  readonly approvalRequestId: number;
  readonly status: ApprovalDecidedEvent["status"];
  readonly expiresAt: string | null;
}

function eventToPayload(event: ApprovalDecidedEvent): string {
  const payload: ApprovalDecidedPayload = {
    approvalRequestId: event.approvalRequestId,
    status: event.status,
    expiresAt: event.expiresAt ? event.expiresAt.toISOString() : null,
  };
  return JSON.stringify(payload);
}

function payloadToEvent(raw: string): ApprovalDecidedEvent | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ApprovalDecidedPayload>;
    if (
      typeof parsed.approvalRequestId !== "number" ||
      typeof parsed.status !== "string"
    ) {
      return null;
    }
    const expiresAt =
      typeof parsed.expiresAt === "string" ? new Date(parsed.expiresAt) : null;
    return {
      approvalRequestId: parsed.approvalRequestId,
      status: parsed.status as ApprovalDecidedEvent["status"],
      expiresAt:
        expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget NOTIFY for an approval-decided event. Safe to
 * call from any context; on PG-side, NOTIFY without LISTENers is a
 * no-op so single-process deployments incur a trivial query cost.
 * On error, logged but not thrown — the event is already on the
 * local bus.
 */
export async function notifyApprovalDecided(
  event: ApprovalDecidedEvent,
): Promise<void> {
  const db = getAsDb();
  if (!db) return;
  try {
    const payload = eventToPayload(event).replace(/'/g, "''");
    await db.execute(sql.raw(`NOTIFY ${CHANNEL}, '${payload}'`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ags-approval-bus-pubsub] NOTIFY failed (id=${event.approvalRequestId}): ${msg}`,
    );
  }
}

/**
 * Spawn a long-lived subscriber that LISTENs on the channel and
 * calls `handler(event)` for each notification. Idempotent —
 * calling twice replaces the prior handler and restarts the
 * connection.
 *
 * Returns an unsubscribe function.
 */
export function subscribeApprovalDecidedEvents(
  handler: (event: ApprovalDecidedEvent) => void,
  options: { url?: string } = {},
): () => void {
  unsubscribeApprovalDecidedEvents();
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
      const event = payloadToEvent(msg.payload ?? "");
      if (!event) {
        _subscriber.malformedReceived += 1;
        console.warn(
          `[ags-approval-bus-pubsub] malformed payload: ${(msg.payload ?? "").slice(0, 200)}`,
        );
        return;
      }
      _subscriber.lastMessageAt = new Date();
      _subscriber.lastApprovalRequestId = event.approvalRequestId;
      _subscriber.messagesReceived += 1;
      try {
        _subscriber.handler?.(event);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        console.warn(`[ags-approval-bus-pubsub] handler threw: ${m}`);
      }
    });
    client.on("error", (err) => {
      const m = err instanceof Error ? err.message : String(err);
      console.warn(`[ags-approval-bus-pubsub] client error: ${m}`);
      _subscriber.connectedAt = null;
      scheduleReconnect();
    });
    void (async () => {
      try {
        await client.connect();
        await client.query(`LISTEN ${CHANNEL}`);
        console.log(
          `[ags-approval-bus-pubsub] LISTEN ${CHANNEL} established`,
        );
        _subscriber.reconnectMs = 10_000;
        _subscriber.connectedAt = new Date();
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        console.warn(`[ags-approval-bus-pubsub] connect failed: ${m}`);
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
  return unsubscribeApprovalDecidedEvents;
}

export function unsubscribeApprovalDecidedEvents(): void {
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
  // Lifetime counters preserved across unsubscribe — operators can
  // still see what happened on this process up to the stop.
}

/**
 * PR-V1-168: operator observability surface — symmetric with
 * `getRegionCachePubsubStatus` (PR-V1-167). Surfaces the LISTEN
 * connection state + last approval-decided event + lifetime
 * counters so operators can confirm cross-process delivery is
 * actually happening.
 */
export interface ApprovalBusPubsubStatus {
  readonly subscribed: boolean;
  readonly connectedAt: Date | null;
  readonly lastMessageAt: Date | null;
  readonly lastApprovalRequestId: number | null;
  readonly messagesReceived: number;
  readonly malformedReceived: number;
  readonly reconnectAttempts: number;
}

export function getApprovalBusPubsubStatus(): ApprovalBusPubsubStatus {
  return {
    subscribed: _subscriber.handler !== null,
    connectedAt: _subscriber.connectedAt,
    lastMessageAt: _subscriber.lastMessageAt,
    lastApprovalRequestId: _subscriber.lastApprovalRequestId,
    messagesReceived: _subscriber.messagesReceived,
    malformedReceived: _subscriber.malformedReceived,
    reconnectAttempts: _subscriber.reconnectAttempts,
  };
}

/**
 * Boot-time opt-in. Reads `AGS_APPROVAL_BUS_PUBSUB=on` and spawns
 * the subscriber if set. Returns whether the subscriber was
 * started so boot can include it in the log line.
 */
export function maybeSubscribeApprovalBusPubsub(
  handler: (event: ApprovalDecidedEvent) => void,
): boolean {
  if (process.env.AGS_APPROVAL_BUS_PUBSUB !== "on") return false;
  subscribeApprovalDecidedEvents(handler);
  return true;
}

/**
 * Test seam — payload round-trip exposed so unit tests can verify
 * the format without touching the network layer.
 */
export const __test = {
  eventToPayload,
  payloadToEvent,
};
