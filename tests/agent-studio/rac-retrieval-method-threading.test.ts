/**
 * Phase 12 §3 — `retrievalMethod` threading through the RAC executor.
 *
 * Verifies the executor reads `metadataJson.retrievalMethod` off
 * `graph_index` sources and threads it into the adapter request, and
 * that the GraphRAG stub surfaces the method in its `source_unavailable`
 * warning so operators can debug which method was attempted.
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
import { graphragAdapter } from "../../server/agent-studio/services/rac/ingestion/graphrag-adapter";

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
    metadataJson?: Record<string, unknown> | null;
    adapter?: RacIngestionAdapter;
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
          metadataJson: it.metadataJson ?? null,
          createdBy: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        adapter: it.adapter ?? graphragAdapter,
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

describe("Phase 12 §3 — retrievalMethod threading", () => {
  it("executor threads metadataJson.retrievalMethod into adapter request for graph_index sources", async () => {
    const { adapter, calls } = makeRecordingAdapter();
    const plan = makePlan([
      {
        sourceType: "graph_index",
        metadataJson: { retrievalMethod: "traversal" },
        adapter,
      },
    ]);
    await executeRetrieval({ plan, query: "test", topK: 5 });
    expect(calls).toHaveLength(1);
    expect(calls[0].retrievalMethod).toBe("traversal");
  });

  it("executor omits retrievalMethod when source carries none", async () => {
    const { adapter, calls } = makeRecordingAdapter();
    const plan = makePlan([
      {
        sourceType: "graph_index",
        metadataJson: null,
        adapter,
      },
    ]);
    await executeRetrieval({ plan, query: "test", topK: 5 });
    expect(calls[0].retrievalMethod).toBeUndefined();
  });

  it("executor omits retrievalMethod for non-graph sources even when metadataJson carries one", async () => {
    const { adapter, calls } = makeRecordingAdapter();
    const plan = makePlan([
      {
        sourceType: "vector_index",
        metadataJson: { retrievalMethod: "traversal" },
        adapter,
      },
    ]);
    await executeRetrieval({ plan, query: "test", topK: 5 });
    expect(calls[0].retrievalMethod).toBeUndefined();
  });

  it("executor passes through arbitrary string values (validation lives in planner-mode)", async () => {
    // Loose typing on the request lets adapters do their own
    // validation. Unrecognized strings reach the adapter; planner-mode
    // separately ignores them for routing.
    const { adapter, calls } = makeRecordingAdapter();
    const plan = makePlan([
      {
        sourceType: "graph_index",
        metadataJson: { retrievalMethod: "made_up_value" },
        adapter,
      },
    ]);
    await executeRetrieval({ plan, query: "test", topK: 5 });
    expect(calls[0].retrievalMethod).toBe("made_up_value");
  });

  it("graphragAdapter surfaces the retrievalMethod when method is unrecognized (stub fallback)", async () => {
    // Phase 12 §5 dispatches recognized methods through the router; the
    // stub remains for unrecognized strings so operator misconfiguration
    // doesn't silently route somewhere unexpected.
    const result = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 42,
      query: "test",
      topK: 5,
      retrievalMethod: "made_up_method",
    });
    expect(result.chunks).toEqual([]);
    expect(result.warnings[0]).toContain("source=42");
    expect(result.warnings[0]).toContain("method=made_up_method");
    expect(result.warnings[0]).toContain("source_unavailable");
  });

  it("graphragAdapter warning omits method= tag when retrievalMethod is absent (back-compat)", async () => {
    const result = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 42,
      query: "test",
      topK: 5,
    });
    expect(result.warnings[0]).toContain("source=42");
    expect(result.warnings[0]).not.toContain("method=");
  });
});
