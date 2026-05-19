/**
 * Realtime-doc WebSocket bridge — V1+ PR-V1-38.
 *
 * Closes the WebSocket-upgrade-pipeline first slice per the ADR
 * `docs/architecture/agent-studio-websocket-upgrade-pipeline.md`.
 *
 * Two exports:
 *
 *   - `adaptWsToRealtimeDocConnection(ws)` — wraps a `ws.WebSocket`
 *     in the narrow `RealtimeDocConnection` interface the transport
 *     and upgrade-handler already consume. The adapter forwards
 *     `send/close/on(message)/on(close)` and routes `error` events
 *     to the close handler with a synthetic `code=1011`+`reason="ws_error"`
 *     so no error is silently dropped.
 *
 *   - `installRealtimeDocUpgradeOnServer(server, opts)` — env-flag-
 *     gated installer that subscribes to `server.on("upgrade", ...)`
 *     once. Right pathname + valid query → invokes the upgrade
 *     handler closure with the parsed sessionKey. Wrong path /
 *     malformed query → `socket.destroy()` (no half-open sockets).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` imports.
 *   - No graph mutation. Transport carries CRDT frames; persistence
 *     flows through `agsVaultNotes` / `agsNoteVersions` at the save
 *     boundary per the CRDT ADR.
 *   - Auth runs BEFORE `transport.attachConnection` via the existing
 *     `handleRealtimeDocUpgrade` composition (#788).
 *
 * Env flag:
 *   `AGS_REALTIME_DOC_WEBSOCKET_ENABLED=true` → install dispatcher.
 *   Anything else (including unset) → no-op.
 */

import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

import type {
  RealtimeDocCloseHandler,
  RealtimeDocConnection,
  RealtimeDocMessageHandler,
  RealtimeDocTransport,
} from "./realtime-doc-transport.js";
import type {
  AuthorizeRealtimeDocConnectionFn,
  HandleRealtimeDocUpgradeResult,
} from "./realtime-doc-upgrade-handler.js";
import { handleRealtimeDocUpgrade } from "./realtime-doc-upgrade-handler.js";
import type { GetVaultIdsForUserFn } from "./realtime-doc-authorize.js";
import type { RealtimeDocSessionKey } from "./realtime-doc.js";

// ============================================================================
// Constants
// ============================================================================

export const REALTIME_DOC_WEBSOCKET_PATH =
  "/api/agent-studio/vault/realtime" as const;

export const REALTIME_DOC_WEBSOCKET_ENV_VAR =
  "AGS_REALTIME_DOC_WEBSOCKET_ENABLED" as const;

// ============================================================================
// ws.WebSocket → RealtimeDocConnection adapter
// ============================================================================

/**
 * The minimum `ws.WebSocket` surface we depend on. Declared
 * structurally so production passes a real `ws.WebSocket` and tests
 * pass a plain object — no `ws` import needed in tests.
 */
export interface WsWebSocketLike {
  send(data: Uint8Array | Buffer): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: Uint8Array | Buffer) => void): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  on(event: "error", listener: (err: Error) => void): void;
}

