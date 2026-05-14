/**
 * Realtime-doc WebSocket bridge — V1+ PR-V1-38.
 *
 * Covers:
 *   - adaptWsToRealtimeDocConnection forwards send / close /
 *     on(message) / on(close); error events route to the close
 *     handler with code=1011 + reason="ws_error:..." (no silent drop).
 *   - installRealtimeDocUpgradeOnServer:
 *     - env flag unset → installed=false, reason="env_flag_unset",
 *       NO server.on subscription.
 *     - env flag = "true" → installed=true, server.on("upgrade", ...)
 *       called exactly once.
 *     - wrong path → socket.destroy() called; wss.handleUpgrade NOT
 *       called.
 *     - right path + malformed query → socket.destroy() called.
 *     - right path + valid query → wss.handleUpgrade invoked with
 *       parsed sessionKey; upgrade handler runs with the adapted
 *       connection.
 *   - parsePathname + parseSessionKeyFromUrl pure helper matrices.
 *   - Source-scan boundary: bridge file does not import forbidden
 *     surfaces (credential-resolver, dispatchMcpToolCall, *_API_KEY,
 *     neo4j-driver, openrouter).
 *   - Boot-install integrity: server/_core/index.ts references the
 *     bridge by exact import path (catches refactor drift).
 */

import { EventEmitter } from "node:events";
import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REALTIME_DOC_WEBSOCKET_ENV_VAR,
  REALTIME_DOC_WEBSOCKET_PATH,
  adaptWsToRealtimeDocConnection,
  installRealtimeDocUpgradeOnServer,
  parsePathname,
  parseSessionKeyFromUrl,
  type WsServerLike,
  type WsWebSocketLike,
} from "../../server/agent-studio/services/vault/realtime-doc-websocket-bridge.js";
import {
  __resetRealtimeDocTransportForTests,
  type RealtimeDocConnection,
  type RealtimeDocTransport,
} from "../../server/agent-studio/services/vault/realtime-doc-transport.js";

afterEach(() => {
  __resetRealtimeDocTransportForTests();
});

// ============================================================================
// ws.WebSocket adapter tests
// ============================================================================

function makeFakeWs() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {
    message: [],
    close: [],
    error: [],
  };
  const sent: Array<Uint8Array | Buffer> = [];
  const closeCalls: Array<{ code?: number; reason?: string }> = [];
  const ws: WsWebSocketLike & {
    fire: (event: "message" | "close" | "error", ...args: unknown[]) => void;
    sent: typeof sent;
    closeCalls: typeof closeCalls;
  } = {
    send(data) {
      sent.push(data);
    },
    close(code, reason) {
      closeCalls.push({ code, reason });
    },
    on(event: "message" | "close" | "error", listener: never) {
      listeners[event].push(listener);
    },
    fire(event, ...args) {
      for (const l of listeners[event]) l(...args);
    },
    sent,
    closeCalls,
  };
  return ws;
}

describe("adaptWsToRealtimeDocConnection — happy path", () => {
  it("send(Uint8Array) forwards to ws.send", () => {
    const ws = makeFakeWs();
    const conn = adaptWsToRealtimeDocConnection(ws);
    const payload = new Uint8Array([1, 2, 3]);
    conn.send(payload);
    expect(ws.sent).toEqual([payload]);
  });

  it("on(message) registers a ws message listener; forwards Uint8Array", () => {
    const ws = makeFakeWs();
    const conn = adaptWsToRealtimeDocConnection(ws);
    const handler = vi.fn();
    conn.on("message", handler);
    const buf = new Uint8Array([9, 8, 7]);
    ws.fire("message", buf);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(buf);
  });

  it("on(message) normalizes Buffer payloads to Uint8Array", () => {
    const ws = makeFakeWs();
    const conn = adaptWsToRealtimeDocConnection(ws);
    const handler = vi.fn();
    conn.on("message", handler);
    const buf = Buffer.from([5, 4, 3]);
    ws.fire("message", buf);
    expect(handler).toHaveBeenCalledTimes(1);
    const arg = handler.mock.calls[0]?.[0] as Uint8Array;
    expect(arg).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg)).toEqual([5, 4, 3]);
  });

  it("on(close) forwards code + reason as string", () => {
    const ws = makeFakeWs();
    const conn = adaptWsToRealtimeDocConnection(ws);
    const handler = vi.fn();
    conn.on("close", handler);
    ws.fire("close", 1000, Buffer.from("bye"));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1000, "bye");
  });

  it("close(code, reason) forwards to ws.close", () => {
    const ws = makeFakeWs();
    const conn = adaptWsToRealtimeDocConnection(ws);
    conn.close(4403, "not_a_vault_member");
    expect(ws.closeCalls).toEqual([
      { code: 4403, reason: "not_a_vault_member" },
    ]);
  });
});

