/**
 * Direction B follow-up — `catalogImport.reconcileAgentStudioSync` tRPC
 * procedure tests.
 *
 * Verifies the procedure correctly forwards to `gatewayCall` with the
 * right action key, governance receipt, actor, and dryRun semantics.
 * The Phase 41 service-level behavior is covered by
 * server/agent-studio/services/export-catalog.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const gatewayCallMock = vi.fn();
vi.mock("../platform/modules/module-gateway", () => ({
  gatewayCall: (args: any) => gatewayCallMock(args),
  // Other exports unused by this procedure but required so other modules
  // that import the gateway during appRouter construction still work.
  registerPublicApi: () => {},
  listRegisteredActions: () => [],
}));

import { appRouter } from "../routers";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 42, role: "admin", openId: "test", name: "Test" } as any,
    session: null,
  } as any).catalogImport;
}

const SAMPLE_RESULT = {
  scanned: 3,
  inSync: 2,
  drift: 1,
  repaired: 0,
  dryRun: true,
  items: [
    {
      agentId: 11,
      catalogEntryId: 101,
      driftCase: "in_sync",
      latestSyncEventType: "registered",
      catalogStatus: "draft",
      repaired: false,
    },
    {
      agentId: 12,
      catalogEntryId: 102,
      driftCase: "in_sync",
      latestSyncEventType: "published",
      catalogStatus: "published",
      repaired: false,
    },
    {
      agentId: 13,
      catalogEntryId: 103,
      driftCase: "missing_published",
      latestSyncEventType: "registered",
      catalogStatus: "published",
      repaired: false,
    },
  ],
};

describe("catalogImport.reconcileAgentStudioSync — Direction B follow-up", () => {
  beforeEach(() => {
    gatewayCallMock.mockReset();
    gatewayCallMock.mockResolvedValue(SAMPLE_RESULT);
  });

  it("dry-run is the default and forwards correctly to the gateway", async () => {
    const caller = makeCaller();
    const r = await caller.reconcileAgentStudioSync({});

    expect(r).toEqual(SAMPLE_RESULT);
    expect(gatewayCallMock).toHaveBeenCalledTimes(1);
    const arg = gatewayCallMock.mock.calls[0][0];
    expect(arg.ctx.actionKey).toBe("agentStudio.exportCatalog.reconcileSync");
    expect(arg.ctx.sourceModule).toBe("aiTypes");
    expect(arg.ctx.targetModule).toBe("agentStudio");
    expect(arg.ctx.actorId).toBe(42);
    expect(arg.ctx.governanceReceiptId).toMatch(/^aitypes-reconcile-42-\d+$/);
    expect(arg.input).toEqual({
      workspaceId: undefined,
      reconciledBy: 42,
      dryRun: true,
    });
  });

  it("explicit dryRun=false flows through to the input payload", async () => {
    gatewayCallMock.mockResolvedValue({ ...SAMPLE_RESULT, dryRun: false, repaired: 1 });

    const caller = makeCaller();
    const r = await caller.reconcileAgentStudioSync({ dryRun: false });

    expect(r.dryRun).toBe(false);
    expect(gatewayCallMock.mock.calls[0][0].input.dryRun).toBe(false);
  });

  it("forwards workspaceId when provided", async () => {
    const caller = makeCaller();
    await caller.reconcileAgentStudioSync({ workspaceId: 7, dryRun: true });

    expect(gatewayCallMock.mock.calls[0][0].input.workspaceId).toBe(7);
  });

  it("undefined input still defaults to dry-run", async () => {
    const caller = makeCaller();
    await caller.reconcileAgentStudioSync(undefined);

    expect(gatewayCallMock.mock.calls[0][0].input.dryRun).toBe(true);
  });

  it("propagates gateway errors to the caller", async () => {
    gatewayCallMock.mockRejectedValue(new Error("gateway denied"));

    const caller = makeCaller();
    await expect(caller.reconcileAgentStudioSync({})).rejects.toThrow(
      "gateway denied",
    );
  });
});
