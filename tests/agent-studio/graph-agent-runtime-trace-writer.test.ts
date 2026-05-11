/**
 * Phase 14 §6/§7 — runtime-trace writer + projection-intent integration.
 *
 * Verifies that `RuntimeTraceWriterAdapter` records a `runtime_trace`
 * projection-intent row on finalize. Mocks `server/agent-studio/repository`
 * to keep the test DB-free.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const repoMock = vi.hoisted(() => ({
  appendRuntimeRun: vi.fn(async (_row: Record<string, unknown>) => ({ id: 77 })),
  updateRuntimeRun: vi.fn(
    async (_id: number, _patch: Record<string, unknown>) => undefined,
  ),
}));

vi.mock("../../server/agent-studio/repository", () => repoMock);

import { RuntimeTraceWriterAdapter } from "../../server/agent-studio/services/graph-agent/wiring";
import type { RecordTraceProjectionIntentInput } from "../../server/agent-studio/services/graph-agent/projection-events";

describe("RuntimeTraceWriterAdapter — Phase 14 §6/§7 projection-intent wiring", () => {
  beforeEach(() => {
    repoMock.appendRuntimeRun.mockClear();
    repoMock.updateRuntimeRun.mockClear();
  });

  it("records a runtime_trace projection intent on finalize when runId > 0", async () => {
    const intentWriter = vi.fn(
      async (_input: RecordTraceProjectionIntentInput) =>
        ({
          id: 1,
          eventKind: "runtime_trace" as const,
          runtimeRunId: 77,
          graphAgentRunId: null,
          payload: {},
          applied: false,
          neo4jRefs: null,
          appliedAt: null,
          lastError: null,
          createdAt: new Date(),
        }),
    );

    const adapter = new RuntimeTraceWriterAdapter({
      projectionIntentWriter: intentWriter,
    });

    const { runId } = await adapter.startRun({
      agentKey: "graph_agent_lite",
      userId: 1,
      triggerType: "manual",
    });
    expect(runId).toBe(77);

    await adapter.finalizeRun(77, "completed", 1234);

    expect(repoMock.updateRuntimeRun).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        status: "completed",
        durationMs: 1234,
        completedAt: expect.any(Date),
      }),
    );

    expect(intentWriter).toHaveBeenCalledTimes(1);
    const [intentInput] = intentWriter.mock.calls[0];
    expect(intentInput).toMatchObject({
      eventKind: "runtime_trace",
      runtimeRunId: 77,
    });
    expect(intentInput.payload).toMatchObject({
      status: "completed",
      durationMs: 1234,
      errorReason: null,
    });
  });

  it("includes errorReason in the payload when the run failed", async () => {
    const intentWriter = vi.fn(async () => ({} as never));
    const adapter = new RuntimeTraceWriterAdapter({
      projectionIntentWriter: intentWriter as never,
    });

    await adapter.finalizeRun(77, "failed", 99, "tool timeout");

    const [intentInput] = intentWriter.mock.calls[0] as [
      RecordTraceProjectionIntentInput,
    ];
    expect(intentInput.payload).toMatchObject({
      status: "failed",
      errorReason: "tool timeout",
    });
  });

  it("skips the projection intent when runId is 0 (dev-fallback path)", async () => {
    const intentWriter = vi.fn();
    const adapter = new RuntimeTraceWriterAdapter({
      projectionIntentWriter: intentWriter as never,
    });

    await adapter.finalizeRun(0, "completed", 50);

    expect(intentWriter).not.toHaveBeenCalled();
    expect(repoMock.updateRuntimeRun).not.toHaveBeenCalled();
  });

  it("skips the projection intent when recordProjectionIntent=false", async () => {
    const intentWriter = vi.fn();
    const adapter = new RuntimeTraceWriterAdapter({
      recordProjectionIntent: false,
      projectionIntentWriter: intentWriter as never,
    });

    await adapter.finalizeRun(77, "completed", 50);

    expect(intentWriter).not.toHaveBeenCalled();
    // The run row is still updated.
    expect(repoMock.updateRuntimeRun).toHaveBeenCalledTimes(1);
  });

  it("does not bubble projection-intent errors — finalize resolves even when intent writer throws", async () => {
    const intentWriter = vi.fn(async () => {
      throw new Error("ASDB hiccup");
    });
    const adapter = new RuntimeTraceWriterAdapter({
      projectionIntentWriter: intentWriter as never,
    });

    await expect(
      adapter.finalizeRun(77, "completed", 50),
    ).resolves.toBeUndefined();
    expect(intentWriter).toHaveBeenCalledTimes(1);
    // The run-row update succeeded before the projection intent failed.
    expect(repoMock.updateRuntimeRun).toHaveBeenCalledTimes(1);
  });
});
