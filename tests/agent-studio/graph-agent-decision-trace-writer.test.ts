/**
 * Phase 14 §6/§7 — decision-trace writer + projection-intent integration.
 *
 * Verifies that `createGraphAgentDecisionTraceWriter()` records a
 * `decision_trace` projection-intent row when the run finalises, and
 * that the writer degrades gracefully when:
 *   - the projection-intent writer throws (intent is non-fatal)
 *   - the run has no `runtimeRunId` (intent is skipped)
 *   - `recordProjectionIntent` is explicitly disabled (intent is skipped)
 *
 * Pure unit coverage via fake DB.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createGraphAgentDecisionTraceWriter,
  GraphAgentDecisionTraceUnavailableError,
} from "../../server/agent-studio/services/graph-agent/decision-trace-writer";
import type { RecordTraceProjectionIntentInput } from "../../server/agent-studio/services/graph-agent/projection-events";

interface InsertCall {
  table: string;
  values: Record<string, unknown>;
}

interface UpdateCall {
  table: string;
  set: Record<string, unknown>;
}

function tableName(t: unknown): string {
  const sym = Object.getOwnPropertySymbols(t as object).find(
    (s) => s.description === "drizzle:Name",
  );
  return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
}

function makeFakeDb(runtimeRunId: number | null) {
  const inserts: InsertCall[] = [];
  const updates: UpdateCall[] = [];

  const db = {
    insert: vi.fn((table: unknown) => {
      const name = tableName(table);
      return {
        values: (vals: Record<string, unknown>) => {
          inserts.push({ table: name, values: vals });
          return {
            returning: async () => [{ id: 555 }],
          };
        },
      };
    }),
    update: vi.fn((table: unknown) => {
      const name = tableName(table);
      return {
        set: (patch: Record<string, unknown>) => {
          updates.push({ table: name, set: patch });
          return {
            where: () => ({
              returning: async () => [
                {
                  id: 555,
                  agentKey: "graph_agent_lite",
                  runtimeRunId,
                },
              ],
            }),
          };
        },
      };
    }),
  };

  return { db, inserts, updates };
}

describe("decision-trace writer — Phase 14 §6/§7 projection-intent wiring", () => {
  it("records a decision_trace projection intent on finalize when runtimeRunId is set", async () => {
    const { db } = makeFakeDb(42);
    const intentWriter = vi.fn(
      async (_input: RecordTraceProjectionIntentInput) =>
        ({
          id: 1,
          eventKind: "decision_trace" as const,
          runtimeRunId: 42,
          graphAgentRunId: 555,
          payload: {},
          applied: false,
          neo4jRefs: null,
          appliedAt: null,
          lastError: null,
          createdAt: new Date(),
        }),
    );

    const writer = createGraphAgentDecisionTraceWriter({
      getDb: () => db as never,
      projectionIntentWriter: intentWriter,
    });

    await writer.finalizeGraphAgentRun({
      graphAgentRunId: 555,
      status: "completed",
      durationMs: 1234,
    });

    expect(intentWriter).toHaveBeenCalledTimes(1);
    const [intentInput] = intentWriter.mock.calls[0];
    expect(intentInput).toMatchObject({
      eventKind: "decision_trace",
      runtimeRunId: 42,
      graphAgentRunId: 555,
    });
    expect(intentInput.payload).toMatchObject({
      agentKey: "graph_agent_lite",
      status: "completed",
      durationMs: 1234,
      errorMessage: null,
    });
  });

  it("includes errorMessage in the payload when the run failed", async () => {
    const { db } = makeFakeDb(42);
    const intentWriter = vi.fn(async () =>
      ({ id: 1 } as never as ReturnType<typeof Object>),
    );
    const writer = createGraphAgentDecisionTraceWriter({
      getDb: () => db as never,
      projectionIntentWriter: intentWriter as never,
    });

    await writer.finalizeGraphAgentRun({
      graphAgentRunId: 555,
      status: "failed",
      durationMs: 99,
      errorMessage: "model boom",
    });

    const [intentInput] = intentWriter.mock.calls[0] as [
      RecordTraceProjectionIntentInput,
    ];
    expect(intentInput.payload).toMatchObject({
      status: "failed",
      errorMessage: "model boom",
    });
  });

  it("skips the projection intent when runtimeRunId is null (orphan trace)", async () => {
    const { db } = makeFakeDb(null);
    const intentWriter = vi.fn();
    const writer = createGraphAgentDecisionTraceWriter({
      getDb: () => db as never,
      projectionIntentWriter: intentWriter as never,
    });

    await writer.finalizeGraphAgentRun({
      graphAgentRunId: 555,
      status: "completed",
      durationMs: 50,
    });

    expect(intentWriter).not.toHaveBeenCalled();
  });

  it("skips the projection intent when recordProjectionIntent=false", async () => {
    const { db } = makeFakeDb(42);
    const intentWriter = vi.fn();
    const writer = createGraphAgentDecisionTraceWriter({
      getDb: () => db as never,
      recordProjectionIntent: false,
      projectionIntentWriter: intentWriter as never,
    });

    await writer.finalizeGraphAgentRun({
      graphAgentRunId: 555,
      status: "completed",
      durationMs: 50,
    });

    expect(intentWriter).not.toHaveBeenCalled();
  });

  it("does not bubble projection-intent errors — finalize succeeds even when intent writer throws", async () => {
    const { db } = makeFakeDb(42);
    const intentWriter = vi.fn(async () => {
      throw new Error("ASDB hiccup");
    });
    const writer = createGraphAgentDecisionTraceWriter({
      getDb: () => db as never,
      projectionIntentWriter: intentWriter as never,
    });

    await expect(
      writer.finalizeGraphAgentRun({
        graphAgentRunId: 555,
        status: "completed",
        durationMs: 50,
      }),
    ).resolves.toBeUndefined();
    expect(intentWriter).toHaveBeenCalledTimes(1);
  });

  it("throws GraphAgentDecisionTraceUnavailableError when ASDB getDb returns null", async () => {
    const writer = createGraphAgentDecisionTraceWriter({
      getDb: () => null as never,
    });
    await expect(
      writer.startGraphAgentRun({
        agentKey: "graph_agent_lite",
        userQuery: "q",
      }),
    ).rejects.toBeInstanceOf(GraphAgentDecisionTraceUnavailableError);
  });
});
