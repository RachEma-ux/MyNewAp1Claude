/**
 * Default offline drain impls — V2 Phase OL-5.
 *
 * Covers:
 *   - registerDefaultOfflineDrainImpls registers all 3 vault-note kinds
 *   - return value lists kinds in alphabetical order (deterministic)
 *   - each registered impl forwards payload to the right mutation
 *   - mutation errors propagate through the impl (no silent swallow)
 *   - idempotent re-registration overwrites prior closures
 *   - mutation return values are NOT propagated (impl resolves to void)
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY / neo4j-driver
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { registerDefaultOfflineDrainImpls } from "../../client/src/modules/agent-studio/services/offline-drain-defaults.js";
import {
  __resetOfflineDrainRegistryForTests,
  getOfflineDrainImpl,
  listRegisteredOfflineDrainKinds,
} from "../../client/src/modules/agent-studio/services/offline-drain-dispatcher.js";
import type { OfflineQueueEntry } from "../../client/src/modules/agent-studio/services/offline-cache.js";

const STUB_ENTRY: OfflineQueueEntry = {
  id: "x",
  kind: "vault.note.update",
  payload: {},
  queuedAt: new Date("2026-05-13T00:00:00Z"),
  attempts: 0,
};

afterEach(() => {
  __resetOfflineDrainRegistryForTests();
});

describe("registerDefaultOfflineDrainImpls — wire-up", () => {
  it("registers all three vault-note kinds", () => {
    registerDefaultOfflineDrainImpls({
      updateNote: vi.fn(async () => undefined),
      createNote: vi.fn(async () => undefined),
      deleteNote: vi.fn(async () => undefined),
    });
    expect(listRegisteredOfflineDrainKinds()).toEqual([
      "vault.note.create",
      "vault.note.delete",
      "vault.note.update",
    ]);
  });

  it("returns the kinds in deterministic order", () => {
    const out = registerDefaultOfflineDrainImpls({
      updateNote: async () => undefined,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
    });
    expect(out).toEqual([
      "vault.note.create",
      "vault.note.delete",
      "vault.note.update",
    ]);
  });

  it("routes vault.note.update entries to the update closure with the raw payload", async () => {
    const update = vi.fn(async () => undefined);
    registerDefaultOfflineDrainImpls({
      updateNote: update,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
    });
    const impl = getOfflineDrainImpl("vault.note.update");
    expect(impl).not.toBeNull();
    await impl!({ noteId: "n-1", body: "x" }, STUB_ENTRY);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ noteId: "n-1", body: "x" });
  });

  it("routes vault.note.create entries to the create closure", async () => {
    const create = vi.fn(async () => undefined);
    registerDefaultOfflineDrainImpls({
      updateNote: async () => undefined,
      createNote: create,
      deleteNote: async () => undefined,
    });
    const impl = getOfflineDrainImpl("vault.note.create");
    expect(impl).not.toBeNull();
    await impl!({ title: "new" }, { ...STUB_ENTRY, kind: "vault.note.create" });
    expect(create).toHaveBeenCalledWith({ title: "new" });
  });

  it("routes vault.note.delete entries to the delete closure", async () => {
    const del = vi.fn(async () => undefined);
    registerDefaultOfflineDrainImpls({
      updateNote: async () => undefined,
      createNote: async () => undefined,
      deleteNote: del,
    });
    const impl = getOfflineDrainImpl("vault.note.delete");
    expect(impl).not.toBeNull();
    await impl!(
      { noteId: "n-99" },
      { ...STUB_ENTRY, kind: "vault.note.delete" },
    );
    expect(del).toHaveBeenCalledWith({ noteId: "n-99" });
  });

  it("propagates mutation errors (no silent swallow)", async () => {
    registerDefaultOfflineDrainImpls({
      updateNote: async () => {
        throw new Error("network down");
      },
      createNote: async () => undefined,
      deleteNote: async () => undefined,
    });
    const impl = getOfflineDrainImpl("vault.note.update");
    await expect(impl!({}, STUB_ENTRY)).rejects.toThrow(/network down/);
  });

  it("discards the mutation return value (impl resolves to void)", async () => {
    registerDefaultOfflineDrainImpls({
      updateNote: async () => ({ id: 99, ok: true }),
      createNote: async () => undefined,
      deleteNote: async () => undefined,
    });
    const impl = getOfflineDrainImpl("vault.note.update");
    const result = await impl!({}, STUB_ENTRY);
    expect(result).toBeUndefined();
  });

  it("idempotent re-registration overwrites prior closures", async () => {
    const firstUpdate = vi.fn(async () => undefined);
    const secondUpdate = vi.fn(async () => undefined);
    registerDefaultOfflineDrainImpls({
      updateNote: firstUpdate,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
    });
    registerDefaultOfflineDrainImpls({
      updateNote: secondUpdate,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
    });
    const impl = getOfflineDrainImpl("vault.note.update");
    await impl!({}, STUB_ENTRY);
    expect(firstUpdate).not.toHaveBeenCalled();
    expect(secondUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("source-scan boundary — offline-drain-defaults.ts", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/services/offline-drain-defaults.ts",
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

  it("does not depend on the tRPC AppRouter type", () => {
    expect(/AppRouter|@\/lib\/trpc/.test(code)).toBe(false);
  });
});
