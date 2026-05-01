/**
 * Gateway Wiring — round-trip tests
 *
 * Proves the Module Gateway round-trip:
 *   - register a public API
 *   - call it through gatewayCall()
 *   - unknown action fails clearly
 *   - receipt-required action fails without a receipt
 *   - receipt-required action succeeds with a receipt
 *   - timeouts surface as errors
 *   - duplicate registration is rejected
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetGatewayForTests,
  gatewayCall,
  listRegisteredActions,
  registerPublicApi,
} from "./module-gateway";
import {
  __resetModuleRegistryForTests,
  getModuleRegistry,
} from "./registry";
import type { ModuleManifest } from "./types";

const baseDb: ModuleManifest["database"] = { kind: "none" };

function makeManifest(key: string): ModuleManifest {
  return {
    key,
    name: key,
    version: "1.0.0",
    runtime: { mode: "shared" },
    database: baseDb,
    health: () => ({
      state: "ok",
      checkedAt: new Date().toISOString(),
    }),
  };
}

beforeEach(() => {
  __resetGatewayForTests();
  __resetModuleRegistryForTests();
  getModuleRegistry().register(makeManifest("alpha"));
  getModuleRegistry().register(makeManifest("beta"));
});

describe("Module Gateway — round-trip", () => {
  it("registers and dispatches a public API call", async () => {
    registerPublicApi({
      module: "alpha",
      action: "alpha.echo",
      handler: async (input) => ({ echoed: input }),
    });

    const result = await gatewayCall<{ msg: string }, { echoed: { msg: string } }>({
      ctx: {
        sourceModule: "beta",
        targetModule: "alpha",
        actionKey: "alpha.echo",
        workspaceId: 1,
        actorId: 42,
      },
      input: { msg: "hello" },
    });

    expect(result).toEqual({ echoed: { msg: "hello" } });
    expect(listRegisteredActions().some((a) => a.action === "alpha.echo")).toBe(true);
  });

  it("fails clearly for an unknown action", async () => {
    await expect(
      gatewayCall({
        ctx: {
          sourceModule: "beta",
          targetModule: "alpha",
          actionKey: "alpha.does-not-exist",
          workspaceId: 1,
          actorId: 42,
        },
        input: {},
      }),
    ).rejects.toThrow(/Unknown action/);
  });

  it("fails when target module is not registered", async () => {
    registerPublicApi({
      module: "ghost",
      action: "ghost.x",
      handler: async () => ({}),
    });
    await expect(
      gatewayCall({
        ctx: {
          sourceModule: "beta",
          targetModule: "ghost",
          actionKey: "ghost.x",
          workspaceId: 1,
          actorId: 42,
        },
        input: {},
      }),
    ).rejects.toThrow(/not registered/);
  });

  it("rejects receipt-required actions called without a receipt", async () => {
    registerPublicApi({
      module: "alpha",
      action: "alpha.publish",
      handler: async () => ({ ok: true }),
      descriptor: {
        key: "alpha.publish",
        description: "Publish a thing",
        risk: "high",
        receiptRequired: true,
      },
    });
    await expect(
      gatewayCall({
        ctx: {
          sourceModule: "beta",
          targetModule: "alpha",
          actionKey: "alpha.publish",
          workspaceId: 1,
          actorId: 42,
        },
        input: {},
      }),
    ).rejects.toThrow(/governance receipt/);
  });

  it("accepts receipt-required actions when a receipt is supplied", async () => {
    registerPublicApi({
      module: "alpha",
      action: "alpha.publish",
      handler: async () => ({ published: true }),
      descriptor: {
        key: "alpha.publish",
        description: "Publish a thing",
        risk: "high",
        receiptRequired: true,
      },
    });
    const r = await gatewayCall({
      ctx: {
        sourceModule: "beta",
        targetModule: "alpha",
        actionKey: "alpha.publish",
        workspaceId: 1,
        actorId: 42,
        governanceReceiptId: "receipt-123",
      },
      input: {},
    });
    expect(r).toEqual({ published: true });
  });

  it("surfaces timeouts as errors", async () => {
    registerPublicApi({
      module: "alpha",
      action: "alpha.slow",
      handler: () => new Promise((resolve) => setTimeout(resolve, 200)),
    });
    await expect(
      gatewayCall({
        ctx: {
          sourceModule: "beta",
          targetModule: "alpha",
          actionKey: "alpha.slow",
          workspaceId: 1,
          actorId: 42,
        },
        input: {},
        options: { timeoutMs: 25 },
      }),
    ).rejects.toThrow(/timed out/);
  });

  it("rejects duplicate registration when descriptors differ", () => {
    registerPublicApi({
      module: "alpha",
      action: "alpha.x",
      handler: async () => ({}),
      descriptor: { key: "alpha.x", description: "first" },
    });
    expect(() =>
      registerPublicApi({
        module: "alpha",
        action: "alpha.x",
        handler: async () => ({}),
        descriptor: { key: "alpha.y", description: "second" },
      }),
    ).toThrow(/Duplicate registration/);
  });
});
