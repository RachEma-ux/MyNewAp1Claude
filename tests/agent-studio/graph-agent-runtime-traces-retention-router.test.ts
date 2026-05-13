/**
 * Phase 22 follow-up #678 — graph-agent runtime-traces retention
 * cron-status router smoke test. The corresponding manual-sweep
 * mutation is the EXISTING `graphAgent.pruneTraces` (Phase 14 §3
 * — already shipped), so this PR adds only the status query.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { statusMock } = vi.hoisted(() => ({ statusMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/graph-agent/retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return {
      ...real,
      getGraphAgentRuntimeTracesRetentionCronStatus: statusMock,
    };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  statusMock.mockReset();
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("graphAgent.getRuntimeTracesRetentionCronStatus", () => {
  it("is mounted on the graphAgent sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(
      procedures["graphAgent.getRuntimeTracesRetentionCronStatus"],
    ).toBeDefined();
  });

  it("returns cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-13T17:00:00Z"),
      lastResult: {
        cutoff: new Date("2026-02-12T17:00:00Z"),
        graphSkillRuntimeUsages: 4,
        queryTemplateRuns: 11,
        graphAgentSteps: 73,
        graphAgentRuns: 15,
      },
      lastError: null,
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result =
      await caller.graphAgent.getRuntimeTracesRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-13T17:00:00.000Z");
    expect(result.lastResult?.graphSkillRuntimeUsages).toBe(4);
    expect(result.lastResult?.queryTemplateRuns).toBe(11);
    expect(result.lastResult?.graphAgentSteps).toBe(73);
    expect(result.lastResult?.graphAgentRuns).toBe(15);
  });

  it("surfaces lastError", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: null,
      lastResult: null,
      lastError: "ASDB unreachable",
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result =
      await caller.graphAgent.getRuntimeTracesRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});

describe("graphAgent.pruneTraces (existing mutation — sanity check)", () => {
  it("is still mounted on the graphAgent sub-router (unchanged by #678)", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["graphAgent.pruneTraces"]).toBeDefined();
  });
});
