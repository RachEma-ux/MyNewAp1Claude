/**
 * Direction B B3 — `catalogImport.listAgentStudioCandidates` /
 * `catalogImport.importAgentStudioCandidate` tRPC procedure tests.
 *
 * Verifies the procedures correctly wrap the existing
 * `listImportableAgentStudioCandidates` and `importAgentStudioCandidate`
 * server functions (which themselves are gateway-call tested in
 * server/ai-types/import-from-agent-studio.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const listMock = vi.fn();
const importMock = vi.fn();

vi.mock("../ai-types/import-from-agent-studio", () => ({
  listImportableAgentStudioCandidates: (...args: any[]) => listMock(...args),
  importAgentStudioCandidate: (...args: any[]) => importMock(...args),
}));

// Import the router AFTER mocks so the dynamic import inside the
// procedures resolves to the mocked module.
import { appRouter } from "../routers";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 42, role: "admin", openId: "test-user", name: "Test" } as any,
    session: null,
  } as any).catalogImport;
}

describe("catalogImport.listAgentStudioCandidates — Direction B B3", () => {
  beforeEach(() => {
    listMock.mockReset();
    importMock.mockReset();
  });

  it("returns candidates inside { candidates }", async () => {
    listMock.mockResolvedValue([
      { agentId: 1, name: "research-bot" },
      { agentId: 2, name: "support-bot" },
    ]);

    const caller = makeCaller();
    const r = await caller.listAgentStudioCandidates({});

    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]).toMatchObject({ agentId: 1, name: "research-bot" });
  });

  it("passes actorId from ctx.user.id and default status='ready'", async () => {
    listMock.mockResolvedValue([]);

    const caller = makeCaller();
    await caller.listAgentStudioCandidates(undefined);

    expect(listMock).toHaveBeenCalledTimes(1);
    const arg = listMock.mock.calls[0][0];
    expect(arg.actorId).toBe(42);
    // status defaulting to "ready" is owned by the AI Types side, not the
    // tRPC procedure — so the procedure forwards undefined when caller
    // doesn't pass status. The downstream function applies the default.
    expect(arg.status).toBeUndefined();
  });

  it("forwards explicit status to the AI Types side", async () => {
    listMock.mockResolvedValue([]);

    const caller = makeCaller();
    await caller.listAgentStudioCandidates({ status: "exported" });

    expect(listMock.mock.calls[0][0].status).toBe("exported");
  });
});

describe("catalogImport.importAgentStudioCandidate — Direction B B3", () => {
  beforeEach(() => {
    listMock.mockReset();
    importMock.mockReset();
  });

  it("forwards agentId and ctx.user.id as registeredBy", async () => {
    importMock.mockResolvedValue({
      ok: true,
      candidate: null,
      registerResult: null,
      reason: "exported",
    });

    const caller = makeCaller();
    const r = await caller.importAgentStudioCandidate({ agentId: 7 });

    expect(r.ok).toBe(true);
    expect(r.reason).toBe("exported");
    expect(importMock).toHaveBeenCalledTimes(1);
    expect(importMock.mock.calls[0][0]).toEqual({
      agentId: 7,
      registeredBy: 42,
    });
  });

  it("returns the not-ok shape from the AI Types side untouched", async () => {
    importMock.mockResolvedValue({
      ok: false,
      candidate: null,
      registerResult: null,
      reason: "agent not found",
    });

    const caller = makeCaller();
    const r = await caller.importAgentStudioCandidate({ agentId: 999 });

    expect(r.ok).toBe(false);
    expect(r.reason).toBe("agent not found");
  });

  it("rejects non-positive agentId at the input schema", async () => {
    const caller = makeCaller();
    await expect(
      caller.importAgentStudioCandidate({ agentId: -1 }),
    ).rejects.toThrow();
    expect(importMock).not.toHaveBeenCalled();
  });
});
