/**
 * Realtime-doc transport — CRDT-γ-3-framing wire-up — V1+ PR-V1-40.
 *
 * Covers:
 *   - frameHandlers omitted → default CRDT-γ-2 behavior preserved
 *     (session.handleUpdate receives raw `data`; no dispatcher call).
 *   - frameHandlers supplied → dispatcher routes:
 *     * sync frame → handlers.onSync invoked; broadcast still fires
 *     * awareness frame → handlers.onAwareness invoked
 *     * unknown frame with onUnknown set → onUnknown invoked
 *     * unknown frame with no onUnknown → no-op; broadcast still fires
 *   - parse errors close the connection with stable codes:
 *     * empty frame → 4400
 *     * oversize frame → 4413 (mirrors HTTP 413)
 *     * handler throw → 4500
 *   - closeOnFrameError=false → no close on parse/handler error
 *   - maxFrameBytes override is honored
 *   - shouldBroadcast=false suppresses BOTH the dispatcher AND the
 *     broadcast (defense-in-depth)
 *   - REALTIME_DOC_FRAME_CLOSE_CODES taxonomy (3 values)
 *   - Source-scan: transport file references the framing module
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REALTIME_DOC_FRAME_CLOSE_CODES,
  RealtimeDocTransport,
  __resetRealtimeDocTransportForTests,
  type RealtimeDocConnection,
} from "../../server/agent-studio/services/vault/realtime-doc-transport.js";
import type { RealtimeDocFrameHandlers } from "../../server/agent-studio/services/vault/realtime-doc-framing.js";
import {
  __resetRealtimeDocRegistryForTests,
  type RealtimeDocSession,
} from "../../server/agent-studio/services/vault/realtime-doc.js";

afterEach(() => {
  __resetRealtimeDocTransportForTests();
  __resetRealtimeDocRegistryForTests();
});

function fakeConn(): RealtimeDocConnection & {
  closeCalls: Array<{ code?: number; reason?: string }>;
  sent: Uint8Array[];
  fire: (event: "message" | "close", ...args: unknown[]) => void;
} {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {
    message: [],
    close: [],
  };
  const closeCalls: Array<{ code?: number; reason?: string }> = [];
  const sent: Uint8Array[] = [];
  return {
    send(data: Uint8Array) {
      sent.push(data);
    },
    on(event: "message" | "close", h: (...args: unknown[]) => void) {
      listeners[event].push(h);
    },
    close(code?: number, reason?: string) {
      closeCalls.push({ code, reason });
    },
    closeCalls,
    sent,
    fire(event, ...args) {
      for (const h of listeners[event]) h(...args);
    },
  };
}

function fakeSession(): RealtimeDocSession & {
  updates: Uint8Array[];
} {
  const updates: Uint8Array[] = [];
  return {
    key: { vaultId: 1, noteId: 1 },
    attachClient: () => {},
    detachClient: () => 0,
    handleUpdate: (data) => {
      updates.push(data);
    },
    snapshot: () => new Uint8Array([]),
    updates,
  } as unknown as RealtimeDocSession & { updates: Uint8Array[] };
}

const KEY = { vaultId: 1, noteId: 1 } as const;

describe("transport — frameHandlers omitted (default behavior preserved)", () => {
  it("forwards raw data to session.handleUpdate (CRDT-γ-2 behavior)", () => {
    const t = new RealtimeDocTransport();
    const conn = fakeConn();
    const session = fakeSession();
    t.attachConnection(conn, {
      sessionKey: KEY,
      resolveSession: () => session,
    });
    const raw = new Uint8Array([0, 1, 2, 3]);
    conn.fire("message", raw);
    expect(session.updates).toEqual([raw]);
    expect(conn.closeCalls).toEqual([]);
  });
});

describe("transport — frameHandlers supplied (CRDT-γ-3 dispatch)", () => {
  it("sync frame → onSync invoked; payload stripped of leading byte", async () => {
    const t = new RealtimeDocTransport();
    const conn = fakeConn();
    const session = fakeSession();
    const onSync = vi.fn();
    const handlers: RealtimeDocFrameHandlers = { onSync };
    t.attachConnection(conn, {
      sessionKey: KEY,
      resolveSession: () => session,
      frameHandlers: handlers,
    });
    conn.fire("message", new Uint8Array([0, 10, 20]));
    // Dispatcher is async; flush.
    await new Promise((r) => setImmediate(r));
    expect(onSync).toHaveBeenCalledTimes(1);
    const [frame, ctx] = onSync.mock.calls[0] as [
      { type: string; payload: Uint8Array },
      { session: unknown },
    ];
    expect(frame.type).toBe("sync");
    expect(Array.from(frame.payload)).toEqual([10, 20]);
    expect(ctx.session).toBe(session);
    // Existing session.handleUpdate is NOT called automatically — the
    // dispatcher hands the bytes to the handler instead.
    expect(session.updates).toEqual([]);
  });

  it("awareness frame → onAwareness invoked", async () => {
    const t = new RealtimeDocTransport();
    const conn = fakeConn();
    const session = fakeSession();
    const onAwareness = vi.fn();
    t.attachConnection(conn, {
      sessionKey: KEY,
      resolveSession: () => session,
      frameHandlers: { onAwareness },
    });
    conn.fire("message", new Uint8Array([1, 9, 8]));
    await new Promise((r) => setImmediate(r));
    expect(onAwareness).toHaveBeenCalledTimes(1);
  });

  it("unknown frame with onUnknown set → onUnknown invoked", async () => {
    const t = new RealtimeDocTransport();
    const conn = fakeConn();
    const onUnknown = vi.fn();
    t.attachConnection(conn, {
      sessionKey: KEY,
      resolveSession: () => fakeSession(),
      frameHandlers: { onUnknown },
    });
    conn.fire("message", new Uint8Array([99, 1]));
    await new Promise((r) => setImmediate(r));
    expect(onUnknown).toHaveBeenCalledTimes(1);
  });

  it("unknown frame with no onUnknown → no-op + connection NOT closed + broadcast still fires", async () => {
    const t = new RealtimeDocTransport();
    const a = fakeConn();
    const b = fakeConn();
    const session = fakeSession();
    t.attachConnection(a, {
      sessionKey: KEY,
      resolveSession: () => session,
      frameHandlers: {},
    });
    t.attachConnection(b, {
      sessionKey: KEY,
      resolveSession: () => session,
      frameHandlers: {},
    });
    const raw = new Uint8Array([99, 1]);
    a.fire("message", raw);
    await new Promise((r) => setImmediate(r));
    expect(a.closeCalls).toEqual([]);
    // Peer broadcast: b should have received the frame.
    expect(b.sent.length).toBeGreaterThan(0);
  });

  it("dispatch success path still broadcasts the raw frame to peers", async () => {
    const t = new RealtimeDocTransport();
    const a = fakeConn();
    const b = fakeConn();
    const session = fakeSession();
    t.attachConnection(a, {
      sessionKey: KEY,
      resolveSession: () => session,
      frameHandlers: { onSync: () => {} },
    });
    t.attachConnection(b, {
      sessionKey: KEY,
      resolveSession: () => session,
      frameHandlers: { onSync: () => {} },
    });
    const raw = new Uint8Array([0, 7]);
    // b receives the snapshot at attach; clear its sent log.
    b.sent.length = 0;
    a.fire("message", raw);
    await new Promise((r) => setImmediate(r));
    expect(b.sent).toContainEqual(raw);
  });
});

describe("transport — frame-error close behavior", () => {
  it("empty frame → connection closed with code 4400", async () => {
    const t = new RealtimeDocTransport();
    const conn = fakeConn();
    t.attachConnection(conn, {
      sessionKey: KEY,
      resolveSession: () => fakeSession(),
      frameHandlers: {},
    });
    conn.fire("message", new Uint8Array([]));
    await new Promise((r) => setImmediate(r));
    expect(conn.closeCalls).toHaveLength(1);
    expect(conn.closeCalls[0].code).toBe(
      REALTIME_DOC_FRAME_CLOSE_CODES.empty_frame,
    );
  });

  it("oversize frame → connection closed with code 4413", async () => {
    const t = new RealtimeDocTransport();
    const conn = fakeConn();
    t.attachConnection(conn, {
      sessionKey: KEY,
      resolveSession: () => fakeSession(),
      frameHandlers: {},
      maxFrameBytes: 3,
    });
    conn.fire("message", new Uint8Array([0, 1, 2, 3, 4]));
    await new Promise((r) => setImmediate(r));
    expect(conn.closeCalls).toHaveLength(1);
    expect(conn.closeCalls[0].code).toBe(
      REALTIME_DOC_FRAME_CLOSE_CODES.frame_too_large,
    );
  });

  it("handler throw → connection closed with code 4500", async () => {
    const t = new RealtimeDocTransport();
    const conn = fakeConn();
    t.attachConnection(conn, {
      sessionKey: KEY,
      resolveSession: () => fakeSession(),
      frameHandlers: {
        onSync: () => {
          throw new Error("handler boom");
        },
      },
    });
    conn.fire("message", new Uint8Array([0, 1, 2]));
    await new Promise((r) => setImmediate(r));
    expect(conn.closeCalls).toHaveLength(1);
    expect(conn.closeCalls[0].code).toBe(
      REALTIME_DOC_FRAME_CLOSE_CODES.handler_error,
    );
  });

  it("closeOnFrameError=false → no close on parse error", async () => {
    const t = new RealtimeDocTransport();
    const conn = fakeConn();
    t.attachConnection(conn, {
      sessionKey: KEY,
      resolveSession: () => fakeSession(),
      frameHandlers: {},
      closeOnFrameError: false,
    });
    conn.fire("message", new Uint8Array([]));
    await new Promise((r) => setImmediate(r));
    expect(conn.closeCalls).toEqual([]);
  });

  it("conn.close throwing during error-handling does NOT crash the dispatcher", async () => {
    const t = new RealtimeDocTransport();
    const conn = fakeConn();
    conn.close = () => {
      throw new Error("already closed");
    };
    t.attachConnection(conn, {
      sessionKey: KEY,
      resolveSession: () => fakeSession(),
      frameHandlers: {},
    });
    expect(() => conn.fire("message", new Uint8Array([]))).not.toThrow();
  });
});

describe("transport — shouldBroadcast interplay with frameHandlers", () => {
  it("shouldBroadcast=false suppresses BOTH dispatcher and broadcast", async () => {
    const t = new RealtimeDocTransport();
    const a = fakeConn();
    const b = fakeConn();
    const session = fakeSession();
    const onSync = vi.fn();
    t.attachConnection(a, {
      sessionKey: KEY,
      resolveSession: () => session,
      frameHandlers: { onSync },
      shouldBroadcast: () => false,
    });
    t.attachConnection(b, {
      sessionKey: KEY,
      resolveSession: () => session,
      frameHandlers: { onSync },
    });
    b.sent.length = 0;
    a.fire("message", new Uint8Array([0, 1, 2]));
    await new Promise((r) => setImmediate(r));
    expect(onSync).not.toHaveBeenCalled();
    expect(b.sent).toEqual([]);
  });
});

describe("REALTIME_DOC_FRAME_CLOSE_CODES taxonomy", () => {
  it("is a closed 3-value record with stable codes", () => {
    expect(REALTIME_DOC_FRAME_CLOSE_CODES).toEqual({
      empty_frame: 4400,
      frame_too_large: 4413,
      handler_error: 4500,
    });
  });
});

describe("source-scan", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc-transport.ts",
  );
  const src = readFileSync(file, "utf8");

  it("transport imports the framing dispatcher (wire-up exists)", () => {
    expect(
      /from\s+["']\.\/realtime-doc-framing(\.js)?["']/.test(src),
    ).toBe(true);
    expect(/dispatchRealtimeDocFrame/.test(src)).toBe(true);
  });

  it("transport file does not import openrouter / graph repository / mcp dispatcher", () => {
    expect(/from\s+["'][^"']*openrouter\/model-access/.test(src)).toBe(false);
    expect(/from\s+["'][^"']*graph\/repository/.test(src)).toBe(false);
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        src,
      ),
    ).toBe(false);
  });
});
