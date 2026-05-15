/**
 * Generic Postgres LISTEN/NOTIFY pub-sub primitive — PR-V1-166.
 *
 * Extracted from the two existing cross-process buses shipped in
 * this session:
 *   - `services/region/region-cache-pubsub.ts` (PR-V1-160) —
 *     region cache invalidation NOTIFY on
 *     `ags_region_routing_invalidate`, payload = label string.
 *   - `services/runtime/approval-event-bus-pubsub.ts` (PR-V1-165) —
 *     approval-decided NOTIFY on `ags_approval_decided`, payload =
 *     JSON `{approvalRequestId, status, expiresAt}`.
 *
 * Both implementations duplicated the same connect/reconnect/
 * dispatch machinery with only the channel name + payload codec
 * + handler signature differing. This primitive factors out the
 * shared shape so future cross-process needs become trivial
 * one-call wireups.
 *
 * **Not a refactor of the existing two** — they keep working as
 * standalone modules. Migrating them onto this primitive is its
 * own incremental slice once the primitive's API has soaked.
 *
 * Design:
 *   - `createPgListenNotifyBus<TEvent>({channel, encode, decode,
 *     url?, logPrefix})` returns a fresh bus instance. Each instance
 *     manages a single subscriber + a single channel.
 *   - `bus.notify(event)` — async fire-and-forget NOTIFY via the
 *     Drizzle ASDB pool.
 *   - `bus.subscribe(handler)` — spawn the dedicated pg.Client +
 *     LISTEN. Returns unsubscribe function.
 *   - `bus.maybeSubscribe(envFlag, value, handler)` — env-flag-gated
 *     opt-in.
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` /
 *     `neo4j-driver` imports.
 *   - Caller-controlled env flag name (no hardcoded `AGS_*`).
 */

import pg from "pg";
import { sql } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";

const DEFAULT_AS_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/asdb")
  : "postgresql://localhost:5432/asdb";

export interface PgListenNotifyBusConfig<TEvent> {
  readonly channel: string;
  /** Serialize an event to a NOTIFY payload string. Caller owns the
   *  format (raw label, JSON, etc.). */
  readonly encode: (event: TEvent) => string;
  /** Parse a NOTIFY payload back to an event. Return null when the
   *  payload doesn't match the expected shape — the bus logs +
   *  drops malformed messages. */
  readonly decode: (payload: string) => TEvent | null;
  /** Optional override for the ASDB connection URL. Default matches
   *  the existing `db/connection.ts` resolution. */
  readonly url?: string;
  /** Log prefix used in console warnings + the connection-established
   *  info log. Default: `ags-pg-listen-notify-bus`. */
  readonly logPrefix?: string;
}

export interface PgListenNotifyBus<TEvent> {
  /** Fire-and-forget NOTIFY. Returns when the SQL has been issued
   *  (or logged + swallowed on failure). Never throws. */
  readonly notify: (event: TEvent) => Promise<void>;
  /** Subscribe to NOTIFY events. Returns the unsubscribe function.
   *  Idempotent — calling subscribe twice replaces the handler. */
  readonly subscribe: (handler: (event: TEvent) => void) => () => void;
  /** Convenience: env-flag-gated subscribe. Returns whether the
   *  subscriber was started. */
  readonly maybeSubscribe: (
    envFlag: string,
    expectedValue: string,
    handler: (event: TEvent) => void,
  ) => boolean;
  /** Disconnect + stop reconnect loop. Idempotent. */
  readonly unsubscribe: () => void;
}

interface SubscriberState<TEvent> {
  client: pg.Client | null;
  handler: ((event: TEvent) => void) | null;
  reconnectMs: number;
  stopped: boolean;
  timer: NodeJS.Timeout | null;
}

