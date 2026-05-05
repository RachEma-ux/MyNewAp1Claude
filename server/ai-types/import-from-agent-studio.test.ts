/**
 * Plan v3 Phase 36 — `listImportableAgentStudioCandidates` +
 * `importAgentStudioCandidate` tests.
 *
 * Verifies the AI Types-side entry uses ONLY `gatewayCall` to reach
 * Agent Studio (no direct imports of `server/agent-studio/*` and no
 * ASDB queries — both are enforced statically by the boundary check
 * but the test asserts the runtime ctx shape too).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const gatewayCallMock = vi.fn();

vi.mock("../platform/modules/module-gateway", () => ({
  gatewayCall: (...a: any[]) => gatewayCallMock(...a),
}));

import {
  listImportableAgentStudioCandidates,
  importAgentStudioCandidate,
} from "./import-from-agent-studio";

beforeEach(() => {
  gatewayCallMock.mockReset();
});

describe("listImportableAgentStudioCandidates — Phase 36", () => {
  it("calls gateway with sourceModule=aiTypes targetModule=agentStudio", async () => {
    gatewayCallMock.mockResolvedValue([{ agentId: 1 }, { agentId: 2 }]);
    const r = await listImportableAgentStudioCandidates({
      workspaceId: 100,
      actorId: 42,
    });
    expect(r).toEqual([{ agentId: 1 }, { agentId: 2 }]);
    expect(gatewayCallMock).toHaveBeenCalledTimes(1);
    const callArg = gatewayCallMock.mock.calls[0][0];
    expect(callArg.ctx.sourceModule).toBe("aiTypes");
    expect(callArg.ctx.targetModule).toBe("agentStudio");
    expect(callArg.ctx.actionKey).toBe(
      "agentStudio.exportCatalog.listCandidates",
    );
    expect(callArg.ctx.actorId).toBe(42);
  });

  it("defaults status filter to 'ready'", async () => {
    gatewayCallMock.mockResolvedValue([]);
    await listImportableAgentStudioCandidates({ actorId: 1 });
    const callArg = gatewayCallMock.mock.calls[0][0];
    expect(callArg.input.status).toBe("ready");
  });

  it("respects explicit status filter", async () => {
    gatewayCallMock.mockResolvedValue([]);
    await listImportableAgentStudioCandidates({
      actorId: 1,
      status: "exported",
    });
    expect(gatewayCallMock.mock.calls[0][0].input.status).toBe("exported");
  });

  it("returns empty array when gateway returns non-array (defensive)", async () => {
    gatewayCallMock.mockResolvedValue(null);
    const r = await listImportableAgentStudioCandidates({ actorId: 1 });
    expect(r).toEqual([]);
  });

  it("forwards workspaceId in input payload", async () => {
    gatewayCallMock.mockResolvedValue([]);
    await listImportableAgentStudioCandidates({
      workspaceId: 200,
      actorId: 1,
    });
    expect(gatewayCallMock.mock.calls[0][0].input.workspaceId).toBe(200);
  });

  it("attaches a correlation id (audit trail)", async () => {
    gatewayCallMock.mockResolvedValue([]);
    await listImportableAgentStudioCandidates({ actorId: 1 });
    expect(gatewayCallMock.mock.calls[0][0].ctx.correlationId).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });
});

describe("importAgentStudioCandidate — Phase 36", () => {
  it("calls gateway with sourceModule=aiTypes + receipt id", async () => {
    gatewayCallMock.mockResolvedValue({
      ok: true,
      candidate: { agentId: 1 },
      registerResult: { entryId: 999 },
    });
    const r = await importAgentStudioCandidate({
      agentId: 1,
      registeredBy: 42,
    });
    expect(r.ok).toBe(true);
    expect(r.candidate).toEqual({ agentId: 1 });
    expect(r.registerResult).toEqual({ entryId: 999 });
    const callArg = gatewayCallMock.mock.calls[0][0];
    expect(callArg.ctx.sourceModule).toBe("aiTypes");
    expect(callArg.ctx.targetModule).toBe("agentStudio");
    expect(callArg.ctx.actionKey).toBe(
      "agentStudio.exportCatalog.exportCandidate",
    );
    expect(callArg.ctx.actorId).toBe(42);
    expect(callArg.ctx.governanceReceiptId).toMatch(
      /^aitypes-import-1-\d+$/,
    );
  });

  it("forwards a caller-supplied governance receipt id", async () => {
    gatewayCallMock.mockResolvedValue({ ok: true });
    await importAgentStudioCandidate({
      agentId: 1,
      registeredBy: 42,
      governanceReceiptId: "rcpt-abc-123",
    });
    expect(gatewayCallMock.mock.calls[0][0].ctx.governanceReceiptId).toBe(
      "rcpt-abc-123",
    );
  });

  it("translates gateway throw into ok=false with reason", async () => {
    gatewayCallMock.mockRejectedValue(new Error("agent not eligible"));
    const r = await importAgentStudioCandidate({
      agentId: 1,
      registeredBy: 42,
    });
    expect(r.ok).toBe(false);
    expect(r.candidate).toBeNull();
    expect(r.reason).toBe("agent not eligible");
  });

  it("input payload contains agentId + registeredBy only (no internals)", async () => {
    gatewayCallMock.mockResolvedValue({ ok: true });
    await importAgentStudioCandidate({
      agentId: 1,
      registeredBy: 42,
    });
    expect(gatewayCallMock.mock.calls[0][0].input).toEqual({
      agentId: 1,
      registeredBy: 42,
    });
  });
});
