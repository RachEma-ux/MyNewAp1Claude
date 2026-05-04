/**
 * Phase 20 — per-intent receipt policy enforcement tests.
 *
 * Asserts that `openRouter.modelAccess.execute` and
 * `openRouter.modelAccess.stream`:
 *   - accept calls with `intent="agent-test"` WITHOUT a governance
 *     receipt
 *   - REFUSE calls with any other intent unless a
 *     governanceReceiptId is present on the sealed context
 *   - throw a stable error message identifying the action and intent
 *
 * The downstream `execute` / `stream` functions are mocked so the
 * test stays focused on the policy gate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./model-access", () => ({
  execute: vi.fn(async () => ({
    status: "ok",
    providerConnectionId: 42,
    modelRef: "gpt-4o-mini",
    latencyMs: 5,
  })),
  stream: vi.fn(async function* () {
    yield { delta: "ok", done: true };
  }),
  validateBinding: vi.fn(),
}));

import { openRouterManifest } from "./manifest";
import {
  __resetGatewayForTests,
  gatewayCall,
  registerPublicApi,
} from "../platform/modules/module-gateway";
import {
  __resetModuleRegistryForTests,
  getModuleRegistry,
} from "../platform/modules/registry";
import type { ModuleManifest } from "../platform/modules/types";

function bareManifest(key: string): ModuleManifest {
  return {
    key,
    name: key,
    version: "1.0.0",
    runtime: { mode: "shared" },
    database: { kind: "none" },
    health: () => ({ state: "ok", checkedAt: new Date().toISOString() }),
  };
}

beforeEach(async () => {
  __resetGatewayForTests();
  __resetModuleRegistryForTests();
  // openRouter manifest needs to be registered for boot's
  // registerPublicApi calls to find the module key. We register a
  // bare manifest with the same key.
  getModuleRegistry().register(bareManifest("openRouter"));
  getModuleRegistry().register(bareManifest("agentStudio"));
  // Run the manifest's boot() to wire the public APIs (with the
  // mocked model-access functions).
  await openRouterManifest.boot?.();
});

describe("openRouter.modelAccess.execute — per-intent receipt policy (Phase 20)", () => {
  it("allows intent=agent-test without a receipt", async () => {
    const r = (await gatewayCall({
      ctx: {
        sourceModule: "agentStudio",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.execute",
        workspaceId: 1,
        actorId: 1,
      },
      input: {
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
        intent: "agent-test",
        workspaceId: 1,
        actorId: 1,
      },
    })) as { status: string };
    expect(r.status).toBe("ok");
  });

  it("refuses intent=agent-run without a receipt", async () => {
    await expect(
      gatewayCall({
        ctx: {
          sourceModule: "agentStudio",
          targetModule: "openRouter",
          actionKey: "openRouter.modelAccess.execute",
          workspaceId: 1,
          actorId: 1,
        },
        input: {
          providerConnectionId: 42,
          modelRef: "gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
          intent: "agent-run",
          workspaceId: 1,
          actorId: 1,
        },
      }),
    ).rejects.toThrow(/requires a governance receipt/);
  });

  it("refuses intent=chat without a receipt", async () => {
    await expect(
      gatewayCall({
        ctx: {
          sourceModule: "agentStudio",
          targetModule: "openRouter",
          actionKey: "openRouter.modelAccess.execute",
          workspaceId: 1,
          actorId: 1,
        },
        input: {
          providerConnectionId: 42,
          modelRef: "gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
          intent: "chat",
          workspaceId: 1,
          actorId: 1,
        },
      }),
    ).rejects.toThrow(/openRouter\.modelAccess\.execute.*chat.*governance receipt/);
  });

  it("refuses intent=evaluation without a receipt", async () => {
    await expect(
      gatewayCall({
        ctx: {
          sourceModule: "agentStudio",
          targetModule: "openRouter",
          actionKey: "openRouter.modelAccess.execute",
          workspaceId: 1,
          actorId: 1,
        },
        input: {
          providerConnectionId: 42,
          modelRef: "gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
          intent: "evaluation",
          workspaceId: 1,
          actorId: 1,
        },
      }),
    ).rejects.toThrow(/governance receipt/);
  });

  it("allows intent=chat WITH a governance receipt", async () => {
    const r = (await gatewayCall({
      ctx: {
        sourceModule: "agentStudio",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.execute",
        workspaceId: 1,
        actorId: 1,
        governanceReceiptId: "rcpt-123",
      },
      input: {
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
        intent: "chat",
        workspaceId: 1,
        actorId: 1,
      },
    })) as { status: string };
    expect(r.status).toBe("ok");
  });
});

describe("openRouter.modelAccess.stream — per-intent receipt policy (Phase 20)", () => {
  it("allows intent=agent-test without a receipt", async () => {
    const r = (await gatewayCall({
      ctx: {
        sourceModule: "agentStudio",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.stream",
        workspaceId: 1,
        actorId: 1,
      },
      input: {
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
        intent: "agent-test",
        workspaceId: 1,
        actorId: 1,
      },
    })) as { status: string };
    expect(r.status).toBe("ok");
  });

  it("refuses intent=agent-run without a receipt", async () => {
    await expect(
      gatewayCall({
        ctx: {
          sourceModule: "agentStudio",
          targetModule: "openRouter",
          actionKey: "openRouter.modelAccess.stream",
          workspaceId: 1,
          actorId: 1,
        },
        input: {
          providerConnectionId: 42,
          modelRef: "gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
          intent: "agent-run",
          workspaceId: 1,
          actorId: 1,
        },
      }),
    ).rejects.toThrow(/openRouter\.modelAccess\.stream.*agent-run.*governance receipt/);
  });
});