export function adaptWsToRealtimeDocConnection(
  ws: WsWebSocketLike,
): RealtimeDocConnection {
  // We hold the registered close handler so we can route `error`
  // events through it (the transport's onClose detaches the session
  // — running through it on error keeps cleanup symmetric).
  let closeHandler: RealtimeDocCloseHandler | undefined;

  ws.on("error", (err) => {
    // Surface the error without crashing the process. Route to the
    // close handler if registered (transport will detach the session).
    // Re-call close() so the socket actually closes from our side too.
    try {
      ws.close(1011, "ws_error");
    } catch {
      // Tolerate close-on-already-closed.
    }
    if (closeHandler) {
      try {
        closeHandler(1011, `ws_error: ${err.message}`);
      } catch {
        // Tolerate handler throws so cleanup still runs upstream.
      }
    } else {
      console.warn("[ags-realtime-doc] ws error without close handler:", err);
    }
  });

  return {
    send(data: Uint8Array) {
      // ws.send accepts Uint8Array. Cast is structural-safe.
      ws.send(data);
    },
    on(
      event: "message" | "close",
      handler: RealtimeDocMessageHandler | RealtimeDocCloseHandler,
    ) {
      if (event === "message") {
        const messageHandler = handler as RealtimeDocMessageHandler;
        ws.on("message", (data) => {
          // Normalize Buffer → Uint8Array. Buffer IS a Uint8Array
          // subclass, but the transport expects the narrower type.
          const bytes =
            data instanceof Uint8Array
              ? data
              : new Uint8Array(data as ArrayBufferLike);
          messageHandler(bytes);
        });
      } else {
        closeHandler = handler as RealtimeDocCloseHandler;
        ws.on("close", (code, reason) => {
          closeHandler?.(code, reason.toString());
        });
      }
    },
    close(code?: number, reason?: string) {
      ws.close(code, reason);
    },
  };
}

// ============================================================================
// Upgrade dispatcher
// ============================================================================

export interface InstallRealtimeDocUpgradeOpts {
  /** Test seam — override the env lookup. */
  readonly env?: NodeJS.ProcessEnv;
  /** Test seam — override the WebSocketServer factory. Production
   *  uses the real `ws` import lazily so tests don't need it. */
  readonly wsServerFactory?: () => WsServerLike;
  /** Production must supply this — used to authorize the upgrade.
   *  Test paths use the `authorize` override (see below). */
  readonly getVaultIdsForUser?: GetVaultIdsForUserFn;
  /** Test seam — override the full auth function. When set, wins
   *  over `getVaultIdsForUser` per the upgrade handler's contract. */
  readonly authorize?: AuthorizeRealtimeDocConnectionFn;
  /** Production-required resolver: parse the upgrade request's
   *  cookies/headers and return the authenticated userId, or `null`
   *  for unauthenticated requests. Sync or async — the dispatcher
   *  awaits the return value so DB-backed session lookups are fine.
   *  The first slice's default returns `null` synchronously;
   *  production callers supply `createDefaultGetUserIdFromUpgradeRequest()`
   *  from `realtime-doc-default-getuserid.ts` (PR-V1-52). */
  readonly getUserIdFromUpgradeRequest?: (
    req: IncomingMessage,
  ) => number | null | Promise<number | null>;
  /** Test seam — override the transport. Defaults to the module
   *  singleton via `getRealtimeDocTransport()`. */
  readonly transport?: Pick<RealtimeDocTransport, "attachConnection">;
}

export interface WsServerLike {
  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    cb: (ws: WsWebSocketLike) => void,
  ): void;
}

export interface InstallRealtimeDocUpgradeResult {
  readonly installed: boolean;
  readonly reason?: "env_flag_unset" | "install_failed";
}

function defaultGetUserIdFromUpgradeRequest(
  _req: IncomingMessage,
): number | null {
  // Test-mode fallback only. Production wires the auth-cookie
  // resolver via `createDefaultGetUserIdFromUpgradeRequest` from
  // `realtime-doc-default-getuserid.ts` (shipped via PR-V1-38 #789);
  // the boot wiring passes that closure as the
  // `getUserIdFromUpgradeRequest` option. Returning null here causes
  // the upgrade handler to deny with `missing_user_id` (close code
  // 4401) so an unconfigured bridge fails closed rather than allowing
  // anonymous connections.
  return null;
}

/**
 * Install the realtime-doc WebSocket upgrade dispatcher onto the
 * shared `http.Server`. Idempotent within a single boot (each call
 * adds one upgrade listener; production calls this exactly once at
 * boot).
 *
 * Returns `{ installed: true }` when the dispatcher subscribed, or
 * `{ installed: false, reason }` when the env flag was unset or the
 * install threw.
 */
