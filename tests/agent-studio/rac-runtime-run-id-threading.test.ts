/**
 * Phase 12.5 §6 — `runtimeRunId` threading through the RAC executor.
 *
 * Verifies that the caller-supplied `runtimeRunId` on
 * `ExecuteRetrievalInput` propagates to every adapter's
 * `RacRetrievalRequest.runtimeRunId`. GraphRAG-capable adapters
 * forward the field to `GraphRetrievalRouter`, where the Phase 12.5
 * §4 recorder uses it as the FK target for the
 * `ags_graph_skill_runtime_usages` row.
 *
 * Test surface mirrors `rac-retrieval-method-threading.test.ts` (Phase
 * 12 §3) so the threading contract has a single, consistent shape.
 */

import { describe, it, expect } from "vitest";
import { executeRetrieval } from "../../server/agent-studio/services/rac/retrieval-executor";
import type {
  RacIngestionAdapter,
  RacRetrievalRequest,
  RacRetrievalResult,
} from "../../server/agent-studio/services/rac/ingestion";
import type {
  RetrievalPlan,
  RetrievalPlanItem,
} from "../../server/agent-studio/services/rac/retrieval-planner";

function makeRecordingAdapter(): {
  adapter: RacIngestionAdapter;
  calls: RacRetrievalRequest[];
} {
  const calls: RacRetrievalRequest[] = [];
  const adapter: RacIngestionAdapter = {
    async search(input): Promise<RacRetrievalResult> {
      calls.push(input);
      return { chunks: [], latencyMs: 0, warnings: [] };
    },
    async health() {
      return { status: "ok" };
    },
    async validateIndex() {
      return { ok: true };
    },
    async preview() {
      return { sampleChunks: [], warnings: [] };
    },
  };
  return { adapter, calls };
}

function makePlan(
  items: Array<{
    sourceType: string;
    adapter: RacIngestionAdapter;
  }>,
): RetrievalPlan {
  return {
    workspaceId: 1,
    profile: {
      id: 1,
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      profileKey: "default",
      enabled: true,
      timeoutMs: null,
      notes: null,
      createdBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    workspaceEmbeddingDefault: null,
    items: items.map(
      (it, idx): RetrievalPlanItem => ({
        source: {
          id: idx + 1,
          workspaceId: 1,
          profileId: 1,
          sourceType: it.sourceType as any,
          ownerModule: "agentStudio",
          externalRefId: null,
          displayName: null,
          enabled: true,
          priority: 0,
          embeddingProviderConnectionId: null,
          embeddingModelRef: null,
          embeddingModelDim: null,
          embeddingModelVersion: null,
          chunkSizeOverride: null,
          chunkOverlapOverride: null,
          metadataJson: null,
          createdBy: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        adapter: it.adapter,
        embedding: null,
        skipReason: null,
      }),
    ),
    runnableCount: items.length,
    skipCounts: {
      disabled: 0,
      no_adapter: 0,
      in_process_pending: 0,
      embedding_unavailable: 0,
    },
    warnings: [],
  };
}

describe("Phase 12.5 §6 — runtimeRunId threading", () => {
  it("threads ExecuteRetrievalInput.runtimeRunId into every adapter request", async () => {
    const { adapter, calls } = makeRecordingAdapter();
    const plan = makePlan([
      { sourceType: "graph_index", adapter },
      { sourceType: "vector_index", adapter },
    ]);
    await executeRetrieval({
      plan,
      query: "test",
      topK: 5,
      runtimeRunId: 12345,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].runtimeRunId).toBe(12345);
    expect(calls[1].runtimeRunId).toBe(12345);
  });

  it("omits runtimeRunId on requests when caller didn't supply one", async () => {
    const { adapter, calls } = makeRecordingAdapter();
    const plan = makePlan([{ sourceType: "graph_index", adapter }]);
    await executeRetrieval({ plan, query: "test", topK: 5 });
    expect(calls[0].runtimeRunId).toBeUndefined();
  });

  it("preserves runtimeRunId=0 as a meaningful value (not coerced to undefined)", async () => {
    // The graph-agent wiring's RuntimeTraceWriterAdapter returns
    // `{ runId: 0 }` as a degraded-mode sentinel when the trace write
    // failed (see wiring.ts line 160). The threading layer must pass
    // the value through verbatim; the §4 recorder then decides on a
    // per-event basis whether to act on it (today: writes the row, FK
    // resolution fails since 0 isn't a real run id — surfaced as a
    // silent insert error caught by the recorder's no-throw contract).
    const { adapter, calls } = makeRecordingAdapter();
    const plan = makePlan([{ sourceType: "graph_index", adapter }]);
    await executeRetrieval({
      plan,
      query: "test",
      topK: 5,
      runtimeRunId: 0,
    });
    expect(calls[0].runtimeRunId).toBe(0);
  });
});
