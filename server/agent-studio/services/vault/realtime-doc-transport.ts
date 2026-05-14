/**
 * Realtime-doc WebSocket transport scaffold — V2 Phase CRDT-γ-2.
 *
 * CRDT-β (#764) shipped the `RealtimeDocBackend` contract +
 * `RealtimeDocSession` wrapper. CRDT-γ (#765) shipped the Yjs
 * adapter. Neither was wired to a WebSocket so concurrent clients
 * couldn't actually exchange updates.
 *
 * This γ-2 slice ships the server-side transport scaffold:
 *
 *   - `RealtimeDocConnection` interface — minimum WebSocket-like
 *     surface (`send(buf)`, `on("message"/"close", ...)`). The full
 *     `ws.WebSocket` shape is wider than we need; this narrow
 *     interface keeps the transport testable with a plain
 *     `EventTarget`-backed mock.
 *
 *   - `attachConnectionToSession(conn, sessionKey)` — per-connection
 *     handler:
 *       1. `session.attachClient()` (counter bump)
 *       2. Send initial snapshot to the new client
 *       3. On inbound message: `session.handleUpdate(buf)` +
 *          broadcast the update to other connected clients in the
 *          same session
 *       4. On `close`: `session.detachClient()`; if the session has
 *          no clients left, drop it from the registry.
 *
 *   - `RealtimeDocTransport` — bookkeeping wrapper that tracks
 *     per-session connection sets so broadcast can fan out. The
 *     module-singleton `getRealtimeDocTransport()` returns a
 *     process-local instance.
 *
 * Hard-rule compliance (CLAUDE.md Non-Build List):
 *   - The transport calls into `RealtimeDocSession.handleUpdate` +
 *     `session.snapshot`; it never touches the backend directly.
 *   - Postgres = source of truth. The transport is presence + sync
 *     + cursor only — canonical writes still flow through the Vault
 *     repository at save boundaries.
 *   - No `credential-resolver` import. No raw `process.env.*_API_KEY`.
 *     No `dispatchMcpToolCall` import. No `neo4j-driver` import.
 *
 * Out of scope for this slice (lands in CRDT-γ-3):
 *   - y-protocols sync-step-1 / sync-step-2 / awareness message
 *     framing (the broadcast here ships raw update bytes).
 *   - Authentication / authorization handshake (the transport
 *     assumes the upgrade path already verified the user).
 *   - Reconnect / replay semantics.
 */

import {
  dropRealtimeDocSession,
  getOrCreateRealtimeDocSession,
  type RealtimeDocBackendFactory,
  type RealtimeDocSession,
  type RealtimeDocSessionKey,
} from "./realtime-doc.js";
import {
  RealtimeDocFrameEmptyError,
  RealtimeDocFrameTooLargeError,
  dispatchRealtimeDocFrame,
  type RealtimeDocFrameHandlers,
} from "./realtime-doc-framing.js";

/** Stable close codes for frame-error driven disconnects (V1+
 *  CRDT-γ-3-framing transport wire-up). 4xxx is the WebSocket
 *  private-use range — will not collide with future IETF assignments. */
export const REALTIME_DOC_FRAME_CLOSE_CODES = {
  empty_frame: 4400,
  frame_too_large: 4413, // mirrors HTTP 413 Payload Too Large
  handler_error: 4500,
} as const;

// ============================================================================
// Narrow connection interface
// ============================================================================

export type RealtimeDocCloseHandler = (
  code?: number,
  reason?: string,
) => void;
export type RealtimeDocMessageHandler = (data: Uint8Array) => void;

/**
 * The transport's minimum WebSocket-like surface. Matches the
 * subset of `ws.WebSocket` we use; tests can implement this with a
 * plain object + `EventTarget`.
 */
export interface RealtimeDocConnection {
  send(data: Uint8Array): void;
  on(event: "message", handler: RealtimeDocMessageHandler): void;
  on(event: "close", handler: RealtimeDocCloseHandler): void;
  close(code?: number, reason?: string): void;
}

// ============================================================================
// Transport
// ============================================================================