export function installRealtimeDocUpgradeOnServer(
  server: Pick<HttpServer, "on">,
  opts: InstallRealtimeDocUpgradeOpts = {},
): InstallRealtimeDocUpgradeResult {
  const env = opts.env ?? process.env;
  if (env[REALTIME_DOC_WEBSOCKET_ENV_VAR] !== "true") {
    return { installed: false, reason: "env_flag_unset" };
  }

  try {
    const wss =
      opts.wsServerFactory?.() ?? createDefaultWebSocketServer();
    const getUserId =
      opts.getUserIdFromUpgradeRequest ?? defaultGetUserIdFromUpgradeRequest;

    server.on(
      "upgrade",
      (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const pathname = parsePathname(req.url);
        if (pathname !== REALTIME_DOC_WEBSOCKET_PATH) {
          // Wrong path — never created the WebSocket. Close the raw
          // socket so the client sees an abort rather than a hang.
          socket.destroy();
          return;
        }

        const sessionKey = parseSessionKeyFromUrl(req.url);
        if (!sessionKey) {
          socket.destroy();
          return;
        }

        wss.handleUpgrade(req, socket, head, async (ws) => {
          // PR-V1-52: getUserId may return a Promise — production
          // resolvers consult the OAuth SDK to verify session cookies
          // (DB-backed). Await unconditionally; sync returns are
          // resolved to their value by Promise.resolve.
          const userId = await getUserId(req);
          const conn = adaptWsToRealtimeDocConnection(ws);
          await runUpgradeHandler({
            conn,
            sessionKey,
            userId,
            opts,
          });
        });
      },
    );

    return { installed: true };
  } catch (err) {
    console.warn(
      "[ags-realtime-doc] WebSocket upgrade install failed —",
      err instanceof Error ? err.message : err,
    );
    return { installed: false, reason: "install_failed" };
  }
}

async function runUpgradeHandler(input: {
  readonly conn: RealtimeDocConnection;
  readonly sessionKey: RealtimeDocSessionKey;
  readonly userId: number | null;
  readonly opts: InstallRealtimeDocUpgradeOpts;
}): Promise<HandleRealtimeDocUpgradeResult> {
  // Lazy-import the transport singleton so the bridge file stays
  // structurally minimal and tests can override via opts.transport.
  const transport =
    input.opts.transport ??
    (
      await import("./realtime-doc-transport.js")
    ).getRealtimeDocTransport();

  return handleRealtimeDocUpgrade({
    conn: input.conn,
    sessionKey: input.sessionKey,
    userId: input.userId,
    transport,
    authorize: input.opts.authorize,
    getVaultIdsForUser: input.opts.getVaultIdsForUser,
  });
}

// ============================================================================
// URL parsing (pure helpers; exported for tests)
// ============================================================================

export function parsePathname(url: string | undefined): string | null {
  if (!url) return null;
  // `req.url` is a relative URL on Node http; resolve against a stub
  // origin so URL() parses cleanly.
  try {
    return new URL(url, "http://x").pathname;
  } catch {
    return null;
  }
}

export function parseSessionKeyFromUrl(
  url: string | undefined,
): RealtimeDocSessionKey | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, "http://x");
  } catch {
    return null;
  }
  const vaultIdStr = parsed.searchParams.get("vaultId");
  const noteIdStr = parsed.searchParams.get("noteId");
  if (!vaultIdStr || !noteIdStr) return null;
  const vaultId = Number(vaultIdStr);
  const noteId = Number(noteIdStr);
  if (!Number.isInteger(vaultId) || vaultId <= 0) return null;
  if (!Number.isInteger(noteId) || noteId <= 0) return null;
  return { vaultId, noteId };
}

// ============================================================================
// Default WebSocketServer factory (lazy ws import)
// ============================================================================

function createDefaultWebSocketServer(): WsServerLike {
  // `ws` is a hard dep (package.json `"ws": "^8.18.3"`). Loaded
  // lazily so the bridge file can be imported in unit tests that
  // never instantiate the dispatcher.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const wsModule = require("ws") as {
    WebSocketServer: new (opts: { noServer: boolean }) => WsServerLike;
  };
  return new wsModule.WebSocketServer({ noServer: true });
}
