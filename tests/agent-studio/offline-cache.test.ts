// Offline-cache + queue tests — V2 Phase OL-1 first slice.
//
// Covers:
//   - OFFLINE_OPERATION_KINDS allowlist closure
//   - OFFLINE_DENIED_OPERATION_KINDS deny-list closure
//   - isOperationOfflineQueueable: branch matrix
//   - assertOfflineQueueable: throws on deny + unknown kinds
//   - OfflineQueue: enqueue / drain (success / failure attempt
//     bookkeeping) / clear / size / list
//   - Source-scan: the offline-cache file must declare the
//     deny-list AND the load-bearing graph/agent kinds explicitly

import { describe, expect, it } from "vitest";

import {
  OFFLINE_DENIED_OPERATION_KINDS,
  OFFLINE_OPERATION_KINDS,
  OfflineMutationDeniedError,
  OfflineQueue,
  assertOfflineQueueable,
  isOfflineOperationKind,
  isOperationOfflineQueueable,
} from "../../client/src/modules/agent-studio/services/offline-cache.js";

describe("offline operation taxonomy", () => {
  it("OFFLINE_OPERATION_KINDS is the closed 3-value allowlist", () => {
    expect(OFFLINE_OPERATION_KINDS).toEqual([
      "vault.note.update",
      "vault.note.create",
      "vault.note.delete",
    ]);
  });

  it("OFFLINE_DENIED_OPERATION_KINDS lists the load-bearing graph + agent ops", () => {
    for (const k of [
      "graph.node.create",
      "graph.node.update",
      "graph.edge.create",
      "graph.edge.delete",
      "graph.change.proposal.create",
      "graph.change.proposal.approve",
      "promotion.create",
      "promotion.approve",
      "graphAgent.run",
      "graphRag.query",
      "openrouter.execute",
      "mcp.dispatch",
    ]) {
      expect(
        (OFFLINE_DENIED_OPERATION_KINDS as readonly string[]).includes(k),
        `${k} must be in the deny-list`,
      ).toBe(true);
    }
  });

  it("isOfflineOperationKind narrows correctly", () => {
    expect(isOfflineOperationKind("vault.note.update")).toBe(true);
    expect(isOfflineOperationKind("graph.node.create")).toBe(false);
    expect(isOfflineOperationKind("")).toBe(false);
    expect(isOfflineOperationKind(123)).toBe(false);
  });
});

describe("isOperationOfflineQueueable / assertOfflineQueueable", () => {
  it("allowlist entries are queueable", () => {
    expect(isOperationOfflineQueueable("vault.note.update")).toBe(true);
    expect(() =>
      assertOfflineQueueable("vault.note.update"),
    ).not.toThrow();
  });

  it("deny-list entries are NOT queueable + assert throws", () => {
    expect(isOperationOfflineQueueable("graph.node.create")).toBe(false);
    expect(() => assertOfflineQueueable("graph.node.create")).toThrow(
      OfflineMutationDeniedError,
    );
    expect(() => assertOfflineQueueable("openrouter.execute")).toThrow(
      OfflineMutationDeniedError,
    );
    expect(() => assertOfflineQueueable("mcp.dispatch")).toThrow(
      OfflineMutationDeniedError,
    );
  });

  it("unknown kinds (neither allow nor deny) are NOT queueable", () => {
    expect(isOperationOfflineQueueable("workflow.run")).toBe(false);
    expect(() => assertOfflineQueueable("workflow.run")).toThrow(
      OfflineMutationDeniedError,
    );
  });

  it("OfflineMutationDeniedError carries the attempted kind", () => {
    try {
      assertOfflineQueueable("graph.node.create");
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OfflineMutationDeniedError);
      const e = err as OfflineMutationDeniedError;
      expect(e.attemptedKind).toBe("graph.node.create");
      expect(e.message).toMatch(/Reconnect/);
    }
  });
});

describe("OfflineQueue", () => {
  it("enqueue + size + list", () => {
    const q = new OfflineQueue();
    expect(q.size()).toBe(0);
    q.enqueue({
      id: "1",
      kind: "vault.note.update",
      payload: { noteId: 1, content: "hi" },
    });
    expect(q.size()).toBe(1);
    expect(q.list()[0].kind).toBe("vault.note.update");
  });

  it("enqueue refuses denied kinds (load-bearing rule)", () => {
    const q = new OfflineQueue();
    expect(() =>
      q.enqueue({ id: "1", kind: "graph.node.create", payload: {} }),
    ).toThrow(OfflineMutationDeniedError);
    expect(q.size()).toBe(0);
  });

  it("drain calls drainOne for each entry; removes on success", async () => {
    const q = new OfflineQueue();
    q.enqueue({ id: "1", kind: "vault.note.update", payload: { a: 1 } });
    q.enqueue({ id: "2", kind: "vault.note.update", payload: { a: 2 } });
    const drained = await q.drain(async () => {
      // always success
    });
    expect(drained).toBe(2);
    expect(q.size()).toBe(0);
  });

  it("drain retains failed entries with attempts++ and lastError", async () => {
    const q = new OfflineQueue();
    q.enqueue({ id: "1", kind: "vault.note.update", payload: {} });
    q.enqueue({ id: "2", kind: "vault.note.update", payload: {} });
    let calls = 0;
    const drained = await q.drain(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient network");
      // entry 2 succeeds
    });
    expect(drained).toBe(1);
    expect(q.size()).toBe(1);
    const remaining = q.list()[0];
    expect(remaining.id).toBe("1");
    expect(remaining.attempts).toBe(1);
    expect(remaining.lastError).toMatch(/transient/);
  });

  it("clear empties the queue", () => {
    const q = new OfflineQueue();
    q.enqueue({ id: "1", kind: "vault.note.update", payload: {} });
    q.clear();
    expect(q.size()).toBe(0);
  });
});

describe("offline-cache module — source-scan invariants", () => {
  it("explicitly enumerates the graph + agent + provider deny entries", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "client/src/modules/agent-studio/services/offline-cache.ts",
      ),
      "utf8",
    );
    // Refactor anchor — these literals MUST appear in the source
    // so the load-bearing security rule survives doc rewrites.
    for (const literal of [
      "graph.node.create",
      "graph.change.proposal.approve",
      "promotion.approve",
      "graphAgent.run",
      "graphRag.query",
      "openrouter.execute",
      "mcp.dispatch",
    ]) {
      expect(
        src.includes(`"${literal}"`),
        `offline-cache.ts must enumerate "${literal}" in the deny-list`,
      ).toBe(true);
    }
  });

  it("offline ADR exists at the canonical path", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const adr = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "docs/architecture/agent-studio-offline-local-first.md",
      ),
      "utf8",
    );
    expect(adr).toMatch(/Offline/);
    expect(adr).toMatch(/source of truth/i);
  });
});
