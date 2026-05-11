/**
 * Phase 13 §3 — Graph Agent explain-reader service tests.
 *
 * Covers `getExplanationForRun(runtimeRunId)` from
 * `services/graph-agent/explain-reader.ts`. Same "active-key"
 * side-channel fake-DB pattern as the prior recorder/reader tests.
 */

import { describe, it, expect, vi } from "vitest";
import { getExplanationForRun } from "../../server/agent-studio/services/graph-agent/explain-reader";

type SelectChain = {
  from: () => SelectChain;
  where: () => SelectChain;
  orderBy: () => SelectChain;
  limit: (n: number) => Promise<Array<Record<string, unknown>>>;
};

interface FakeDb {
  select: ReturnType<typeof vi.fn>;
}

interface FakeState {
  runsByRuntimeRunId: Record<
    number,
    {
      id: number;
      agentKey: string;
      userQuery: string;
      status: string;
      durationMs: number | null;
      errorMessage: string | null;
      startedAt: Date;
      completedAt: Date | null;
    }
  >;
  stepsByGraphAgentRunId: Record<
    number,
    Array<{
      stepIndex: number;
      stepKind: string;
      stepInput: Record<string, unknown> | null;
      stepOutput: Record<string, unknown> | null;
      durationMs: number | null;
      createdAt: Date;
    }>
  >;
  queue: Array<"run" | "steps">;
  activeRuntimeRunId?: number;
  activeGraphAgentRunId?: number;
}

function makeFakeDb(initial: Partial<FakeState>) {
  const state: FakeState = {
    runsByRuntimeRunId: initial.runsByRuntimeRunId ?? {},
    stepsByGraphAgentRunId: initial.stepsByGraphAgentRunId ?? {},
    queue: [],
  };
  const select = vi.fn(() => {
    const chain: SelectChain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => {
        const op = state.queue.shift();
        if (op === "run") {
          const r = state.activeRuntimeRunId
            ? state.runsByRuntimeRunId[state.activeRuntimeRunId]
            : undefined;
          return r ? [r] : [];
        }
        if (op === "steps") {
          const id = state.activeGraphAgentRunId ?? -1;
          return state.stepsByGraphAgentRunId[id] ?? [];
        }
        return [];
      },
    };
    // For the steps query, `limit` isn't called — drizzle's
    // `.orderBy()` chain returns the rows directly. But for our fake
    // we route everything through limit(); the runs branch sets
    // limit(1), the steps branch reaches limit only because we put
    // it on the chain. Steps actually resolve through orderBy() in
    // the real code — adjust by also surfacing rows on orderBy.
    return chain;
  });

  // The explain-reader does `.orderBy(...)` and AWAITS the result
  // without calling `.limit()` on the steps query. Override orderBy
  // to make it thenable.
  // (Implementation note: we model both shapes — the runs query
  // ends with .limit(1), the steps query ends with .orderBy().)
  const realSelect = select;
  const wrappedSelect = vi.fn(() => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => {
        // After orderBy, treat the chain as a thenable resolving to
        // the steps rows.
        const op = state.queue.shift();
        const thenable: PromiseLike<Array<Record<string, unknown>>> = {
          then: (resolve) => {
            if (op === "steps") {
              const id = state.activeGraphAgentRunId ?? -1;
              return Promise.resolve(
                state.stepsByGraphAgentRunId[id] ?? [],
              ).then(resolve as never) as never;
            }
            return Promise.resolve([]).then(resolve as never) as never;
          },
        };
        return thenable;
      },
      limit: async (_n: number) => {
        const op = state.queue.shift();
        if (op === "run") {
          const r = state.activeRuntimeRunId
            ? state.runsByRuntimeRunId[state.activeRuntimeRunId]
            : undefined;
          return r ? [r] : [];
        }
        return [];
      },
    };
    return chain;
  });
  // Avoid unused-var warning on the original `select`.
  void realSelect;

  return {
    db: { select: wrappedSelect } as FakeDb,
    state,
  };
}

