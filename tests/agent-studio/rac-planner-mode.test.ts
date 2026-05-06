/**
 * Retrofit P6 — RAC planner mode derivation tests.
 *
 * Pure decision-table tests covering every branch of the 8-mode lattice.
 */

import { describe, it, expect } from "vitest";
import {
  derivePlannerMode,
  RAC_PLANNER_MODES,
} from "../../server/agent-studio/services/rac/planner-mode";
import type { RetrievalPlan } from "../../server/agent-studio/services/rac/retrieval-planner";

function makePlan(types: string[]): RetrievalPlan {
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
    items: types.map((sourceType, idx) => ({
      source: {
        id: idx + 1,
        workspaceId: 1,
        profileId: 1,
        sourceType: sourceType as any,
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
      adapter: {} as any,
      embedding: null,
      skipReason: null,
    })),
    runnableCount: types.length,
    skipCounts: {
      disabled: 0,
      no_adapter: 0,
      in_process_pending: 0,
      embedding_unavailable: 0,
    },
    warnings: [],
  };
}

describe("derivePlannerMode — D-RAC-PLANNER lattice", () => {
  it("8 modes are stable strings", () => {
    expect(RAC_PLANNER_MODES).toEqual([
      "no_retrieval",
      "cag_only",
      "knowledge_retrieval",
      "multimodal_hybrid_retrieval",
      "tool_knowledge_retrieval",
      "hybrid_cag_rag",
      "hybrid_cag_tool_knowledge",
      "hybrid_cag_rag_tool_knowledge",
    ]);
  });

  it("no sources, no CAG → no_retrieval", () => {
    const r = derivePlannerMode({ plan: makePlan([]), hasCagPack: false });
    expect(r.mode).toBe("no_retrieval");
  });

  it("no sources, CAG pack → cag_only", () => {
    const r = derivePlannerMode({ plan: makePlan([]), hasCagPack: true });
    expect(r.mode).toBe("cag_only");
  });

  it("knowledge_unit only, no CAG → knowledge_retrieval", () => {
    const r = derivePlannerMode({
      plan: makePlan(["knowledge_unit"]),
      hasCagPack: false,
    });
    expect(r.mode).toBe("knowledge_retrieval");
  });

  it("knowledge_unit only, with CAG → hybrid_cag_rag", () => {
    const r = derivePlannerMode({
      plan: makePlan(["knowledge_unit", "vector_index"]),
      hasCagPack: true,
    });
    expect(r.mode).toBe("hybrid_cag_rag");
  });

  it("tool_knowledge only, no CAG → tool_knowledge_retrieval", () => {
    const r = derivePlannerMode({
      plan: makePlan(["tool_knowledge"]),
      hasCagPack: false,
    });
    expect(r.mode).toBe("tool_knowledge_retrieval");
  });

  it("tool_knowledge only, with CAG → hybrid_cag_tool_knowledge", () => {
    const r = derivePlannerMode({
      plan: makePlan(["tool_knowledge"]),
      hasCagPack: true,
    });
    expect(r.mode).toBe("hybrid_cag_tool_knowledge");
  });

  it("knowledge + tool_knowledge mixed, with CAG → hybrid_cag_rag_tool_knowledge", () => {
    const r = derivePlannerMode({
      plan: makePlan(["knowledge_unit", "tool_knowledge"]),
      hasCagPack: true,
    });
    expect(r.mode).toBe("hybrid_cag_rag_tool_knowledge");
  });

  it("knowledge + tool_knowledge mixed, no CAG → knowledge_retrieval (collapses)", () => {
    const r = derivePlannerMode({
      plan: makePlan(["knowledge_unit", "tool_knowledge"]),
      hasCagPack: false,
    });
    expect(r.mode).toBe("knowledge_retrieval");
  });

  it("multimodal hint wins regardless of CAG", () => {
    const r1 = derivePlannerMode({
      plan: makePlan(["multimodal"]),
      hasCagPack: false,
    });
    expect(r1.mode).toBe("multimodal_hybrid_retrieval");
    const r2 = derivePlannerMode({
      plan: makePlan(["multimodal"]),
      hasCagPack: true,
    });
    expect(r2.mode).toBe("multimodal_hybrid_retrieval");
  });

  it("reason string is non-empty for every mode", () => {
    const cases = [
      { plan: makePlan([]), hasCagPack: false },
      { plan: makePlan([]), hasCagPack: true },
      { plan: makePlan(["knowledge_unit"]), hasCagPack: false },
      { plan: makePlan(["knowledge_unit"]), hasCagPack: true },
      { plan: makePlan(["tool_knowledge"]), hasCagPack: false },
      { plan: makePlan(["tool_knowledge"]), hasCagPack: true },
      {
        plan: makePlan(["knowledge_unit", "tool_knowledge"]),
        hasCagPack: true,
      },
      { plan: makePlan(["multimodal"]), hasCagPack: false },
    ];
    for (const c of cases) {
      const r = derivePlannerMode(c);
      expect(r.reason).toBeTruthy();
      expect(typeof r.reason).toBe("string");
    }
  });

  it("skipped items are excluded from mode derivation", () => {
    const plan = makePlan(["knowledge_unit"]);
    plan.items[0].skipReason = "embedding_unavailable";
    const r = derivePlannerMode({ plan, hasCagPack: false });
    // Only runnable items count; the skipped knowledge_unit doesn't
    // pull the mode toward knowledge_retrieval.
    expect(r.mode).toBe("no_retrieval");
  });
});
