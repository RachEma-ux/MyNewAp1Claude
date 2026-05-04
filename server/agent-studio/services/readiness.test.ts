/**
 * Plan v3 Phase 28 — `computeAgentReadinessSnapshot` tests.
 *
 * The snapshot delegates score/publishReady computation to the real
 * `computeReadiness` (which fans out across many repo calls); this
 * test mocks the repo to drive each branch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const repoMocks = {
  getAgentById: vi.fn(),
  getCurrentDraft: vi.fn(),
  listToolBindings: vi.fn(),
  listKnowledgeBindings: vi.fn(),
  listMemoryConfigs: vi.fn(),
  listWorkflowNodes: vi.fn(),
  getLatestSimulationRun: vi.fn(),
  getLatestTestRun: vi.fn(),
};

vi.mock("../repository", () => ({
  getAgentById: (...a: any[]) => repoMocks.getAgentById(...a),
  getCurrentDraft: (...a: any[]) => repoMocks.getCurrentDraft(...a),
  listToolBindings: (...a: any[]) => repoMocks.listToolBindings(...a),
  listKnowledgeBindings: (...a: any[]) => repoMocks.listKnowledgeBindings(...a),
  listMemoryConfigs: (...a: any[]) => repoMocks.listMemoryConfigs(...a),
  listWorkflowNodes: (...a: any[]) => repoMocks.listWorkflowNodes(...a),
  getLatestSimulationRun: (...a: any[]) =>
    repoMocks.getLatestSimulationRun(...a),
  getLatestTestRun: (...a: any[]) => repoMocks.getLatestTestRun(...a),
}));

import { computeAgentReadinessSnapshot } from "./readiness";

beforeEach(() => {
  for (const fn of Object.values(repoMocks)) fn.mockReset();
  // Sensible defaults for repo collection methods so individual tests
  // only need to set the fields they care about.
  repoMocks.listToolBindings.mockResolvedValue([]);
  repoMocks.listKnowledgeBindings.mockResolvedValue([]);
  repoMocks.listMemoryConfigs.mockResolvedValue([]);
  repoMocks.listWorkflowNodes.mockResolvedValue([]);
  repoMocks.getLatestSimulationRun.mockResolvedValue(null);
  repoMocks.getLatestTestRun.mockResolvedValue(null);
});

describe("computeAgentReadinessSnapshot — Phase 28", () => {
  it("returns a snapshot when the agent does not exist (system blocker)", async () => {
    repoMocks.getAgentById.mockResolvedValue(null);

    const r = await computeAgentReadinessSnapshot({
      agentId: 99,
      computedBy: "user:42",
      now: () => new Date("2026-05-04T12:00:00Z"),
    });

    expect(r.readinessScore).toBe(0);
    expect(r.publishReady).toBe(false);
    expect(r.readinessComputedBy).toBe("user:42");
    expect(r.readinessComputedAt).toBe("2026-05-04T12:00:00.000Z");
    expect(r.report.blockers).toEqual([
      expect.objectContaining({
        section: "system",
        severity: "blocker",
      }),
    ]);
  });

  it("propagates score from underlying computeReadiness", async () => {
    repoMocks.getAgentById.mockResolvedValue({
      id: 1,
      name: "test-agent",
      internalKey: "test",
      ownerId: 1,
    });
    repoMocks.getCurrentDraft.mockResolvedValue({
      id: 10,
      ownerId: 1,
      mission: "do things",
      scope: "narrow",
      successCriteria: "all green",
      governancePolicy: {
        auditRequired: true,
        killSwitchEnabled: true,
        budgetCeiling: 100,
      },
    });

    const r = await computeAgentReadinessSnapshot({
      agentId: 1,
      computedBy: "system:export-catalog",
    });

    expect(r.readinessScore).toBeGreaterThan(0);
    expect(r.readinessScore).toBe(r.report.score);
    expect(r.readinessComputedBy).toBe("system:export-catalog");
  });

  it("publishReady mirrors the underlying report exactly", async () => {
    repoMocks.getAgentById.mockResolvedValue(null);

    const r = await computeAgentReadinessSnapshot({
      agentId: 1,
      computedBy: "user:42",
    });

    expect(r.publishReady).toBe(r.report.publishReady);
    expect(r.publishReady).toBe(false);
  });

  it("emits a fresh timestamp at each call", async () => {
    repoMocks.getAgentById.mockResolvedValue(null);

    const t1 = new Date("2026-05-04T00:00:00Z");
    const t2 = new Date("2026-05-04T00:01:00Z");

    const r1 = await computeAgentReadinessSnapshot({
      agentId: 1,
      computedBy: "user:42",
      now: () => t1,
    });
    const r2 = await computeAgentReadinessSnapshot({
      agentId: 1,
      computedBy: "user:42",
      now: () => t2,
    });

    expect(r1.readinessComputedAt).toBe("2026-05-04T00:00:00.000Z");
    expect(r2.readinessComputedAt).toBe("2026-05-04T00:01:00.000Z");
  });

  it("computedBy is carried verbatim — no normalization, no validation", async () => {
    repoMocks.getAgentById.mockResolvedValue(null);

    const r = await computeAgentReadinessSnapshot({
      agentId: 1,
      computedBy: "system:phase-28-test",
    });

    expect(r.readinessComputedBy).toBe("system:phase-28-test");
  });
});