export function createPgListenNotifyBus<TEvent>(
  config: PgListenNotifyBusConfig<TEvent>,
): PgListenNotifyBus<TEvent> {
  const { channel, encode, decode } = config;
  const logPrefix = config.logPrefix ?? "ags-pg-listen-notify-bus";

  const state: SubscriberState<TEvent> = {
    client: null,
    handler: null,
    reconnectMs: 10_000,
    stopped: false,
    timer: null,
  };

  async function notify(event: TEvent): Promise<void> {
    const db = getAsDb();
    if (!db) return;
    try {
      // Quote-escape single quotes + 200-char cap (well under PG's
      // 8000 NOTIFY payload limit). Same defense as the existing
      // region + approval pubsub implementations.
      const raw = encode(event);
      const safe = raw.replace(/'/g, "''").slice(0, 200);
      await db.execute(sql.raw(`NOTIFY ${channel}, '${safe}'`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[${logPrefix}] NOTIFY failed: ${msg}`);
    }
  }

  function subscribe(handler: (event: TEvent) => void): () => void {
    unsubscribe();
    state.handler = handler;
    state.stopped = false;
    state.reconnectMs = 10_000;
    const url = config.url ?? process.env.DATABASE_URL_ASDB ?? DEFAULT_AS_URL;

    function connect(): void {
      if (state.stopped) return;
      const client = new pg.Client({ connectionString: url });
      state.client = client;
      client.on("notification", (msg) => {
        if (msg.channel !== channel) return;
        const event = decode(msg.payload ?? "");
        if (event === null) {
          console.warn(
            `[${logPrefix}] malformed payload: ${(msg.payload ?? "").slice(0, 200)}`,
          );
          return;
        }
        try {
          state.handler?.(event);
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          console.warn(`[${logPrefix}] handler threw: ${m}`);
        }
      });
      client.on("error", (err) => {
        const m = err instanceof Error ? err.message : String(err);
        console.warn(`[${logPrefix}] client error: ${m}`);
        scheduleReconnect();
      });
      void (async () => {
        try {
          await client.connect();
          await client.query(`LISTEN ${channel}`);
          console.log(`[${logPrefix}] LISTEN ${channel} established`);
          state.reconnectMs = 10_000;
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          console.warn(`[${logPrefix}] connect failed: ${m}`);
          scheduleReconnect();
        }
      })();
    }

    function scheduleReconnect(): void {
      if (state.stopped) return;
      if (state.timer) return;
      const delay = Math.min(state.reconnectMs, 60_000);
      state.reconnectMs = Math.min(state.reconnectMs + 10_000, 60_000);
      state.timer = setTimeout(() => {
        state.timer = null;
        try {
          state.client?.end().catch(() => {});
        } catch {
          /* ignore */
        }
        state.client = null;
        connect();
      }, delay);
    }

    connect();
    return unsubscribe;
  }

  function unsubscribe(): void {
    state.stopped = true;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.client) {
      try {
        void state.client.end().catch(() => {});
      } catch {
        /* ignore */
      }
      state.client = null;
    }
    state.handler = null;
  }

  function maybeSubscribe(
    envFlag: string,
    expectedValue: string,
    handler: (event: TEvent) => void,
  ): boolean {
    if (process.env[envFlag] !== expectedValue) return false;
    subscribe(handler);
    return true;
  }

  return { notify, subscribe, unsubscribe, maybeSubscribe };
}

/**
 * Identity codec — useful for buses where the payload is just a
 * label string (e.g. region cache invalidation: payload = "pin change").
 */
export const STRING_CODEC = {
  encode: (s: string) => s,
  decode: (s: string) => s,
};

/**
 * JSON codec factory — for structured events. Returns
 * `{ encode, decode }` for a discriminated event shape. `decode`
 * runs the supplied `validate` function and returns null on
 * mismatch.
 */
export function jsonCodec<TEvent>(
  validate: (parsed: unknown) => TEvent | null,
): {
  encode: (event: TEvent) => string;
  decode: (payload: string) => TEvent | null;
} {
  return {
    encode: (event: TEvent) => JSON.stringify(event),
    decode: (payload: string) => {
      try {
        return validate(JSON.parse(payload));
      } catch {
        return null;
      }
    },
  };
}
