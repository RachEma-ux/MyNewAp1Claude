/**
 * Realtime-doc WebSocket transport tests — V2 Phase CRDT-γ-2.
 *
 * Covers:
 *   - attachConnection: snapshot sent to new client; on("message")
 *     wired to handleUpdate; broadcast fans out to peers
 *   - broadcast skips the originator
 *   - per-peer send error is tolerated (broadcast continues)
 *   - on("close") detaches; session is dropped when last client
 *     leaves AND no pending updates
 *   - session is preserved when last client leaves but pending
 *     updates exist (operator-saveable)
 *   - shouldBroadcast=false suppresses the broadcast for that
 *     message
 *   - connection/session count operator inspections
 *   - module-singleton accessor + test reset seam
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY / neo4j-driver
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InMemoryRealtimeDocBackend,
  RealtimeDocSession,
} from "../../server/agent-studio/services/vault/realtime-doc.js";
import {
  RealtimeDocTransport,
  __resetRealtimeDocTransportForTests,
  getRealtimeDocTransport,
  type RealtimeDocCloseHandler,
  type RealtimeDocConnection,
  type RealtimeDocMessageHandler,
} from "../../server/agent-studio/services/vault/realtime-doc-transport.js";

beforeEach(() => {
  __resetRealtimeDocTransportForTests();
});

afterEach(() => {
  __resetRealtimeDocTransportForTests();
});

function makeFakeConnection(): {
  conn: RealtimeDocConnection;
  sent: Uint8Array[];
  messageHandlers: RealtimeDocMessageHandler[];
  closeHandlers: RealtimeDocCloseHandler[];
  closed: boolean;
} {
  const sent: Uint8Array[] = [];
  const messageHandlers: RealtimeDocMessageHandler[] = [];
  const closeHandlers: RealtimeDocCloseHandler[] = [];
  let closed = false;
  const state = { closed };
  const conn: RealtimeDocConnection = {
    send: vi.fn((data: Uint8Array) => {
      sent.push(data);
    }),
    on: ((event: string, handler: unknown) => {
      if (event === "message") {
        messageHandlers.push(handler as RealtimeDocMessageHandler);
      } else if (event === "close") {
        closeHandlers.push(handler as RealtimeDocCloseHandler);
      }
    }) as RealtimeDocConnection["on"],
    close: vi.fn(() => {
      state.closed = true;
      for (const h of closeHandlers) h();
    }),
  };
  return {
    conn,
    sent,
    messageHandlers,
    closeHandlers,
    get closed() {
      return state.closed;
    },
  } as never;
}

describe("RealtimeDocTransport — attachConnection lifecycle", () => {
  it("sends snapshot to the new client on attach", () => {
    const transport = new RealtimeDocTransport();
    const fake = makeFakeConnection();
    const session = new RealtimeDocSession({ vaultId: 1, noteId: 2 });
    session.backend.setText("hello");

    transport.attachConnection(fake.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
    });

    expect(fake.sent.length).toBe(1);
    // InMemory backend snapshot is a JSON-encoded `{ content: "hello" }`.
    expect(new TextDecoder().decode(fake.sent[0])).toContain("hello");
  });

  it("wires on('message') to session.handleUpdate", () => {
    const transport = new RealtimeDocTransport();
    const fake = makeFakeConnection();
    const session = new RealtimeDocSession({ vaultId: 1, noteId: 2 });

    transport.attachConnection(fake.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
    });

    expect(fake.messageHandlers.length).toBe(1);
    fake.messageHandlers[0](
      new TextEncoder().encode(JSON.stringify({ content: "world" })),
    );
    expect(session.backend.getText()).toBe("world");
  });

  it("broadcast skips the originator", () => {
    const transport = new RealtimeDocTransport();
    const fakeA = makeFakeConnection();
    const fakeB = makeFakeConnection();
    const session = new RealtimeDocSession({ vaultId: 1, noteId: 2 });
    transport.attachConnection(fakeA.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
    });
    transport.attachConnection(fakeB.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
    });

    fakeA.sent.length = 0; // clear post-snapshot sends
    fakeB.sent.length = 0;

    const data = new TextEncoder().encode(JSON.stringify({ content: "x" }));
    fakeA.messageHandlers[0](data);
    expect(fakeA.sent.length).toBe(0); // originator does NOT receive
    expect(fakeB.sent.length).toBe(1); // peer receives
  });
});

describe("RealtimeDocTransport — error tolerance", () => {
  it("per-peer send failure does NOT break broadcast", () => {
    const transport = new RealtimeDocTransport();
    const fakeA = makeFakeConnection();
    const fakeBroken = makeFakeConnection();
    const fakeC = makeFakeConnection();
    const session = new RealtimeDocSession({ vaultId: 1, noteId: 2 });
    transport.attachConnection(fakeA.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
    });
    transport.attachConnection(fakeBroken.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
    });
    transport.attachConnection(fakeC.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
    });

    (fakeBroken.conn.send as unknown as { mockImplementation: (fn: () => void) => void }).mockImplementation(
      () => {
        throw new Error("peer ECONNRESET");
      },
    );

    fakeA.sent.length = 0;
    fakeC.sent.length = 0;

    fakeA.messageHandlers[0](new Uint8Array([1, 2, 3]));
    expect(fakeC.sent.length).toBe(1); // C still got the broadcast
  });
});

describe("RealtimeDocTransport — close lifecycle + session drop", () => {
  it("detaches on close + drops session when last client leaves with no pending updates", () => {
    const transport = new RealtimeDocTransport();
    const fakeA = makeFakeConnection();
    const session = new RealtimeDocSession({ vaultId: 1, noteId: 2 });
    const dropSession = vi.fn(() => true);
    transport.attachConnection(fakeA.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
      dropSession,
    });
    expect(transport.connectionCount({ vaultId: 1, noteId: 2 })).toBe(1);

    // Trigger close.
    for (const h of fakeA.closeHandlers) h();
    expect(transport.connectionCount({ vaultId: 1, noteId: 2 })).toBe(0);
    expect(dropSession).toHaveBeenCalledTimes(1);
  });

  it("preserves the session when pending updates exist on last close", () => {
    const transport = new RealtimeDocTransport();
    const fakeA = makeFakeConnection();
    const backend = new InMemoryRealtimeDocBackend();
    backend.setText("dirty"); // pendingUpdateCount = 1
    const session = new RealtimeDocSession(
      { vaultId: 1, noteId: 2 },
      () => backend,
    );
    const dropSession = vi.fn(() => true);
    transport.attachConnection(fakeA.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
      dropSession,
    });
    for (const h of fakeA.closeHandlers) h();
    expect(dropSession).not.toHaveBeenCalled();
  });
});

describe("RealtimeDocTransport — shouldBroadcast suppression", () => {
  it("shouldBroadcast=false suppresses the broadcast for that message", () => {
    const transport = new RealtimeDocTransport();
    const fakeA = makeFakeConnection();
    const fakeB = makeFakeConnection();
    const session = new RealtimeDocSession({ vaultId: 1, noteId: 2 });
    transport.attachConnection(fakeA.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
      shouldBroadcast: () => false,
    });
    transport.attachConnection(fakeB.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => session,
    });
    fakeA.sent.length = 0;
    fakeB.sent.length = 0;
    fakeA.messageHandlers[0](new Uint8Array([1, 2]));
    expect(fakeB.sent.length).toBe(0);
    // The session.handleUpdate ALSO didn't run for the suppressed
    // message — the gate is applied before applyUpdate.
    expect(session.backend.pendingUpdateCount()).toBe(0);
  });
});

describe("RealtimeDocTransport — operator inspection", () => {
  it("connectionCount + sessionCount reflect live state", () => {
    const transport = new RealtimeDocTransport();
    const fakeA = makeFakeConnection();
    const fakeB = makeFakeConnection();
    const sessionAB = new RealtimeDocSession({ vaultId: 1, noteId: 2 });
    const sessionC = new RealtimeDocSession({ vaultId: 1, noteId: 3 });
    transport.attachConnection(fakeA.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => sessionAB,
    });
    transport.attachConnection(fakeB.conn, {
      sessionKey: { vaultId: 1, noteId: 2 },
      resolveSession: () => sessionAB,
    });
    const fakeC = makeFakeConnection();
    transport.attachConnection(fakeC.conn, {
      sessionKey: { vaultId: 1, noteId: 3 },
      resolveSession: () => sessionC,
    });
    expect(transport.connectionCount({ vaultId: 1, noteId: 2 })).toBe(2);
    expect(transport.connectionCount({ vaultId: 1, noteId: 3 })).toBe(1);
    expect(transport.sessionCount()).toBe(2);
  });
});

describe("getRealtimeDocTransport — module-singleton", () => {
  it("returns the same instance on subsequent calls", () => {
    const a = getRealtimeDocTransport();
    const b = getRealtimeDocTransport();
    expect(a).toBe(b);
  });

  it("__resetRealtimeDocTransportForTests clears the singleton", () => {
    const a = getRealtimeDocTransport();
    __resetRealtimeDocTransportForTests();
    const b = getRealtimeDocTransport();
    expect(a).not.toBe(b);
  });
});

describe("source-scan boundary — realtime-doc-transport.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc-transport.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import credential-resolver", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });
});