describe("adaptWsToRealtimeDocConnection — error event routes through close handler", () => {
  it("ws error → ws.close(1011, ws_error) + close handler invoked with code=1011", () => {
    const ws = makeFakeWs();
    const conn = adaptWsToRealtimeDocConnection(ws);
    const closeHandler = vi.fn();
    conn.on("close", closeHandler);
    ws.fire("error", new Error("boom"));
    expect(ws.closeCalls).toContainEqual({ code: 1011, reason: "ws_error" });
    expect(closeHandler).toHaveBeenCalledTimes(1);
    expect(closeHandler).toHaveBeenCalledWith(1011, "ws_error: boom");
  });

  it("ws error without a registered close handler does NOT throw", () => {
    const ws = makeFakeWs();
    adaptWsToRealtimeDocConnection(ws); // no on(close) registration
    // Should not throw — the error path warns + closes the socket.
    expect(() => ws.fire("error", new Error("boom"))).not.toThrow();
    expect(ws.closeCalls).toContainEqual({ code: 1011, reason: "ws_error" });
  });

  it("ws error tolerates ws.close throwing (already-closed race)", () => {
    const ws = makeFakeWs();
    ws.close = () => {
      throw new Error("already closed");
    };
    const conn = adaptWsToRealtimeDocConnection(ws);
    const closeHandler = vi.fn();
    conn.on("close", closeHandler);
    expect(() => ws.fire("error", new Error("net"))).not.toThrow();
    // Close handler still fires so upstream cleanup runs.
    expect(closeHandler).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// URL parsing tests
// ============================================================================

describe("parsePathname", () => {
  it.each([
    ["/api/agent-studio/vault/realtime", "/api/agent-studio/vault/realtime"],
    ["/api/agent-studio/vault/realtime?vaultId=1", "/api/agent-studio/vault/realtime"],
    ["/", "/"],
  ])("parses %s → %s", (input, expected) => {
    expect(parsePathname(input)).toBe(expected);
  });

  it.each([[undefined], [""]])("returns null for falsy input: %s", (input) => {
    expect(parsePathname(input as string | undefined)).toBeNull();
  });
});

describe("parseSessionKeyFromUrl", () => {
  it("parses vaultId + noteId as positive integers", () => {
    expect(
      parseSessionKeyFromUrl(
        "/api/agent-studio/vault/realtime?vaultId=7&noteId=42",
      ),
    ).toEqual({ vaultId: 7, noteId: 42 });
  });

  it.each([
    ["missing vaultId", "/p?noteId=1"],
    ["missing noteId", "/p?vaultId=1"],
    ["neither", "/p"],
    ["vaultId non-integer", "/p?vaultId=abc&noteId=1"],
    ["noteId non-integer", "/p?vaultId=1&noteId=abc"],
    ["vaultId zero", "/p?vaultId=0&noteId=1"],
    ["noteId negative", "/p?vaultId=1&noteId=-3"],
    ["vaultId float", "/p?vaultId=1.5&noteId=1"],
  ])("returns null for: %s", (_label, url) => {
    expect(parseSessionKeyFromUrl(url)).toBeNull();
  });

  it.each([[undefined], [""]])("returns null for falsy: %s", (input) => {
    expect(parseSessionKeyFromUrl(input as string | undefined)).toBeNull();
  });
});

// ============================================================================
// Install dispatcher tests
// ============================================================================

function makeFakeServer() {
  const emitter = new EventEmitter();
  return {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      emitter.on(event, listener);
    },
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
    listenerCount: (event: string) => emitter.listenerCount(event),
  };
}

function makeFakeWss(): WsServerLike & {
  handleUpgradeCalls: number;
  attachedSocket: WsWebSocketLike | null;
} {
  let handleUpgradeCalls = 0;
  let attachedSocket: WsWebSocketLike | null = null;
  return {
    handleUpgrade(_req, _socket, _head, cb) {
      handleUpgradeCalls += 1;
      const ws = makeFakeWs();
      attachedSocket = ws;
      cb(ws);
    },
    get handleUpgradeCalls() {
      return handleUpgradeCalls;
    },
    get attachedSocket() {
      return attachedSocket;
    },
  };
}

function makeFakeTransport(): Pick<RealtimeDocTransport, "attachConnection"> & {
  attachCalls: Array<{ conn: RealtimeDocConnection; sessionKey: unknown }>;
} {
  const attachCalls: Array<{ conn: RealtimeDocConnection; sessionKey: unknown }> = [];
  return {
    attachConnection(conn, options) {
      attachCalls.push({ conn, sessionKey: options.sessionKey });
      return () => {};
    },
    attachCalls,
  };
}

describe("installRealtimeDocUpgradeOnServer — env flag matrix", () => {
  it("env flag unset → installed=false, no upgrade listener registered", () => {
    const server = makeFakeServer();
    const result = installRealtimeDocUpgradeOnServer(server, { env: {} });
    expect(result).toEqual({ installed: false, reason: "env_flag_unset" });
    expect(server.listenerCount("upgrade")).toBe(0);
  });

  it.each([["false"], ["1"], ["TRUE"], ["yes"]])(
    "env flag = %s → installed=false (strict equality)",
    (value) => {
      const server = makeFakeServer();
      const result = installRealtimeDocUpgradeOnServer(server, {
        env: { [REALTIME_DOC_WEBSOCKET_ENV_VAR]: value },
      });
      expect(result).toEqual({ installed: false, reason: "env_flag_unset" });
      expect(server.listenerCount("upgrade")).toBe(0);
    },
  );

  it("env flag = 'true' → installed=true, registers exactly one upgrade listener", () => {
    const server = makeFakeServer();
    const result = installRealtimeDocUpgradeOnServer(server, {
      env: { [REALTIME_DOC_WEBSOCKET_ENV_VAR]: "true" },
      wsServerFactory: () => makeFakeWss(),
    });
    expect(result).toEqual({ installed: true });
    expect(server.listenerCount("upgrade")).toBe(1);
  });
});

describe("installRealtimeDocUpgradeOnServer — dispatch routing", () => {
  function setup() {
    const server = makeFakeServer();
    const wss = makeFakeWss();
    const transport = makeFakeTransport();
    const authorize = vi.fn(async () => ({ allow: true } as const));
    const getUserIdFromUpgradeRequest = vi.fn(() => 100);
    installRealtimeDocUpgradeOnServer(server, {
      env: { [REALTIME_DOC_WEBSOCKET_ENV_VAR]: "true" },
      wsServerFactory: () => wss,
      transport,
      authorize,
      getUserIdFromUpgradeRequest,
    });
    return { server, wss, transport, authorize, getUserIdFromUpgradeRequest };
  }

  function makeReq(url: string) {
    return { url } as unknown as import("node:http").IncomingMessage;
  }
  function makeSocket() {
    const destroyCalls: number[] = [];
    return {
      destroy: () => {
        destroyCalls.push(1);
      },
      destroyCalls,
    } as unknown as import("node:stream").Duplex & {
      destroyCalls: number[];
    };
  }

  it("wrong path → socket.destroy() called; wss.handleUpgrade NOT called", () => {
    const { server, wss } = setup();
    const socket = makeSocket();
    server.emit(
      "upgrade",
      makeReq("/wrong/path"),
      socket,
      Buffer.alloc(0),
    );
    expect((socket as { destroyCalls: number[] }).destroyCalls).toHaveLength(1);
    expect(wss.handleUpgradeCalls).toBe(0);
  });

  it("right path + missing query → socket.destroy(); wss.handleUpgrade NOT called", () => {
    const { server, wss } = setup();
    const socket = makeSocket();
    server.emit(
      "upgrade",
      makeReq(REALTIME_DOC_WEBSOCKET_PATH),
      socket,
      Buffer.alloc(0),
    );
    expect((socket as { destroyCalls: number[] }).destroyCalls).toHaveLength(1);
    expect(wss.handleUpgradeCalls).toBe(0);
  });

  it("right path + valid query → wss.handleUpgrade called; transport.attach invoked with parsed sessionKey", async () => {
    const { server, wss, transport, authorize, getUserIdFromUpgradeRequest } =
      setup();
    const socket = makeSocket();
    server.emit(
      "upgrade",
      makeReq(`${REALTIME_DOC_WEBSOCKET_PATH}?vaultId=7&noteId=42`),
      socket,
      Buffer.alloc(0),
    );
    // wss.handleUpgrade invokes its callback synchronously in our
    // fake; the upgrade-handler is async but the attach is also
    // synchronous in our test transport.
    await new Promise((r) => setImmediate(r));
    expect((socket as { destroyCalls: number[] }).destroyCalls).toHaveLength(0);
    expect(wss.handleUpgradeCalls).toBe(1);
    expect(getUserIdFromUpgradeRequest).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledWith({
      sessionKey: { vaultId: 7, noteId: 42 },
      userId: 100,
    });
    expect(transport.attachCalls).toHaveLength(1);
    expect(transport.attachCalls[0].sessionKey).toEqual({
      vaultId: 7,
      noteId: 42,
    });
  });

  it("deny path → conn.close() called; transport NOT attached", async () => {
    const server = makeFakeServer();
    const wss = makeFakeWss();
    const transport = makeFakeTransport();
    installRealtimeDocUpgradeOnServer(server, {
      env: { [REALTIME_DOC_WEBSOCKET_ENV_VAR]: "true" },
      wsServerFactory: () => wss,
      transport,
      authorize: async () => ({
        allow: false,
        reason: "not_a_vault_member" as const,
      }),
      getUserIdFromUpgradeRequest: () => 100,
    });
    const socket = makeSocket();
    server.emit(
      "upgrade",
      makeReq(`${REALTIME_DOC_WEBSOCKET_PATH}?vaultId=7&noteId=42`),
      socket,
      Buffer.alloc(0),
    );
    await new Promise((r) => setImmediate(r));
    expect(transport.attachCalls).toHaveLength(0);
    // The fake ws was created by wss.handleUpgrade; the deny path
    // calls .close on it via the adapter.
    expect(wss.attachedSocket).not.toBeNull();
    expect(wss.attachedSocket?.closeCalls).toContainEqual({
      code: 4403,
      reason: "not_a_vault_member",
    });
  });

  it("missing-userId path → conn.close(4401) called; transport NOT attached", async () => {
    const server = makeFakeServer();
    const wss = makeFakeWss();
    const transport = makeFakeTransport();
    installRealtimeDocUpgradeOnServer(server, {
      env: { [REALTIME_DOC_WEBSOCKET_ENV_VAR]: "true" },
      wsServerFactory: () => wss,
      transport,
      // No authorize override; rely on default-path through
      // getVaultIdsForUser. Since userId returns null → upgrade
      // handler returns missing_user_id without calling the lookup.
      getVaultIdsForUser: async () => [7],
      // getUserIdFromUpgradeRequest defaults to ()=>null.
    });
    const socket = makeSocket();
    server.emit(
      "upgrade",
      makeReq(`${REALTIME_DOC_WEBSOCKET_PATH}?vaultId=7&noteId=42`),
      socket,
      Buffer.alloc(0),
    );
    await new Promise((r) => setImmediate(r));
    expect(transport.attachCalls).toHaveLength(0);
    expect(wss.attachedSocket?.closeCalls).toContainEqual({
      code: 4401,
      reason: "missing_user_id",
    });
  });
});

// ============================================================================
// Source-scan boundary
// ============================================================================

describe("source-scan boundary", () => {
  const bridgeFile = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc-websocket-bridge.ts",
  );
  const indexFile = resolve(__dirname, "../../server/_core/index.ts");
  const bridgeSrc = readFileSync(bridgeFile, "utf8");
  const indexSrc = readFileSync(indexFile, "utf8");

  it("bridge does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(bridgeSrc)).toBe(false);
  });

  it("bridge does not import dispatchMcpToolCall", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        bridgeSrc,
      ),
    ).toBe(false);
  });

  it("bridge does not read process.env.*_API_KEY", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(bridgeSrc)).toBe(false);
  });

  it("bridge does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(bridgeSrc)).toBe(false);
  });

  it("bridge does not import openrouter model-access", () => {
    expect(
      /from\s+["'][^"']*openrouter\/model-access/.test(bridgeSrc),
    ).toBe(false);
  });

  it("bridge does not import GraphRepository", () => {
    expect(
      /from\s+["'][^"']*graph\/repository/.test(bridgeSrc),
    ).toBe(false);
  });

  it("server/_core/index.ts references the bridge install by exact path", () => {
    expect(
      /installRealtimeDocUpgradeOnServer/.test(indexSrc),
    ).toBe(true);
    expect(
      /from\s+["'][^"']*services\/vault\/realtime-doc-websocket-bridge["']/.test(
        indexSrc,
      ) ||
        /import\s*\([^)]*services\/vault\/realtime-doc-websocket-bridge[^)]*\)/.test(
          indexSrc,
        ),
    ).toBe(true);
  });

  it("server/_core/index.ts mentions the env-flag-gated semantics", () => {
    expect(/AGS_REALTIME_DOC_WEBSOCKET_ENABLED/.test(indexSrc)).toBe(true);
  });
});
