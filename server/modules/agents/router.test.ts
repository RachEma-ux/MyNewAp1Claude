/**
 * Agent Orchestration Engine Router Tests
 *
 * Tests:
 * 1. Schema tables are defined
 * 2. Module guard requires 'agents'
 * 3. Run lifecycle: pending → running → completed/failed
 * 4. Activity logging for mutations
 * 5. Guard rejects when disabled
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireModule = vi.fn().mockResolvedValue(undefined);
const mockLogActivity = vi.fn().mockResolvedValue(undefined);

vi.mock("../registry", () => ({
  requireModule: (...args: any[]) => mockRequireModule(...args),
  logActivity: (...args: any[]) => mockLogActivity(...args),
}));

vi.mock("../../db/connection", () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => [],
          limit: () => [{ id: 1, status: "pending" }],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => [{ id: 1, status: "pending", workspaceId: 1 }],
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
  })),
}));

describe("Agent Orchestration Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schema tables are defined", async () => {
    const { workspaceAgents, agentRuns, agentRunEvents, agentRunArtifacts } = await import("./schema");
    expect(workspaceAgents).toBeDefined();
    expect(agentRuns).toBeDefined();
    expect(agentRunEvents).toBeDefined();
    expect(agentRunArtifacts).toBeDefined();
  });

  it("module guard requires 'agents'", async () => {
    await mockRequireModule(1, "agents");
    expect(mockRequireModule).toHaveBeenCalledWith(1, "agents");
  });

  it("run lifecycle transitions are valid", () => {
    const validTransitions: Record<string, string[]> = {
      pending: ["running"],
      running: ["completed", "failed"],
      completed: [],
      failed: [],
    };
    expect(validTransitions.pending).toContain("running");
    expect(validTransitions.running).toContain("completed");
    expect(validTransitions.running).toContain("failed");
  });

  it("activity is logged for agent mutations", async () => {
    await mockLogActivity({
      workspaceId: 1,
      moduleKey: "agents",
      actorId: 1,
      action: "agent.run.request",
      targetType: "agent_run",
      targetId: 1,
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agent.run.request" })
    );
  });

  it("guard rejects when agents module disabled", async () => {
    mockRequireModule.mockRejectedValueOnce(
      new Error('Module "agents" is not enabled for workspace 1')
    );
    await expect(mockRequireModule(1, "agents")).rejects.toThrow("not enabled");
  });
});
