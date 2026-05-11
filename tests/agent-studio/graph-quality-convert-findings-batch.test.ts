/**
 * Phase 22 ↔ Phase 23 — convertFindingsBatch (autoConvert inner loop).
 *
 * Verifies the per-finding skip/capture decision matrix:
 *   - convertFindingToProposal succeeds → counted, no capture
 *   - convertFindingToProposal throws FindingAlreadyConvertedError
 *     (idempotent re-run) → skipped, no capture (benign signal)
 *   - convertFindingToProposal throws anything else → skipped, captured
 *     to ags_workspace_error_events for operator triage
 *   - AsdbUnavailable, etc. don't kill the batch — each finding is
 *     independent
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { convertMock, captureMock } = vi.hoisted(() => ({
  convertMock: vi.fn(),
  captureMock: vi.fn(async () => null),
}));

vi.mock(
  "../../server/agent-studio/services/graph-quality/finding-to-proposal.js",
  async () => {
    const actual = await vi.importActual<
      typeof import("../../server/agent-studio/services/graph-quality/finding-to-proposal.js")
    >(
      "../../server/agent-studio/services/graph-quality/finding-to-proposal.js",
    );
    return {
      ...actual,
      convertFindingToProposal: convertMock,
    };
  },
);

vi.mock(
  "../../server/agent-studio/services/workspace-observability/public-api.js",
  () => ({
    captureUnexpectedTrpcError: captureMock,
  }),
);

import { convertFindingsBatch } from "../../server/agent-studio/services/graph-quality/agent-run";
import { FindingAlreadyConvertedError } from "../../server/agent-studio/services/graph-quality/finding-to-proposal";

const baseCtx = {
  agentRunId: 100,
  scanKind: "orphan_node",
  proposedByAgentId: 5,
};

beforeEach(() => {
  convertMock.mockReset();
  captureMock.mockReset();
  captureMock.mockResolvedValue(null);
});

describe("convertFindingsBatch", () => {
  it("counts every successful conversion and emits no capture", async () => {
    convertMock.mockResolvedValue(undefined);
    const count = await convertFindingsBatch([1, 2, 3], baseCtx);
    expect(count).toBe(3);
    expect(convertMock).toHaveBeenCalledTimes(3);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("skips findings that are already-converted WITHOUT capturing", async () => {
    convertMock.mockImplementation(async ({ findingId }: { findingId: number }) => {
      if (findingId === 2) {
        throw new FindingAlreadyConvertedError(2, 999);
      }
    });
    const count = await convertFindingsBatch([1, 2, 3], baseCtx);
    expect(count).toBe(2);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("captures unexpected errors and continues processing the batch", async () => {
    convertMock.mockImplementation(async ({ findingId }: { findingId: number }) => {
      if (findingId === 2) throw new Error("ASDB unavailable");
      if (findingId === 4) throw new Error("malformed finding");
    });
    const count = await convertFindingsBatch([1, 2, 3, 4, 5], baseCtx);
    expect(count).toBe(3); // 1, 3, 5 succeeded
    expect(captureMock).toHaveBeenCalledTimes(2);
    expect(captureMock.mock.calls[0][0]).toBe(
      "graphQuality.agentRun.convertFinding",
    );
    expect(captureMock.mock.calls[0][1]).toBeInstanceOf(Error);
    const ctx = captureMock.mock.calls[0][2] as {
      sourceId: string;
      metadata: { findingId: number; agentRunId: number; scanKind: string };
    };
    expect(ctx.sourceId).toBe("2");
    expect(ctx.metadata.findingId).toBe(2);
    expect(ctx.metadata.agentRunId).toBe(100);
    expect(ctx.metadata.scanKind).toBe("orphan_node");
  });

  it("captures mixed expected + unexpected errors correctly", async () => {
    convertMock.mockImplementation(async ({ findingId }: { findingId: number }) => {
      if (findingId === 1) throw new FindingAlreadyConvertedError(1, 999); // expected
      if (findingId === 2) throw new Error("db blew up"); // unexpected
      if (findingId === 3) throw new FindingAlreadyConvertedError(3, 1000); // expected
      // 4 succeeds
    });
    const count = await convertFindingsBatch([1, 2, 3, 4], baseCtx);
    expect(count).toBe(1); // only id=4
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(
      (captureMock.mock.calls[0][2] as { metadata: { findingId: number } })
        .metadata.findingId,
    ).toBe(2);
  });

  it("returns 0 for an empty finding list", async () => {
    const count = await convertFindingsBatch([], baseCtx);
    expect(count).toBe(0);
    expect(convertMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });
});