export interface AttachConnectionOptions {
  /** Session-key tuple — must match the `(vaultId, noteId)` shape
   *  used by the registry. Production wires this from the upgrade
   *  request's query string / auth payload. */
  readonly sessionKey: RealtimeDocSessionKey;
  /** Test seam — replace the registry's getOrCreate lookup. */
  readonly resolveSession?: (
    key: RealtimeDocSessionKey,
    factory?: RealtimeDocBackendFactory,
  ) => RealtimeDocSession;
  /** Test seam — replace the registry's drop call. */
  readonly dropSession?: (key: RealtimeDocSessionKey) => boolean;
  /** Test seam — override the backend factory for new sessions. */
  readonly backendFactory?: RealtimeDocBackendFactory;
  /** Per-message broadcast hook (test seam). Returns false to
   *  suppress broadcast (e.g. invalid message). Default: always
   *  broadcast. */
  readonly shouldBroadcast?: (data: Uint8Array) => boolean;
  /** V1+ CRDT-γ-3-framing transport wire-up: when supplied, every
   *  inbound message is routed through `dispatchRealtimeDocFrame`
   *  with these handlers. Sync / awareness / unknown frames go to
   *  the corresponding handler; the framing layer strips the leading
   *  type byte before invoking the per-type handler. When omitted,
   *  the existing CRDT-γ-2 behavior is preserved (raw `data` →
   *  `session.handleUpdate`) — no breaking change. */
  readonly frameHandlers?: RealtimeDocFrameHandlers;
  /** V1+ CRDT-γ-3-framing transport wire-up: override the default
   *  2 MiB frame-size cap. When `frameHandlers` is unset this option
   *  is ignored. */
  readonly maxFrameBytes?: number;
  /** V1+ CRDT-γ-3-framing transport wire-up: when set, frame-parse
   *  errors (empty / oversize / handler throw) close the connection
   *  with a stable WebSocket close code. Defaults to `true`. */
  readonly closeOnFrameError?: boolean;
}

/**
 * Per-session connection set + broadcast helpers. Constructed once
 * per process; module-singleton accessor below.
 */
export class RealtimeDocTransport {
  private readonly connectionsBySession = new Map<
    string,
    Set<RealtimeDocConnection>
  >();

  private keyString(k: RealtimeDocSessionKey): string {
    return `${k.vaultId}:${k.noteId}`;
  }

  /**
   * Bind a new client connection to a realtime-doc session.
   *
   * Lifecycle:
   *   1. Resolve / create the session (attachClient bumps the
   *      counter).
   *   2. Send the current snapshot to the new client immediately
   *      so it can catch up.
   *   3. Register on("message") → applyUpdate + broadcast to other
   *      clients in the same session.
   *   4. Register on("close") → detachClient; drop the session if
   *      the connection set is now empty.
   *
   * Returns a `disposer()` that simulates a "close" externally
   * (useful for tests + operator shutdowns).
   */
  attachConnection(
    conn: RealtimeDocConnection,
    options: AttachConnectionOptions,
  ): () => void {
    const resolveSession =
      options.resolveSession ?? getOrCreateRealtimeDocSession;
    const dropSession = options.dropSession ?? dropRealtimeDocSession;
    const session = resolveSession(options.sessionKey, options.backendFactory);
    session.attachClient();

    const keyStr = this.keyString(options.sessionKey);
    let connSet = this.connectionsBySession.get(keyStr);
    if (!connSet) {
      connSet = new Set();
      this.connectionsBySession.set(keyStr, connSet);
    }
    connSet.add(conn);

    // Send the current snapshot to the new client.
    try {
      conn.send(session.snapshot());
    } catch {
      // Tolerate a transport that's already closed at attach time.
    }

    const closeOnFrameError = options.closeOnFrameError ?? true;
    const onMessage: RealtimeDocMessageHandler = (data) => {
      if (options.shouldBroadcast && !options.shouldBroadcast(data)) return;
      if (options.frameHandlers) {
        // V1+ CRDT-γ-3-framing transport wire-up: route through the
        // dispatcher. Parse errors / handler throws close the
        // connection with a stable code (unless `closeOnFrameError`
        // is explicitly false). Successful dispatch still broadcasts
        // the raw frame to peers — peers re-parse on their own end.
        Promise.resolve(
          dispatchRealtimeDocFrame({
            data,
            handlers: options.frameHandlers,
            ctx: { session },
            maxBytes: options.maxFrameBytes,
          }),
        )
          .then(() => {
            this.broadcastToPeers(options.sessionKey, conn, data);
          })
          .catch((err) => {
            if (!closeOnFrameError) return;
            const code =
              err instanceof RealtimeDocFrameEmptyError
                ? REALTIME_DOC_FRAME_CLOSE_CODES.empty_frame
                : err instanceof RealtimeDocFrameTooLargeError
                  ? REALTIME_DOC_FRAME_CLOSE_CODES.frame_too_large
                  : REALTIME_DOC_FRAME_CLOSE_CODES.handler_error;
            const reason =
              err instanceof Error ? err.name : "frame_dispatch_error";
            try {
              conn.close(code, reason);
            } catch {
              // Tolerate already-closed connections.
            }
          });
        return;
      }
      // CRDT-γ-2 default behavior — preserved when `frameHandlers`
      // is not supplied. Raw `data` (including any leading type
      // byte) is forwarded to the session backend; peers receive
      // the same raw frame.
      session.handleUpdate(data);
      this.broadcastToPeers(options.sessionKey, conn, data);
    };

    // Capture the resolved session by closure so detach inspects
    // the same session attach saw (the resolveSession test seam
    // may return a different session than the global registry).
    const onClose: RealtimeDocCloseHandler = () => {
      this.detachConnectionWithSession(
        conn,
        options.sessionKey,
        session,
        dropSession,
      );
    };

    conn.on("message", onMessage);
    conn.on("close", onClose);

    return () => {
      this.detachConnectionWithSession(
        conn,
        options.sessionKey,
        session,
        dropSession,
      );
    };
  }

