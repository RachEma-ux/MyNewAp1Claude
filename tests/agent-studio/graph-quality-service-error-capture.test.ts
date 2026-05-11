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
