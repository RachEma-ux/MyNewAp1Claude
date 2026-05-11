/**
 * Phase 22 — service-level error capture wiring.
 *
 * Verifies that scan-orchestrator and agent-run service catch blocks
 * call captureUnexpectedTrpcError on failure, surfacing service
 * failures into the workspace observability dashboard.
 *
 * The capture is fire-and-forget (void-prefixed) — we mock the helper
 * via vi.mock and assert it was invoked with the right sourceKind +
 * forwarded error, without needing a real ASDB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { captureMock } = vi.hoisted(() => ({
  captureMock: vi.fn(async () => null),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/public-api.js",
  () => ({
    captureUnexpectedTrpcError: captureMock,
  }),
);

import { runQualityScan } from "../../server/agent-studio/services/graph-quality/scan-orchestrator";
import {
  applyApprovedProposal,
  type ApplierRegistry,
} from "../../server/agent-studio/services/graph-quality/mutation-worker";
import type { GraphRepository } from "../../server/agent-studio/services/graph/repository/index";

beforeEach(() => {
  captureMock.mockReset();
  captureMock.mockResolvedValue(null);
});

function makeFakeDbForScan() {
  const state = {
    scanUpdates: [] as Record<string, unknown>[],
  };
  let nextScanId = 5000;
  const insert = vi.fn(() => ({
    values: (_v: unknown) => ({
      returning: async () => [{ id: nextScanId++ }],
    }),
  }));
  const update = vi.fn(() => ({
    set: (vals: Record<string, unknown>) => ({
      where: async () => {
        state.scanUpdates.push(vals);
      },
    }),
  }));
  return { db: { insert, update } as unknown, state };
}

describe("scan-orchestrator → captureUnexpectedTrpcError on failure", () => {
  it("invokes the capture helper when the repo throws", async () => {
    const { db } = makeFakeDbForScan();
    const repo = {
      globalGraphSample: async () => {
        throw new Error("graph backend down");
      },
    } as unknown as GraphRepository;

    const result = await runQualityScan(
      { scanKind: "orphan_node" },
      {
        registry: [
          { scanKind: "orphan_node", run: () => [] },
        ],
        repository: repo,
        getDb: () => db as never,
      },
    );

    expect(result.status).toBe("failed");
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock.mock.calls[0][0]).toBe("graphQuality.scanOrchestrator");
    expect(captureMock.mock.calls[0][1]).toBeInstanceOf(Error);
    expect((captureMock.mock.calls[0][1] as Error).message).toBe(
      "graph backend down",
    );
    const ctx = captureMock.mock.calls[0][2] as { metadata: { scanKind: string } };
    expect(ctx.metadata.scanKind).toBe("orphan_node");
  });

  it("does NOT invoke the capture helper on a successful scan", async () => {
    const { db } = makeFakeDbForScan();
    const repo = {
      globalGraphSample: async () => ({
        nodes: [],
        edges: [],
        truncated: false,
      }),
    } as unknown as GraphRepository;

    const result = await runQualityScan(
      { scanKind: "orphan_node" },
      {
        registry: [
          { scanKind: "orphan_node", run: () => [] },
        ],
        repository: repo,
        getDb: () => db as never,
      },
    );

    expect(result.status).toBe("completed");
    expect(captureMock).not.toHaveBeenCalled();
  });
});

function makeFakeDbForMutationWorker(opts: {
  proposalStatus: string;
  audited?: boolean;
  proposedChange: Record<string, unknown>;
}) {
  const state = {
    audits: [] as Record<string, unknown>[],
    findingUpdates: [] as Record<string, unknown>[],
  };
  const proposalRow = {
    id: 42,
    status: opts.proposalStatus,
    proposedChange: opts.proposedChange,
  };
  const auditRows = opts.audited ? [{ id: 1 }] : [];

  let selectCount = 0;
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          selectCount++;
          if (selectCount === 1) return [proposalRow];
          return auditRows;
        },
        orderBy: () => ({ limit: async () => auditRows }),
      }),
    }),
  }));

  const insert = vi.fn(() => ({
    values: (vals: Record<string, unknown>) => {
      state.audits.push(vals);
      return { returning: async () => [] };
    },
  }));

  const update = vi.fn(() => ({
    set: (vals: Record<string, unknown>) => ({
      where: async () => {
        state.findingUpdates.push(vals);
      },
    }),
  }));

  return { db: { select, insert, update } as unknown, state };
}

describe("mutation-worker → captureUnexpectedTrpcError on applier throw", () => {
  it("invokes the capture helper when the applier throws", async () => {
    const { db } = makeFakeDbForMutationWorker({
      proposalStatus: "approved",
      proposedChange: {
        payload: {
          kind: "archive_node",
          typeKey: "Note",
          nodeId: "n:1",
          reason: "test",
        },
      },
    });
    const throwingRegistry: ApplierRegistry = {
      archive_node: async () => {
        throw new Error("graph backend exploded");
      },
      merge_into_canonical: async () => ({ applied: true }),
      re_promote_with_source_version: async () => ({ applied: true }),
      manual_review: async () => ({ applied: false, reason: "manual" }),
    };

    const result = await applyApprovedProposal(
      { proposalId: 42 },
      { getDb: () => db as never, registry: throwingRegistry },
    );

    expect(result.result.applied).toBe(false);
    expect(result.result.reason).toMatch(/graph backend exploded/);
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock.mock.calls[0][0]).toBe("graphQuality.mutationWorker");
    expect(captureMock.mock.calls[0][1]).toBeInstanceOf(Error);
    expect((captureMock.mock.calls[0][1] as Error).message).toBe(
      "graph backend exploded",
    );
    const ctx = captureMock.mock.calls[0][2] as {
      metadata: { payloadKind: string; proposalId: number };
    };
    expect(ctx.metadata.payloadKind).toBe("archive_node");
    expect(ctx.metadata.proposalId).toBe(42);
  });

  it("does NOT invoke the capture helper on a successful applier", async () => {
    const { db } = makeFakeDbForMutationWorker({
      proposalStatus: "approved",
      proposedChange: {
        payload: {
          kind: "archive_node",
          typeKey: "Note",
          nodeId: "n:1",
          reason: "test",
        },
      },
    });

    const result = await applyApprovedProposal(
      { proposalId: 42 },
      { getDb: () => db as never },
    );

    expect(result.result.applied).toBe(true);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("does NOT invoke the capture helper on manual_review applier (legitimate applied=false)", async () => {
    const { db } = makeFakeDbForMutationWorker({
      proposalStatus: "approved",
      proposedChange: {
        payload: {
          kind: "manual_review",
          findingClass: "self_loop",
          note: "needs operator review",
        },
      },
    });

    const result = await applyApprovedProposal(
      { proposalId: 42 },
      { getDb: () => db as never },
    );

    expect(result.result.applied).toBe(false);
    // manual_review applier deliberately returns applied:false WITHOUT throwing;
    // no error capture should fire.
    expect(captureMock).not.toHaveBeenCalled();
  });
});
