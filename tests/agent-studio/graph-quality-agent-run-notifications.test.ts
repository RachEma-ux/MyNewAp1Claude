/**
 * Phase 22 ↔ Phase 23 — Quality Agent run → user notification bridge.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pushAgentRunNotifications } from "../../server/agent-studio/services/graph-quality/agent-run-notifications";
import type { RunQualityAgentResult } from "../../server/agent-studio/services/graph-quality/agent-run";

function makeResult(
  overrides: Partial<RunQualityAgentResult> = {},
): RunQualityAgentResult {
  return {
    agentRunId: 1,
    status: "completed" as const,
    proposalsCreated: 0,
    scannerSummaries: [],
    ...overrides,
  };
}

describe("pushAgentRunNotifications", () => {
  let pusher: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    pusher = vi.fn();
  });

  it("pushes a run-completed notification on every run", async () => {
    pusher.mockResolvedValue({ id: 1 });
    const outcome = await pushAgentRunNotifications(
      { userId: 7, agentRunResult: makeResult() },
      { pushNotification: pusher as never },
    );
    expect(outcome.runCompletedPushed).toBe(true);
    expect(outcome.proposalsCreatedPushed).toBe(false); // none created
    expect(outcome.errors).toEqual([]);
    expect(pusher).toHaveBeenCalledTimes(1);
    expect(pusher.mock.calls[0][0]).toMatchObject({
      userId: 7,
      notificationKind: "graph_quality_run_completed",
    });
  });

  it("pushes proposals-created notification when proposalsCreated > 0", async () => {
    pusher.mockResolvedValue({ id: 1 });
    const outcome = await pushAgentRunNotifications(
      {
        userId: 1,
        agentRunResult: makeResult({ proposalsCreated: 5 }),
      },
      { pushNotification: pusher as never },
    );
    expect(outcome.runCompletedPushed).toBe(true);
    expect(outcome.proposalsCreatedPushed).toBe(true);
    expect(pusher).toHaveBeenCalledTimes(2);
    expect(pusher.mock.calls[1][0]).toMatchObject({
      userId: 1,
      notificationKind: "graph_quality_proposals_created",
      payload: expect.objectContaining({
        proposalsCreated: 5,
      }),
    });
  });

  it("does NOT push proposals-created when proposalsCreated is 0", async () => {
    pusher.mockResolvedValue({ id: 1 });
    const outcome = await pushAgentRunNotifications(
      {
        userId: 1,
        agentRunResult: makeResult({ proposalsCreated: 0 }),
      },
      { pushNotification: pusher as never },
    );
    expect(outcome.proposalsCreatedPushed).toBe(false);
    expect(pusher).toHaveBeenCalledTimes(1);
  });

  it("rolls up findingsCount across scanner summaries into the run payload", async () => {
    pusher.mockResolvedValue({ id: 1 });
    await pushAgentRunNotifications(
      {
        userId: 1,
        agentRunResult: makeResult({
          scannerSummaries: [
            {
              scanKind: "orphan_node",
              result: {
                scanId: 10,
                status: "completed",
                findingsCount: 3,
              },
            },
            {
              scanKind: "duplicate_entity",
              result: {
                scanId: 11,
                status: "completed",
                findingsCount: 7,
              },
            },
          ],
        }),
      },
      { pushNotification: pusher as never },
    );
    expect(pusher.mock.calls[0][0].payload).toMatchObject({
      findingsCount: 10,
      scannerCount: 2,
    });
  });

  it("collects per-push errors into outcome.errors instead of throwing", async () => {
    pusher.mockImplementation(async (input: { notificationKind: string }) => {
      if (input.notificationKind === "graph_quality_proposals_created") {
        throw new Error("push failed");
      }
      return { id: 1 };
    });
    const outcome = await pushAgentRunNotifications(
      {
        userId: 1,
        agentRunResult: makeResult({ proposalsCreated: 2 }),
      },
      { pushNotification: pusher as never },
    );
    expect(outcome.runCompletedPushed).toBe(true);
    expect(outcome.proposalsCreatedPushed).toBe(false);
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]).toMatch(/graph_quality_proposals_created.*push failed/);
  });

  it("records both errors when the run-completed push also fails", async () => {
    pusher.mockRejectedValue(new Error("ASDB unavailable"));
    const outcome = await pushAgentRunNotifications(
      {
        userId: 1,
        agentRunResult: makeResult({ proposalsCreated: 2 }),
      },
      { pushNotification: pusher as never },
    );
    expect(outcome.runCompletedPushed).toBe(false);
    expect(outcome.proposalsCreatedPushed).toBe(false);
    expect(outcome.errors).toHaveLength(2);
  });
});
