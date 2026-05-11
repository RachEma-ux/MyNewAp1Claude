/**
 * Phase 23 §1 — Quality Agent run lifecycle.
 *
 * Unit tests via fake DB + fake graph repo. The agent run wraps
 * `runQualityScan` (PR #473) and optionally `convertFindingToProposal`
 * (PR #475) inside a single audited row in
 * `ags_graph_quality_agent_runs`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runQualityAgent,
  AsdbUnavailableError,
} from "../../server/agent-studio/services/graph-quality/agent-run";
import type { GraphRepository } from "../../server/agent-studio/services/graph/repository/index";
import type { QualityScannerRegistration } from "../../server/agent-studio/services/graph-quality/scan-orchestrator";

interface FakeDbState {
  agentRunRow: Record<string, unknown> | null;
  agentRunUpdates: Record<string, unknown>[];
  scanRows: Record<string, unknown>[];
  scanUpdates: Record<string, unknown>[];
  findings: Record<string, unknown>[];
  /**
   * Findings keyed by (scanId, id) — used by the agent's
   * post-scan `listFindingIdsForScan` reader.
   */
  findingIdsByScanId: Map<number, number[]>;
  nextScanId: number;
  nextFindingId: number;
  proposals: number[]; // ids
  nextProposalId: number;
}

function makeFakeDb() {
  const state: FakeDbState = {
    agentRunRow: null,
    agentRunUpdates: [],
    scanRows: [],
    scanUpdates: [],
    findings: [],
    findingIdsByScanId: new Map(),
    nextScanId: 100,
    nextFindingId: 1000,
    proposals: [],
    nextProposalId: 500,
  };

  const tableName = (t: unknown): string => {
    const sym = Object.getOwnPropertySymbols(t as object).find(
      (s) => s.description === "drizzle:Name",
    );
    return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
  };

  const insert = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
        if (name === "ags_graph_quality_agent_runs") {
          state.agentRunRow = Array.isArray(vals) ? vals[0] : vals;
          return {
            returning: async () => [{ id: 7 }],
          };
        }
        if (name === "ags_graph_quality_scans") {
          const id = state.nextScanId++;
          state.scanRows.push({ id, ...(Array.isArray(vals) ? vals[0] : vals) });
          return {
            returning: async () => [{ id }],
          };
        }
        if (name === "ags_graph_quality_findings") {
          const rows = Array.isArray(vals) ? vals : [vals];
          for (const r of rows) {
            const id = state.nextFindingId++;
            state.findings.push({ id, ...r });
            const scanId = Number(r.scanId);
            const bucket = state.findingIdsByScanId.get(scanId) ?? [];
            bucket.push(id);
            state.findingIdsByScanId.set(scanId, bucket);
          }
        }
        if (name === "ags_graph_correction_proposals") {
          const id = state.nextProposalId++;
          state.proposals.push(id);
          return {
            returning: async () => [
              {
                id,
                proposalKind: "k",
                targetTypeKey: null,
                targetId: null,
                proposedChange: {},
                confidence: null,
                rationale: null,
                proposedByUserId: null,
                proposedByAgentId: null,
                status: "pending",
                createdAt: new Date(),
              },
            ],
          };
        }
        if (name === "ags_graph_correction_audit_events") {
          // swallow
        }
        return undefined;
      },
    };
  });

  const update = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          if (name === "ags_graph_quality_agent_runs") {
            state.agentRunUpdates.push(patch);
          } else if (name === "ags_graph_quality_scans") {
            state.scanUpdates.push(patch);
          } else if (name === "ags_graph_quality_findings") {
            // back-link from finding-to-proposal converter
            state.findings.push({ patched: patch });
          }
        },
      }),
    };
  });

  // The agent calls `listFindingIdsForScan` which does a select on
  // findings filtered by scanId. The converter then does a select on
  // findings by id. We dispatch by chain order:
  let selectCallCount = 0;
  const select = vi.fn(() => {
    selectCallCount += 1;
    return {
      from: (table: unknown) => {
        const tname = tableName(table);
        return {
          where: (_w: unknown) => ({
            limit: async (_n: number) => {
              // converter path: returns the finding by id
              const id = state.nextFindingId - 1; // last inserted
              const f = state.findings.find(
                (x) => Number(x.id) === id - (selectCallCount - 100),
              );
              // Easier: return the most recent matching finding (single).
              const last = state.findings.filter(
                (x) => x.id != null && !("patched" in x),
              );
              return last.length > 0 ? [last[last.length - 1]] : [];
            },
            // listFindingIdsForScan call path (no .limit): just resolves
            // to the rows. Drizzle's chain ends at .where; we need to
            // make it thenable.
            then: (resolve: (rows: unknown[]) => void) => {
              if (tname === "ags_graph_quality_findings") {
                const ids = Array.from(
                  state.findingIdsByScanId.values(),
                ).flat();
                resolve(ids.map((id) => ({ id })));
              } else {
                resolve([]);
              }
            },
          }),
        };
      },
    };
  });

  return { db: { insert, update, select }, state };
}

