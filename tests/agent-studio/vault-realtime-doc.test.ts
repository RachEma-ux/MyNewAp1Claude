/**
 * Vault — realtime document service tests (V2 Phase CRDT-β).
 *
 * Covers the contract surface that the future Yjs adapter +
 * WebSocket transport (CRDT-γ) consume:
 *   - InMemoryRealtimeDocBackend round-trip (set/get/snapshot/apply)
 *   - pendingUpdateCount semantics + reset
 *   - malformed updates are tolerated (ignored, no throw)
 *   - RealtimeDocSession attach/detach client counter
 *   - session.handleUpdate + session.snapshot wiring
 *   - getCanonicalContentForSave extracts the text key
 *   - getOrCreateRealtimeDocSession is per-(vaultId,noteId) idempotent
 *   - dropRealtimeDocSession removes; subsequent get creates a new
 *   - listLiveRealtimeDocSessions reflects the registry
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY / neo4j-driver / yjs (yjs adapter lands in γ).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  InMemoryRealtimeDocBackend,
  REALTIME_DOC_TEXT_KEY,
  RealtimeDocSession,
  __resetRealtimeDocRegistryForTests,
  dropRealtimeDocSession,
  getCanonicalContentForSave,
  getOrCreateRealtimeDocSession,
  listLiveRealtimeDocSessions,
} from "../../server/agent-studio/services/vault/realtime-doc.js";

beforeEach(() => {
  __resetRealtimeDocRegistryForTests();
});
afterEach(() => {
  __resetRealtimeDocRegistryForTests();
});

describe("InMemoryRealtimeDocBackend", () => {
  it("getText returns empty string before any write", () => {
    const b = new InMemoryRealtimeDocBackend();
    expect(b.getText()).toBe("");
  });

  it("setText / getText round trip on the default key", () => {
    const b = new InMemoryRealtimeDocBackend();
    b.setText("hello world");
    expect(b.getText()).toBe("hello world");
    expect(b.getText(REALTIME_DOC_TEXT_KEY)).toBe("hello world");
  });

  it("snapshot encodes JSON; applyUpdate decodes + merges", () => {
    const a = new InMemoryRealtimeDocBackend();
    a.setText("from A");
    const snapshot = a.encodeSnapshot();
    const b = new InMemoryRealtimeDocBackend();
    b.applyUpdate(snapshot);
    expect(b.getText()).toBe("from A");
  });

  it("applyUpdate increments pendingUpdateCount; resetPending zeroes it", () => {
    const b = new InMemoryRealtimeDocBackend();
    b.applyUpdate(new TextEncoder().encode(JSON.stringify({ content: "x" })));
    b.applyUpdate(new TextEncoder().encode(JSON.stringify({ content: "y" })));
    expect(b.pendingUpdateCount()).toBe(2);
    b.resetPending();
    expect(b.pendingUpdateCount()).toBe(0);
  });

  it("setText also increments pendingUpdateCount (local change)", () => {
    const b = new InMemoryRealtimeDocBackend();
    b.setText("a");
    b.setText("b");
    expect(b.pendingUpdateCount()).toBe(2);
  });

  it("malformed update is ignored (no throw)", () => {
    const b = new InMemoryRealtimeDocBackend();
    expect(() =>
      b.applyUpdate(new TextEncoder().encode("not-json")),
    ).not.toThrow();
    expect(b.pendingUpdateCount()).toBe(0);
  });
});

describe("RealtimeDocSession", () => {
  it("attach/detach client counter", () => {
    const s = new RealtimeDocSession({ vaultId: 1, noteId: 2 });
    expect(s.clientCount()).toBe(0);
    expect(s.attachClient()).toBe(1);
    expect(s.attachClient()).toBe(2);
    expect(s.detachClient()).toBe(1);
    expect(s.detachClient()).toBe(0);
    // Detach below zero clamps.
    expect(s.detachClient()).toBe(0);
  });

  it("handleUpdate forwards to the backend; snapshot returns backend snapshot", () => {
    const s = new RealtimeDocSession({ vaultId: 1, noteId: 2 });
    s.handleUpdate(
      new TextEncoder().encode(JSON.stringify({ content: "hello" })),
    );
    expect(s.backend.getText()).toBe("hello");
    const snap = s.snapshot();
    expect(snap.byteLength).toBeGreaterThan(0);
  });

  it("custom factory overrides the backend", () => {
    let called = 0;
    const custom = new InMemoryRealtimeDocBackend();
    const s = new RealtimeDocSession({ vaultId: 1, noteId: 2 }, () => {
      called += 1;
      return custom;
    });
    expect(called).toBe(1);
    expect(s.backend).toBe(custom);
  });
});

describe("getCanonicalContentForSave", () => {
  it("returns the text key from the backend", () => {
    const s = new RealtimeDocSession({ vaultId: 1, noteId: 2 });
    s.backend.setText("save me");
    expect(getCanonicalContentForSave(s)).toBe("save me");
  });
});

describe("session registry — getOrCreate / drop / list", () => {
  it("getOrCreateRealtimeDocSession is idempotent per (vaultId,noteId)", () => {
    const a = getOrCreateRealtimeDocSession({ vaultId: 1, noteId: 2 });
    const b = getOrCreateRealtimeDocSession({ vaultId: 1, noteId: 2 });
    expect(a).toBe(b);
  });

  it("different (vaultId,noteId) tuples get distinct sessions", () => {
    const a = getOrCreateRealtimeDocSession({ vaultId: 1, noteId: 2 });
    const b = getOrCreateRealtimeDocSession({ vaultId: 1, noteId: 3 });
    expect(a).not.toBe(b);
  });

  it("drop removes the session; next getOrCreate makes a fresh one", () => {
    const a = getOrCreateRealtimeDocSession({ vaultId: 1, noteId: 2 });
    a.backend.setText("stale");
    expect(dropRealtimeDocSession({ vaultId: 1, noteId: 2 })).toBe(true);
    const b = getOrCreateRealtimeDocSession({ vaultId: 1, noteId: 2 });
    expect(b).not.toBe(a);
    expect(b.backend.getText()).toBe("");
  });

  it("listLiveRealtimeDocSessions reflects the live registry", () => {
    getOrCreateRealtimeDocSession({ vaultId: 1, noteId: 100 });
    getOrCreateRealtimeDocSession({ vaultId: 1, noteId: 101 });
    getOrCreateRealtimeDocSession({ vaultId: 2, noteId: 200 });
    const live = listLiveRealtimeDocSessions();
    expect(live.length).toBe(3);
    const keys = live
      .map((k) => `${k.vaultId}:${k.noteId}`)
      .sort();
    expect(keys).toEqual(["1:100", "1:101", "2:200"]);
  });
});

describe("source-scan boundary — realtime-doc.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import credential-resolver (Plan v3 D2)", () => {
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

  it("does not import neo4j-driver (vault service is Postgres-only)", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("does not import yjs (Yjs adapter lands in CRDT-γ)", () => {
    expect(/from\s+["']yjs["']/.test(code)).toBe(false);
  });
});
