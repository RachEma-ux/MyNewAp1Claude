/**
 * Platform Modules — unit tests for registry, runtime manager, gateway.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetModuleRegistryForTests,
  getModuleRegistry,
} from "./registry";
import {
  __resetRuntimeManagerForTests,
  getRuntimeManager,
} from "./runtime-manager";
import {
  __resetGatewayForTests,
  registerPublicApi,
  gatewayCall,
  listRegisteredActions,
} from "./module-gateway";
import type { ModuleManifest } from "./types";

const baseDb: ModuleManifest["database"] = { kind: "none" } as any;

function makeManifest(overrides: Partial<ModuleManifest>): ModuleManifest {
  return {
    key: overrides.key ?? "test",
    name: overrides.name ?? "Test",
    version: "1.0.0",
    runtime: overrides.runtime ?? { mode: "shared" },
    database: overrides.database ?? baseDb,
    ...overrides,
  } as ModuleManifest;
}

describe("ModuleRegistry", () => {
  beforeEach(() => {
    __resetModuleRegistryForTests();
  });

  it("registers and retrieves manifests", () => {
    const reg = getModuleRegistry();
    reg.register(makeManifest({ key: "alpha" }));
    expect(reg.get("alpha")?.name).toBe("Test");
    expect(reg.list()).toHaveLength(1);
  });

  it("rejects duplicate keys with different versions", () => {
    const reg = getModuleRegistry();
    reg.register(makeManifest({ key: "alpha" }));
    expect(() =>
      reg.register({ ...makeManifest({ key: "alpha" }), version: "2.0.0" }),
    ).toThrow();
  });

  it("topologically orders by dependsOn", () => {
    const reg = getModuleRegistry();
    reg.register(makeManifest({ key: "a", runtime: { mode: "shared", dependsOn: ["b"] } }));
    reg.register(makeManifest({ key: "b", runtime: { mode: "shared", dependsOn: ["c"] } }));
    reg.register(makeManifest({ key: "c", runtime: { mode: "shared" } }));
    const order = reg.resolveBootOrder().map((m) => m.key);
    expect(order).toEqual(["c", "b", "a"]);
  });

  it("detects circular dependencies", () => {
    const reg = getModuleRegistry();
    reg.register(makeManifest({ key: "a", runtime: { mode: "shared", dependsOn: ["b"] } }));
    reg.register(makeManifest({ key: "b", runtime: { mode: "shared", dependsOn: ["a"] } }));
    expect(() => reg.resolveBootOrder()).toThrow(/Circular/);
  });

  it("respects 'enabled' flag", () => {
    const reg = getModuleRegistry();
    reg.register(makeManifest({ key: "a", enabled: false }));
    reg.register(makeManifest({ key: "b" }));
    expect(reg.listEnabled().map((m) => m.key)).toEqual(["b"]);
  });
});

describe("RuntimeManager", () => {
  beforeEach(() => {
    __resetModuleRegistryForTests();
    __resetRuntimeManagerForTests();
  });

  it("boots optional modules and marks failed ones as degraded", async () => {
    const reg = getModuleRegistry();
    let bootedA = false;
    reg.register(
      makeManifest({
        key: "a",
        boot: async () => {
          bootedA = true;
        },
      }),
    );
    reg.register(
      makeManifest({
        key: "b",
        boot: async () => {
          throw new Error("boom");
        },
      }),
    );
    const rt = getRuntimeManager({ logger: () => {} });
    await rt.boot();
    expect(bootedA).toBe(true);
    expect(reg.state("a")?.state).toBe("running");
    expect(reg.state("b")?.state).toBe("degraded");
  });

  it("required module failure throws", async () => {
    const reg = getModuleRegistry();
    reg.register(
      makeManifest({
        key: "a",
        runtime: { mode: "shared", required: true },
        boot: async () => {
          throw new Error("boom");
        },
      }),
    );
    const rt = getRuntimeManager({ logger: () => {} });
    await expect(rt.boot()).rejects.toThrow();
  });
});

describe("ModuleGateway", () => {
  beforeEach(() => {
    __resetModuleRegistryForTests();
    __resetGatewayForTests();
    const reg = getModuleRegistry();
    reg.register(makeManifest({ key: "alpha" }));
  });

  it("dispatches to a registered handler", async () => {
    registerPublicApi({
      module: "alpha",
      action: "ping",
      handler: async (input) => ({ pong: input }),
    });
    const result = await gatewayCall<{ msg: string }, { pong: { msg: string } }>({
      ctx: { targetModule: "alpha", actionKey: "ping" },
      input: { msg: "hi" },
    });
    expect(result.pong.msg).toBe("hi");
  });

  it("requires a governance receipt for sensitive actions", async () => {
    registerPublicApi({
      module: "alpha",
      action: "publish",
      handler: () => ({ ok: true }),
      descriptor: {
        key: "alpha.publish",
        description: "publish",
        risk: "high",
        receiptRequired: true,
      },
    });
    await expect(
      gatewayCall({ ctx: { targetModule: "alpha", actionKey: "publish" }, input: {} }),
    ).rejects.toThrow(/governance receipt/);
    await expect(
      gatewayCall({
        ctx: { targetModule: "alpha", actionKey: "publish", governanceReceiptId: "rec-1" },
        input: {},
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("times out long-running calls", async () => {
    registerPublicApi({
      module: "alpha",
      action: "slow",
      handler: () => new Promise((resolve) => setTimeout(resolve, 200)),
    });
    await expect(
      gatewayCall({
        ctx: { targetModule: "alpha", actionKey: "slow" },
        input: {},
        options: { timeoutMs: 50 },
      }),
    ).rejects.toThrow(/timed out/);
  });

  it("lists registered actions", () => {
    registerPublicApi({ module: "alpha", action: "x", handler: () => 1 });
    expect(listRegisteredActions()).toContainEqual({ module: "alpha", action: "x" });
  });
});
