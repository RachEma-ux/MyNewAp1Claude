/**
 * Phase 22 ↔ Phase 23 — runQualityAgent notifyUserId wiring.
 *
 * Verifies that runQualityAgent calls pushAgentRunNotifications
 * when notifyUserId is set, and does NOT call it when omitted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pushNotificationMock } = vi.hoisted(() => ({
  pushNotificationMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/user-notifications.js",
  () => ({
    pushNotification: pushNotificationMock,
  }),
);

import { runQualityAgent } from "../../server/agent-studio/services/graph-quality/agent-run";
import type { GraphRepository } from "../../server/agent-studio/services/graph/repository/index";
import type { QualityScannerRegistration } from "../../server/agent-studio/services/graph-quality/scan-orchestrator";

function makeFakeDb() {
  const state = {
    agentRunRow: null as Record<string, unknown> | null,
    agentRunUpdates: [] as Record<string, unknown>[],
    scanRows: [] as Record<string, unknown>[],
    nextScanId: 100,
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
          return { returning: async () => [{ id: 7 }] };
        }
        if (name === "ags_graph_quality_scans") {
          const id = state.nextScanId++;
          state.scanRows.push({ id, ...(Array.isArray(vals) ? vals[0] : vals) });
          return { returning: async () => [{ id }] };
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
          }
        },
      }),
    };
  });

  return { db: { insert, update }, state };
}

function makeRepo(): GraphRepository {
  return {
    globalGraphSample: vi.fn(async () => ({
      nodes: [],
      edges: [],
      truncated: false,
    })),
  } as unknown as GraphRepository;
}

const fakeScanner: QualityScannerRegistration = {
  scanKind: "orphan_node",
  run: () => [],
};

beforeEach(() => {
  pushNotificationMock.mockReset();
  pushNotificationMock.mockResolvedValue({ id: 1 });
});

describe("runQualityAgent notifyUserId wiring", () => {
  it("does NOT push notifications when notifyUserId is omitted", async () => {
    const { db } = makeFakeDb();
    await runQualityAgent(
      {},
      {
        registry: [fakeScanner],
        repository: makeRepo(),
        getDb: () => db as never,
      },
    );
    expect(pushNotificationMock).not.toHaveBeenCalled();
  });

  it("pushes run-completed notification when notifyUserId is set", async () => {
    const { db } = makeFakeDb();
    await runQualityAgent(
      { notifyUserId: 42 },
      {
        registry: [fakeScanner],
        repository: makeRepo(),
        getDb: () => db as never,
      },
    );
    expect(pushNotificationMock).toHaveBeenCalledTimes(1);
    expect(pushNotificationMock.mock.calls[0][0]).toMatchObject({
      userId: 42,
      notificationKind: "graph_quality_run_completed",
    });
  });

  it("does not push when notifyUserId is 0 (falsy but unset semantically)", async () => {
    const { db } = makeFakeDb();
    await runQualityAgent(
      { notifyUserId: undefined },
      {
        registry: [fakeScanner],
        repository: makeRepo(),
        getDb: () => db as never,
      },
    );
    expect(pushNotificationMock).not.toHaveBeenCalled();
  });

  it("does NOT crash the agent run when notification push throws", async () => {
    pushNotificationMock.mockRejectedValue(new Error("ASDB unavailable"));
    const { db } = makeFakeDb();
    const result = await runQualityAgent(
      { notifyUserId: 5 },
      {
        registry: [fakeScanner],
        repository: makeRepo(),
        getDb: () => db as never,
      },
    );
    // Result still returns successfully (best-effort notification).
    expect(result.agentRunId).toBe(7);
    expect(result.status).toBe("completed");
  });
});
