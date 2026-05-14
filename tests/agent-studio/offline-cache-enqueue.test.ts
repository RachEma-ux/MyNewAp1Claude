/**
 * Offline-cache enqueue helper — V2 Phase OL-8 (PR-V1-32).
 *
 * Covers:
 *   - Happy path: enqueueOfflineVaultMutation routes through the
 *     module-singleton queue and returns the staged entry
 *   - Caller-supplied id is preserved
 *   - generateId seam is used when no id is supplied
 *   - Default id generation uses crypto.randomUUID
 *   - Deny-list rejection: kinds on OFFLINE_DENIED_OPERATION_KINDS
 *     throw OfflineMutationDeniedError (re-export reachable)
 *   - Each of the 3 OL-1 allowlist kinds enqueues cleanly
 *   - Source-scan boundary: helper file stays hard-rule clean
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enqueueOfflineVaultMutation,
  OfflineMutationDeniedError,
} from "../../client/src/modules/agent-studio/services/offline-cache-enqueue.js";
import {
  __resetOfflineQueueInstanceForTests,
  getOfflineQueueInstance,
} from "../../client/src/modules/agent-studio/services/offline-cache-bootstrap.js";
import {
  OFFLINE_OPERATION_KINDS,
  OfflineQueue,
} from "../../client/src/modules/agent-studio/services/offline-cache.js";

afterEach(() => {
  __resetOfflineQueueInstanceForTests();
});

describe("enqueueOfflineVaultMutation — happy path", () => {
  it("stages an entry on the module-singleton queue and returns it", () => {
    const queue = new OfflineQueue();
    const entry = enqueueOfflineVaultMutation({
      queue,
      kind: "vault.note.update",
      payload: { noteId: 7, content: "edited" },
      id: "uuid-1",
    });
    expect(entry.id).toBe("uuid-1");
    expect(entry.kind).toBe("vault.note.update");
    expect(entry.payload).toEqual({ noteId: 7, content: "edited" });
    expect(queue.size()).toBe(1);
    expect(queue.list()[0]).toBe(entry);
  });

  it("uses the same module-singleton instance across calls", () => {
    const queue = new OfflineQueue();
    enqueueOfflineVaultMutation({
      queue,
      kind: "vault.note.create",
      payload: { vaultId: 1, title: "a" },
      id: "uuid-a",
    });
    enqueueOfflineVaultMutation({
      kind: "vault.note.create",
      payload: { vaultId: 1, title: "b" },
      id: "uuid-b",
    });
    expect(queue.size()).toBe(2);
    expect(getOfflineQueueInstance()).toBe(queue);
  });
});

describe("enqueueOfflineVaultMutation — id generation", () => {
  it("uses the caller-supplied id verbatim when provided", () => {
    const queue = new OfflineQueue();
    const generate = vi.fn(() => "from-generator");
    const entry = enqueueOfflineVaultMutation({
      queue,
      kind: "vault.note.delete",
      payload: { noteId: 3 },
      id: "caller-id",
      generateId: generate,
    });
    expect(entry.id).toBe("caller-id");
    expect(generate).not.toHaveBeenCalled();
  });

  it("calls generateId once when no id is supplied", () => {
    const queue = new OfflineQueue();
    const generate = vi.fn(() => "from-generator");
    const entry = enqueueOfflineVaultMutation({
      queue,
      kind: "vault.note.delete",
      payload: { noteId: 3 },
      generateId: generate,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(entry.id).toBe("from-generator");
  });

  it("default generator falls through to crypto.randomUUID", () => {
    const queue = new OfflineQueue();
    const entry = enqueueOfflineVaultMutation({
      queue,
      kind: "vault.note.update",
      payload: { noteId: 1 },
    });
    expect(typeof entry.id).toBe("string");
    // UUIDv4 length is 36 chars with dashes.
    expect(entry.id.length).toBe(36);
    expect(/^[0-9a-f-]{36}$/i.test(entry.id)).toBe(true);
  });
});

describe("enqueueOfflineVaultMutation — deny-list rejection", () => {
  it("throws OfflineMutationDeniedError on a deny-listed kind", () => {
    const queue = new OfflineQueue();
    expect(() =>
      enqueueOfflineVaultMutation({
        queue,
        // Cast: deliberately violate the union to exercise the
        // runtime gate that protects against caller error.
        kind: "graph.node.create" as unknown as "vault.note.update",
        payload: {},
        id: "uuid-deny",
      }),
    ).toThrow(OfflineMutationDeniedError);
    expect(queue.size()).toBe(0);
  });

  it("throws on unknown kinds (not in allowlist + not in deny list)", () => {
    const queue = new OfflineQueue();
    expect(() =>
      enqueueOfflineVaultMutation({
        queue,
        kind: "vault.note.archive" as unknown as "vault.note.update",
        payload: {},
        id: "uuid-unknown",
      }),
    ).toThrow(OfflineMutationDeniedError);
  });
});

describe("enqueueOfflineVaultMutation — allowlist kinds", () => {
  for (const kind of OFFLINE_OPERATION_KINDS) {
    it(`enqueues kind=${kind} cleanly`, () => {
      const queue = new OfflineQueue();
      const entry = enqueueOfflineVaultMutation({
        queue,
        kind,
        payload: { kindCheck: kind },
        id: `uuid-${kind}`,
      });
      expect(entry.kind).toBe(kind);
      expect(entry.payload).toEqual({ kindCheck: kind });
    });
  }
});

describe("source-scan boundary", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/services/offline-cache-enqueue.ts",
  );
  const src = readFileSync(file, "utf8");

  it("does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(src)).toBe(false);
  });

  it("does not import dispatchMcpToolCall", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        src,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(src)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(src)).toBe(false);
  });

  it("does not import AppRouter (stays tRPC-type-free)", () => {
    expect(
      /import[^;]*\bAppRouter\b[^;]*from\s+["']/.test(src),
    ).toBe(false);
  });
});