  /**
   * Internal — detach when the caller already holds the session
   * reference (avoids re-resolving through the registry, which
   * tests inject via `resolveSession`).
   */
  private detachConnectionWithSession(
    conn: RealtimeDocConnection,
    sessionKey: RealtimeDocSessionKey,
    session: RealtimeDocSession,
    dropSession: (key: RealtimeDocSessionKey) => boolean,
  ): void {
    const keyStr = this.keyString(sessionKey);
    const connSet = this.connectionsBySession.get(keyStr);
    if (!connSet) return;
    if (!connSet.delete(conn)) return;
    session.detachClient();
    if (connSet.size === 0) {
      this.connectionsBySession.delete(keyStr);
      if (session.backend.pendingUpdateCount() === 0) {
        dropSession(sessionKey);
      }
    }
  }

  /**
   * Fan out a CRDT update to every connection in the same session
   * EXCEPT the originator. Suppresses send errors — a single bad
   * peer must not break the broadcast loop.
   */
  broadcastToPeers(
    sessionKey: RealtimeDocSessionKey,
    originator: RealtimeDocConnection,
    data: Uint8Array,
  ): number {
    const keyStr = this.keyString(sessionKey);
    const connSet = this.connectionsBySession.get(keyStr);
    if (!connSet) return 0;
    let sent = 0;
    for (const peer of connSet) {
      if (peer === originator) continue;
      try {
        peer.send(data);
        sent += 1;
      } catch {
        // Tolerate per-peer send failure.
      }
    }
    return sent;
  }

  /**
   * Manual detach (also called on the `close` event). Drops the
   * session from the registry if no connections remain.
   */
  detachConnection(
    conn: RealtimeDocConnection,
    sessionKey: RealtimeDocSessionKey,
    dropSession: (key: RealtimeDocSessionKey) => boolean = dropRealtimeDocSession,
  ): void {
    const keyStr = this.keyString(sessionKey);
    const connSet = this.connectionsBySession.get(keyStr);
    if (!connSet) return;
    if (!connSet.delete(conn)) return;
    const session = getOrCreateRealtimeDocSession(sessionKey);
    session.detachClient();
    if (connSet.size === 0) {
      this.connectionsBySession.delete(keyStr);
      // Only drop the registry session when the last client is gone
      // AND the backend has no pending unsaved updates.
      if (session.backend.pendingUpdateCount() === 0) {
        dropSession(sessionKey);
      }
    }
  }

  /** Operator inspection — number of live connections per session. */
  connectionCount(sessionKey: RealtimeDocSessionKey): number {
    return this.connectionsBySession.get(this.keyString(sessionKey))?.size ?? 0;
  }

  /** Operator inspection — total live sessions. */
  sessionCount(): number {
    return this.connectionsBySession.size;
  }

  /** Test seam — drop every connection set. */
  __resetForTests(): void {
    this.connectionsBySession.clear();
  }
}

// ============================================================================
// Module-singleton accessor
// ============================================================================

let _transport: RealtimeDocTransport | null = null;

export function getRealtimeDocTransport(): RealtimeDocTransport {
  if (!_transport) _transport = new RealtimeDocTransport();
  return _transport;
}

/** Test seam. Production code MUST NOT call this. */
export function __resetRealtimeDocTransportForTests(): void {
  _transport = null;
}