describe("getExplanationForRun — Phase 13 §3", () => {
  it("returns null when ASDB is unavailable", async () => {
    const result = await getExplanationForRun(1, {
      getDb: () => null as never,
    });
    expect(result).toBeNull();
  });

  it("returns null when no graph-agent run row exists for the runtimeRunId", async () => {
    const { db, state } = makeFakeDb({});
    state.queue.push("run");
    state.activeRuntimeRunId = 999;
    const result = await getExplanationForRun(999, {
      getDb: () => db as never,
    });
    expect(result).toBeNull();
  });

  it("returns the run row + step ledger when a graph-agent run is found", async () => {
    const startedAt = new Date("2026-05-11T10:00:00Z");
    const completedAt = new Date("2026-05-11T10:00:05Z");
    const { db, state } = makeFakeDb({
      runsByRuntimeRunId: {
        7: {
          id: 100,
          agentKey: "graph_agent_lite",
          userQuery: "what links to seed?",
          status: "completed",
          durationMs: 5000,
          errorMessage: null,
          startedAt,
          completedAt,
        },
      },
      stepsByGraphAgentRunId: {
        100: [
          {
            stepIndex: 1,
            stepKind: "plan_retrieval_mode",
            stepInput: { retrievalPreference: "auto" },
            stepOutput: { retrievalMode: "graphrag_local" },
            durationMs: 1,
            createdAt: startedAt,
          },
          {
            stepIndex: 2,
            stepKind: "retrieve",
            stepInput: { mode: "graphrag_local" },
            stepOutput: { contextBlockCount: 3, truncated: false },
            durationMs: 25,
            createdAt: startedAt,
          },
        ],
      },
    });
    state.queue.push("run", "steps");
    state.activeRuntimeRunId = 7;
    state.activeGraphAgentRunId = 100;

    const result = await getExplanationForRun(7, {
      getDb: () => db as never,
    });
    expect(result).not.toBeNull();
    expect(result!.runtimeRunId).toBe(7);
    expect(result!.graphAgentRunId).toBe(100);
    expect(result!.agentKey).toBe("graph_agent_lite");
    expect(result!.userQuery).toBe("what links to seed?");
    expect(result!.status).toBe("completed");
    expect(result!.durationMs).toBe(5000);
    expect(result!.errorMessage).toBeNull();
    expect(result!.startedAt).toEqual(startedAt);
    expect(result!.completedAt).toEqual(completedAt);
    expect(result!.steps).toHaveLength(2);
    expect(result!.steps[0].stepKind).toBe("plan_retrieval_mode");
    expect(result!.steps[1].stepKind).toBe("retrieve");
  });

  it("surfaces a run row with no steps as an empty steps array", async () => {
    const { db, state } = makeFakeDb({
      runsByRuntimeRunId: {
        7: {
          id: 100,
          agentKey: "graph_agent_lite",
          userQuery: "q",
          status: "planning",
          durationMs: null,
          errorMessage: null,
          startedAt: new Date(),
          completedAt: null,
        },
      },
      stepsByGraphAgentRunId: {
        // no steps registered for runId 100
      },
    });
    state.queue.push("run", "steps");
    state.activeRuntimeRunId = 7;
    state.activeGraphAgentRunId = 100;
    const result = await getExplanationForRun(7, {
      getDb: () => db as never,
    });
    expect(result!.steps).toEqual([]);
  });

  it("surfaces failed runs with errorMessage populated", async () => {
    const { db, state } = makeFakeDb({
      runsByRuntimeRunId: {
        7: {
          id: 100,
          agentKey: "graph_agent_lite",
          userQuery: "q",
          status: "failed",
          durationMs: 1500,
          errorMessage: "model boom",
          startedAt: new Date(),
          completedAt: new Date(),
        },
      },
      stepsByGraphAgentRunId: { 100: [] },
    });
    state.queue.push("run", "steps");
    state.activeRuntimeRunId = 7;
    state.activeGraphAgentRunId = 100;
    const result = await getExplanationForRun(7, {
      getDb: () => db as never,
    });
    expect(result!.status).toBe("failed");
    expect(result!.errorMessage).toBe("model boom");
  });
});
