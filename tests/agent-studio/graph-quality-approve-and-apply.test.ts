/**
 * Phase 23 §1 — approve-and-apply combo.
 *
 * Unit tests via mocked underlying functions; the combo is a pure
 * composition of two existing pieces and the tests assert it calls
 * both in order and threads the result through.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { approveMock, applyMock } = vi.hoisted(() => ({
  approveMock: vi.fn(),
  applyMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/graph-correction/lifecycle.js",
  () => ({
    approveCorrectionProposal: approveMock,
  }),
);

vi.mock(
  "../../server/agent-studio/services/graph-quality/mutation-worker.js",
  () => ({
    applyApprovedProposal: applyMock,
  }),
);

import { approveAndApplyProposal } from "../../server/agent-studio/services/graph-quality/approve-and-apply";

beforeEach(() => {
  approveMock.mockReset();
  applyMock.mockReset();
});

describe("approveAndApplyProposal", () => {
  it("calls approve then apply, returns both results", async () => {
    approveMock.mockResolvedValueOnce({
      id: 42,
      proposalKind: "k",
      status: "approved",
    });
    applyMock.mockResolvedValueOnce({
      proposalId: 42,
      payloadKind: "archive_node",
      result: { applied: true, details: { stub: true } },
    });

    const result = await approveAndApplyProposal({
      proposalId: 42,
      decidedByUserId: 7,
      rationale: "Reviewed and approved",
    });

    expect(approveMock).toHaveBeenCalledWith(
      42,
      7,
      "Reviewed and approved",
      expect.objectContaining({}),
    );
    expect(applyMock).toHaveBeenCalledWith(
      { proposalId: 42 },
      expect.objectContaining({}),
    );
    expect(result.approval).toMatchObject({ id: 42, status: "approved" });
    expect(result.apply).toMatchObject({
      proposalId: 42,
      payloadKind: "archive_node",
      result: { applied: true },
    });
  });

  it("threads null rationale when not provided", async () => {
    approveMock.mockResolvedValueOnce({ id: 1, status: "approved" });
    applyMock.mockResolvedValueOnce({
      proposalId: 1,
      payloadKind: "merge_into_canonical",
      result: { applied: true },
    });

    await approveAndApplyProposal({ proposalId: 1, decidedByUserId: 2 });
    expect(approveMock.mock.calls[0][2]).toBeNull();
  });

  it("propagates approve errors without calling apply", async () => {
    approveMock.mockRejectedValueOnce(new Error("approve failed"));
    await expect(
      approveAndApplyProposal({ proposalId: 9, decidedByUserId: 1 }),
    ).rejects.toThrow(/approve failed/);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("propagates apply errors after a successful approve", async () => {
    approveMock.mockResolvedValueOnce({ id: 5, status: "approved" });
    applyMock.mockRejectedValueOnce(new Error("apply failed"));

    await expect(
      approveAndApplyProposal({ proposalId: 5, decidedByUserId: 1 }),
    ).rejects.toThrow(/apply failed/);
    expect(approveMock).toHaveBeenCalledTimes(1);
    expect(applyMock).toHaveBeenCalledTimes(1);
  });

  it("passes through custom applier registry", async () => {
    approveMock.mockResolvedValueOnce({ id: 1, status: "approved" });
    applyMock.mockResolvedValueOnce({
      proposalId: 1,
      payloadKind: "manual_review",
      result: { applied: false, reason: "manual" },
    });

    const customRegistry = { archive_node: vi.fn() } as never;
    await approveAndApplyProposal(
      { proposalId: 1, decidedByUserId: 2 },
      { registry: customRegistry },
    );
    expect(applyMock.mock.calls[0][1]).toMatchObject({
      registry: customRegistry,
    });
  });
});
