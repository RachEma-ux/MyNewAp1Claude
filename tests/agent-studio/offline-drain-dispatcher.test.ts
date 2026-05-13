/**
 * Offline drain dispatcher — V2 Phase OL-4.
 *
 * Covers:
 *   - register / get / list registry invariants
 *   - createOfflineDrainDispatcher routes by kind
 *   - dispatcher passes payload + entry to the impl
 *   - dispatcher throws OfflineDrainImplNotRegisteredError on unknown kind
 *   - `lookup` DI seam bypasses module-scoped registry
 *   - __resetOfflineDrainRegistryForTests clears
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY / neo4j-driver
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetOfflineDrainRegistryForTests,
  createOfflineDrainDispatcher,
  getOfflineDrainImpl,
  listRegisteredOfflineDrainKinds,
  OfflineDrainImplNotRegisteredError,
  registerOfflineDrainImpl,
  type OfflineDrainImpl,
} from "../../client/src/modules/agent-studio/services/offline-drain-dispatcher.js";
import type { OfflineQueueEntry } from "../../client/src/modules/agent-studio/services/offline-cache.js";

const ENTRY: OfflineQueueEntry = {
  id: "e1",
  kind: "vault.note.update",
  payload: { noteId: "n-42", body: "hi" },
  queuedAt: new Date("2026-05-13T00:00:00Z"),
  attempts: 0,
};

afterEach(() => {
  __resetOfflineDrainRegistryForTests();
});

describe("registry invariants", () => {
  it("get returns null when no impl is registered", () => {
    expect(getOfflineDrainImpl("vault.note.update")).toBeNull();
  });

  it("register makes the impl retrievable; list returns the kind", () => {
    const impl: OfflineDrainImpl = async () => {};
    registerOfflineDrainImpl({ kind: "vault.note.update", impl });
    expect(getOfflineDrainImpl("vault.note.update")).toBe(impl);
    expect(listRegisteredOfflineDrainKinds()).toEqual(["vault.note.update"]);
  });

  it("registering same kind twice overwrites; list still unique", () => {
    const a: OfflineDrainImpl = async () => {};
    const b: OfflineDrainImpl = async () => {};
    registerOfflineDrainImpl({ kind: "vault.note.create", impl: a });
    registerOfflineDrainImpl({ kind: "vault.note.create", impl: b });
    expect(getOfflineDrainImpl("vault.note.create")).toBe(b);
    expect(listRegisteredOfflineDrainKinds()).toEqual(["vault.note.create"]);
  });

  it("list returns kinds sorted (deterministic)", () => {
    registerOfflineDrainImpl({
      kind: "vault.note.update",
      impl: async () => {},
    });
    registerOfflineDrainImpl({
      kind: "vault.note.create",
      impl: async () => {},
    });
    registerOfflineDrainImpl({
      kind: "vault.note.delete",
      impl: async () => {},
    });
    expect(listRegisteredOfflineDrainKinds()).toEqual([
      "vault.note.create",
      "vault.note.delete",
      "vault.note.update",
    ]);
  });

  it("reset clears the registry", () => {
    registerOfflineDrainImpl({
      kind: "vault.note.update",
      impl: async () => {},
    });
    __resetOfflineDrainRegistryForTests();
    expect(listRegisteredOfflineDrainKinds()).toEqual([]);
    expect(getOfflineDrainImpl("vault.note.update")).toBeNull();
  });
});

describe("createOfflineDrainDispatcher — module-scoped registry", () => {
  it("routes to the registered impl and forwards payload + entry", async () => {
    const impl = vi.fn(async () => {});
    registerOfflineDrainImpl({ kind: "vault.note.update", impl });
    const dispatch = createOfflineDrainDispatcher();
    await dispatch(ENTRY);
    expect(impl).toHaveBeenCalledTimes(1);
    expect(impl).toHaveBeenCalledWith(ENTRY.payload, ENTRY);
  });

  it("throws OfflineDrainImplNotRegisteredError for unknown kind", async () => {
    const dispatch = createOfflineDrainDispatcher();
    await expect(dispatch(ENTRY)).rejects.toBeInstanceOf(
      OfflineDrainImplNotRegisteredError,
    );
  });

  it("error carries the missing kind", async () => {
    const dispatch = createOfflineDrainDispatcher();
    let caught: unknown;
    try {
      await dispatch(ENTRY);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OfflineDrainImplNotRegisteredError);
    expect((caught as OfflineDrainImplNotRegisteredError).kind).toBe(
      "vault.note.update",
    );
    expect((caught as OfflineDrainImplNotRegisteredError).code).toBe(
      "offline_drain_impl_not_registered",
    );
  });

  it("propagates impl errors (no silent swallow)", async () => {
    registerOfflineDrainImpl({
      kind: "vault.note.update",
      impl: async () => {
        throw new Error("network down");
      },
    });
    const dispatch = createOfflineDrainDispatcher();
    await expect(dispatch(ENTRY)).rejects.toThrow(/network down/);
  });

  it("multiple entries route to distinct impls", async () => {
    const updateImpl = vi.fn(async () => {});
    const createImpl = vi.fn(async () => {});
    registerOfflineDrainImpl({ kind: "vault.note.update", impl: updateImpl });
    registerOfflineDrainImpl({ kind: "vault.note.create", impl: createImpl });
    const dispatch = createOfflineDrainDispatcher();
    await dispatch(ENTRY);
    await dispatch({ ...ENTRY, id: "e2", kind: "vault.note.create" });
    expect(updateImpl).toHaveBeenCalledTimes(1);
    expect(createImpl).toHaveBeenCalledTimes(1);
  });
});

describe("createOfflineDrainDispatcher — lookup DI seam", () => {
  it("uses the injected lookup instead of the module registry", async () => {
    const fakeImpl = vi.fn(async () => {});
    const lookup = vi.fn((_kind: string) => fakeImpl);
    const dispatch = createOfflineDrainDispatcher({ lookup });
    await dispatch(ENTRY);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("vault.note.update");
    expect(fakeImpl).toHaveBeenCalledTimes(1);
  });

  it("DI seam null result still raises the dedicated error", async () => {
    const dispatch = createOfflineDrainDispatcher({ lookup: () => null });
    await expect(dispatch(ENTRY)).rejects.toBeInstanceOf(
      OfflineDrainImplNotRegisteredError,
    );
  });
});

describe("source-scan boundary — offline-drain-dispatcher.ts", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/services/offline-drain-dispatcher.ts",
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

  it("does NOT validate against OFFLINE_DENIED_OPERATION_KINDS (enqueue is the gate)", () => {
    expect(/OFFLINE_DENIED_OPERATION_KINDS/.test(code)).toBe(false);
  });

  it("exposes the test-reset seam under a __ prefix (source-scan visibility)", () => {
    expect(/__resetOfflineDrainRegistryForTests/.test(code)).toBe(true);
  });
});
