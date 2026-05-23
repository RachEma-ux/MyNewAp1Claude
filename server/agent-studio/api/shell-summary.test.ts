/**
 * Agent Studio — Shell Summary list/detail consistency.
 *
 * The bug this guards against: agents returned by `home.listAgents`
 * could not be opened by `shell.getShellSummary` because a single
 * subcomponent (draft, readiness, governance, latest sim, latest
 * test) throwing collapsed the whole call into a generic
 * "Agent not found" banner in the UI. The fix:
 *
 *   1. `getShellSummary` only throws NOT_FOUND when the agent row
 *      truly does not exist.
 *   2. Subcomponent failures return partial data + structured
 *      warnings instead of throwing.
 *   3. `getAgentById` failures surface as INTERNAL_SERVER_ERROR,
 *      not as NOT_FOUND.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const repoMocks = {
  listAgents: vi.fn(),
  getAgentById: vi.fn(),
  getCurrentDraft: vi.fn(),
  getLatestSimulationRun: vi.fn(),
  getLatestTestRun: vi.fn(),
  listRuntimeRuns: vi.fn(),
};

const readinessMocks = {
  computeReadiness: vi.fn(),
};
const governanceMocks = {
  evaluateGovernance: vi.fn(),
};

vi.mock("../repository", () => ({
  listAgents: (...a: any[]) => repoMocks.listAgents(...a),
  getAgentById: (...a: any[]) => repoMocks.getAgentById(...a),
  getCurrentDraft: (...a: any[]) => repoMocks.getCurrentDraft(...a),
  getLatestSimulationRun: (...a: any[]) =>
    repoMocks.getLatestSimulationRun(...a),
  getLatestTestRun: (...a: any[]) => repoMocks.getLatestTestRun(...a),
  listRuntimeRuns: (...a: any[]) => repoMocks.listRuntimeRuns(...a),
}));
vi.mock("../services/readiness", () => ({
  computeReadiness: (...a: any[]) => readinessMocks.computeReadiness(...a),
  // Phase 28 export-catalog snapshot — unused by the shell path but
  // imported transitively when the router module loads.
  computeAgentReadinessSnapshot: vi.fn(),
}));
vi.mock("../services/governance-adapter", () => ({
  evaluateGovernance: (...a: any[]) => governanceMocks.evaluateGovernance(...a),
  // Same rationale — keep transitive imports happy.
  computeExportGovernanceVerdict: vi.fn(),
  evaluateMcpPreInvoke: vi.fn(),
  evaluateMcpPostInvoke: vi.fn(),
}));

// Import after vi.mock so mocks resolve correctly. Loading
// `./router` is expensive (~5s on cold start because it pulls in
// the entire Agent Studio surface area), but the second test would
// hit the same cost — better to amortize it once at module load
// time than to risk tripping the per-test timeout on whichever
// test runs first.
import { _buildShellSummary } from "./router";
import { listAgents } from "../repository";

beforeEach(() => {
  for (const fn of Object.values(repoMocks)) fn.mockReset();
  readinessMocks.computeReadiness.mockReset();
  governanceMocks.evaluateGovernance.mockReset();
  // Sensible defaults — happy-path subcomponents.
  repoMocks.getCurrentDraft.mockResolvedValue({
    id: 10,
    agentId: 1,
    isCurrent: true,
    name: "test-agent",
    updatedAt: new Date("2026-05-10"),
  });
  repoMocks.getLatestSimulationRun.mockResolvedValue(null);
  repoMocks.getLatestTestRun.mockResolvedValue(null);
  repoMocks.listRuntimeRuns.mockResolvedValue([]);
  readinessMocks.computeReadiness.mockResolvedValue({
    score: 80,
    completeness: 90,
    totalChecks: 1,
    passedChecks: 1,
    warnings: [],
    blockers: [],
    publishReady: false,
    sections: {},
  });
  governanceMocks.evaluateGovernance.mockResolvedValue({
    verdict: "pass",
    reasons: [],
    riskScore: 0,
    policySummary: {},
  });
});

describe("agentStudio.shell.getShellSummary — list/detail consistency", () => {
  it("agents listed by listAgents can be opened by getShellSummary", async () => {
    // Given: list returns one agent with id=1, and the agent row
    // also exists in the detail path.
    const agentRow = {
      id: 1,
      name: "alpha",
      internalKey: "alpha",
      agentClass: "assistant",
      lifecycleState: "draft",
      environment: "draft",
      currentDraftId: 10,
      updatedAt: new Date("2026-05-10"),
    };
    repoMocks.listAgents.mockResolvedValue([
      { ...agentRow, providerConfig: null },
    ]);
    repoMocks.getAgentById.mockResolvedValue(agentRow);

    const list = await listAgents({ limit: 100 });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(1);

    // When: caller navigates to detail using the id from the list.
    const summary = await _buildShellSummary(list[0].id, {
      includeRecentRuns: false,
    });

    // Then: the call succeeds and returns the agent row.
    expect(summary.agent.id).toBe(1);
    expect(summary.warnings).toEqual([]);
  });

  it("does not throw when readiness fails — surfaces structured warning", async () => {
    repoMocks.getAgentById.mockResolvedValue({
      id: 1,
      name: "alpha",
      internalKey: "alpha",
    });
    readinessMocks.computeReadiness.mockRejectedValue(
      new Error("readiness boom")
    );
    const summary = await _buildShellSummary(1, { includeRecentRuns: false });

    expect(summary.agent.id).toBe(1);
    expect(summary.readiness).toBeNull();
    expect(summary.warnings).toEqual([
      expect.objectContaining({
        subcomponent: "readiness",
        message: "readiness boom",
      }),
    ]);
  });

  it("does not throw when governance fails — surfaces structured warning", async () => {
    repoMocks.getAgentById.mockResolvedValue({ id: 1, name: "alpha" });
    governanceMocks.evaluateGovernance.mockRejectedValue(
      new Error("gov boom")
    );
    const summary = await _buildShellSummary(1, { includeRecentRuns: false });

    expect(summary.agent.id).toBe(1);
    expect(summary.governance).toBeNull();
    expect(summary.warnings).toEqual([
      expect.objectContaining({
        subcomponent: "governance",
        message: "gov boom",
      }),
    ]);
  });

  it("does not throw when latest sim/test fail — collects all warnings", async () => {
    repoMocks.getAgentById.mockResolvedValue({ id: 1, name: "alpha" });
    repoMocks.getLatestSimulationRun.mockRejectedValue(new Error("sim boom"));
    repoMocks.getLatestTestRun.mockRejectedValue(new Error("test boom"));
    const summary = await _buildShellSummary(1, { includeRecentRuns: false });

    expect(summary.agent.id).toBe(1);
    expect(summary.latestSimulation).toBeNull();
    expect(summary.latestTest).toBeNull();
    const subs = summary.warnings.map((w) => w.subcomponent);
    expect(subs).toContain("latestSimulation");
    expect(subs).toContain("latestTest");
  });

  it("missing draft (null) is a normal state — NO warning emitted", async () => {
    repoMocks.getAgentById.mockResolvedValue({ id: 1, name: "alpha" });
    repoMocks.getCurrentDraft.mockResolvedValue(null);
    const summary = await _buildShellSummary(1, { includeRecentRuns: false });

    expect(summary.draft).toBeNull();
    expect(
      summary.warnings.find((w) => w.subcomponent === "draft"),
    ).toBeUndefined();
  });

  it("a draft READ failure produces a draft warning", async () => {
    repoMocks.getAgentById.mockResolvedValue({ id: 1, name: "alpha" });
    repoMocks.getCurrentDraft.mockRejectedValue(
      new Error("[AgentStudio] ASDB not available")
    );
    const summary = await _buildShellSummary(1, { includeRecentRuns: false });

    expect(summary.draft).toBeNull();
    expect(summary.warnings).toEqual([
      expect.objectContaining({
        subcomponent: "draft",
        message: expect.stringContaining("ASDB not available"),
      }),
    ]);
  });

  it("true missing agent still throws NOT_FOUND", async () => {
    repoMocks.getAgentById.mockResolvedValue(null);
    await expect(
      _buildShellSummary(99, { includeRecentRuns: false }),
    ).rejects.toThrow(TRPCError);
    await expect(
      _buildShellSummary(99, { includeRecentRuns: false }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("getAgentById throw surfaces as INTERNAL_SERVER_ERROR (not NOT_FOUND)", async () => {
    repoMocks.getAgentById.mockRejectedValue(
      new Error("[AgentStudio] ASDB not available")
    );

    // The bug we are guarding: a connection blip used to bubble up
    // through `db()` and the UI rendered "Agent not found" anyway.
    // Now it surfaces as a distinct error code so the UI can show
    // a specific diagnostic.
    await expect(
      _buildShellSummary(1, { includeRecentRuns: false }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("getOverview returns recentRuns and propagates their failures as warnings", async () => {
    repoMocks.getAgentById.mockResolvedValue({ id: 1, name: "alpha" });
    repoMocks.listRuntimeRuns.mockRejectedValue(new Error("runs boom"));
    const overview = await _buildShellSummary(1, { includeRecentRuns: true });

    expect((overview as any).recentRuns).toEqual([]);
    expect(overview.warnings).toEqual([
      expect.objectContaining({
        subcomponent: "recentRuns",
        message: "runs boom",
      }),
    ]);
  });
});