function makeRepo(): GraphRepository {
  return {
    globalGraphSample: vi.fn(async () => ({
      nodes: [
        { typeKey: "X", id: "x:1" },
        { typeKey: "X", id: "x:2" }, // orphan
      ],
      edges: [],
      truncated: false,
    })),
  } as unknown as GraphRepository;
}

const fakeOrphanScanner: QualityScannerRegistration = {
  scanKind: "orphan_node",
  run: (sample) => {
    const participating = new Set<string>();
    for (const e of sample.edges) {
      participating.add(e.sourceNode.id);
      participating.add(e.targetNode.id);
    }
    return sample.nodes
      .filter((n) => !participating.has(n.id))
      .map((n) => ({
        findingClass: "orphan_node" as const,
        severity: "medium" as const,
        sourceTypeKey: n.typeKey,
        sourceId: n.id,
      }));
  },
};

const failingScanner: QualityScannerRegistration = {
  scanKind: "boom",
  run: () => {
    throw new Error("scanner exploded");
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runQualityAgent", () => {
  it("throws AsdbUnavailableError when ASDB is null", async () => {
    const repo = makeRepo();
    await expect(
      runQualityAgent(
        {},
        {
          registry: [fakeOrphanScanner],
          repository: repo,
          getDb: () => null as never,
        },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("opens an agent run row, runs every registered scanner by default, flips to completed", async () => {
    const { db, state } = makeFakeDb();
    const repo = makeRepo();

    const result = await runQualityAgent(
      {},
      {
        registry: [fakeOrphanScanner],
        repository: repo,
        getDb: () => db as never,
      },
    );

    expect(result.agentRunId).toBe(7);
    expect(result.status).toBe("completed");
    expect(result.scannerSummaries).toHaveLength(1);
    expect(result.scannerSummaries[0].scanKind).toBe("orphan_node");
    expect(result.scannerSummaries[0].result.status).toBe("completed");
    expect(result.proposalsCreated).toBe(0);

    expect(state.agentRunRow).toMatchObject({
      agentKey: "graph_quality_agent",
      status: "running",
    });
    expect(state.agentRunUpdates).toHaveLength(1);
    expect(state.agentRunUpdates[0]).toMatchObject({
      status: "completed",
      proposalsCreated: 0,
    });
  });

  it("respects scanKinds filter — runs only the requested kinds", async () => {
    const { db } = makeFakeDb();
    const repo = makeRepo();

    const secondScanner: QualityScannerRegistration = {
      scanKind: "other_kind",
      run: () => [],
    };

    const result = await runQualityAgent(
      { scanKinds: ["orphan_node"] },
      {
        registry: [fakeOrphanScanner, secondScanner],
        repository: repo,
        getDb: () => db as never,
      },
    );
    expect(result.scannerSummaries).toHaveLength(1);
    expect(result.scannerSummaries[0].scanKind).toBe("orphan_node");
  });

  it("records every scanner failure but doesn't fail the whole agent run", async () => {
    const { db, state } = makeFakeDb();
    const repo = makeRepo();

    const result = await runQualityAgent(
      {},
      {
        registry: [fakeOrphanScanner, failingScanner],
        repository: repo,
        getDb: () => db as never,
      },
    );
    expect(result.status).toBe("completed"); // partial success
    expect(result.scannerSummaries).toHaveLength(2);
    const boom = result.scannerSummaries.find((s) => s.scanKind === "boom");
    expect(boom?.result.status).toBe("failed");
    expect(state.agentRunUpdates[0].status).toBe("completed");
  });

  it("flips to status=failed when every registered scanner failed", async () => {
    const { db, state } = makeFakeDb();
    const repo = makeRepo();

    const result = await runQualityAgent(
      {},
      {
        registry: [failingScanner],
        repository: repo,
        getDb: () => db as never,
      },
    );
    expect(result.status).toBe("failed");
    expect(state.agentRunUpdates[0].status).toBe("failed");
  });

  it("handles an empty registry as a no-op completed run", async () => {
    const { db } = makeFakeDb();
    const repo = makeRepo();

    const result = await runQualityAgent(
      {},
      {
        registry: [],
        repository: repo,
        getDb: () => db as never,
      },
    );
    expect(result.status).toBe("completed");
    expect(result.scannerSummaries).toHaveLength(0);
    expect(result.proposalsCreated).toBe(0);
  });

  it("stamps custom agentKey when provided", async () => {
    const { db, state } = makeFakeDb();
    const repo = makeRepo();

    await runQualityAgent(
      { agentKey: "my_custom_agent" },
      {
        registry: [fakeOrphanScanner],
        repository: repo,
        getDb: () => db as never,
      },
    );
    expect(state.agentRunRow).toMatchObject({ agentKey: "my_custom_agent" });
  });
});
