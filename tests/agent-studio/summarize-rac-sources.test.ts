/**
 * Phase A §T-A.15 — `summarizeRacSources` lockstep.
 *
 * Two-axis closed-taxonomy aggregator over `agsRacSources`.
 * 24th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  summarizeRacSources,
  type SummarizeRacSourcesInput,
} from "../../server/agent-studio/services/rac/sources/rac-source-summary.js";
import {
  RAC_OWNER_MODULES,
  RAC_SOURCE_TYPES,
} from "../../server/agent-studio/services/rac/sources/types.js";

function makeRow(
  overrides: Partial<SummarizeRacSourcesInput> = {},
): SummarizeRacSourcesInput {
  return {
    workspaceId: 1,
    profileId: 1,
    sourceType: "knowledge_unit",
    ownerModule: "agentStudio",
    enabled: true,
    priority: 50,
    embeddingProviderConnectionId: null,
    chunkSizeOverride: null,
    ...overrides,
  };
}

describe("summarizeRacSources — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeRacSources([]);
    expect(s.total).toBe(0);
    expect(s.enabledCount).toBe(0);
    expect(s.disabledCount).toBe(0);
    expect(s.withEmbeddingProviderCount).toBe(0);
    expect(s.withChunkOverrideCount).toBe(0);
    expect(s.unknownSourceTypeCount).toBe(0);
    expect(s.unknownOwnerModuleCount).toBe(0);
    expect(s.distinctProfileCount).toBe(0);
    expect(s.distinctWorkspaceCount).toBe(0);
    expect(s.priorityStats).toBeNull();
  });

  it("both axes zero-filled", () => {
    const s = summarizeRacSources([]);
    for (const t of RAC_SOURCE_TYPES) expect(s.bySourceType[t]).toBe(0);
    for (const m of RAC_OWNER_MODULES) expect(s.byOwnerModule[m]).toBe(0);
  });
});

describe("summarizeRacSources — closed-taxonomy axes", () => {
  it("counts each source type and owner module", () => {
    const s = summarizeRacSources([
      makeRow({ sourceType: "knowledge_unit", ownerModule: "agentStudio" }),
      makeRow({ sourceType: "knowledge_unit", ownerModule: "agentStudio" }),
      makeRow({ sourceType: "graph_index", ownerModule: "dataAnalysis" }),
      makeRow({ sourceType: "cag_pack", ownerModule: "agentStudio" }),
    ]);
    expect(s.bySourceType.knowledge_unit).toBe(2);
    expect(s.bySourceType.graph_index).toBe(1);
    expect(s.bySourceType.cag_pack).toBe(1);
    expect(s.byOwnerModule.agentStudio).toBe(3);
    expect(s.byOwnerModule.dataAnalysis).toBe(1);
  });

  it("partitions unknown source types separately", () => {
    const s = summarizeRacSources([
      makeRow({ sourceType: "knowledge_unit" }),
      makeRow({ sourceType: "future_source_type" }),
    ]);
    expect(s.unknownSourceTypeCount).toBe(1);
    expect(s.bySourceType.knowledge_unit).toBe(1);
  });

  it("partitions unknown owner modules separately", () => {
    const s = summarizeRacSources([
      makeRow({ ownerModule: "agentStudio" }),
      makeRow({ ownerModule: "future_module" }),
    ]);
    expect(s.unknownOwnerModuleCount).toBe(1);
    expect(s.byOwnerModule.agentStudio).toBe(1);
  });
});

describe("summarizeRacSources — enabled/disabled partition", () => {
  it("sums to total", () => {
    const s = summarizeRacSources([
      makeRow({ enabled: true }),
      makeRow({ enabled: true }),
      makeRow({ enabled: false }),
    ]);
    expect(s.enabledCount).toBe(2);
    expect(s.disabledCount).toBe(1);
    expect(s.enabledCount + s.disabledCount).toBe(s.total);
  });
});

describe("summarizeRacSources — binding gauges", () => {
  it("withEmbeddingProvider counts non-null bindings", () => {
    const s = summarizeRacSources([
      makeRow({ embeddingProviderConnectionId: null }),
      makeRow({ embeddingProviderConnectionId: 0 }), // 0 valid
      makeRow({ embeddingProviderConnectionId: 5 }),
    ]);
    expect(s.withEmbeddingProviderCount).toBe(2);
  });

  it("withChunkOverride counts non-null overrides", () => {
    const s = summarizeRacSources([
      makeRow({ chunkSizeOverride: null }),
      makeRow({ chunkSizeOverride: 1024 }),
    ]);
    expect(s.withChunkOverrideCount).toBe(1);
  });
});

describe("summarizeRacSources — distinct counts", () => {
  it("tracks distinct profile and workspace ids", () => {
    const s = summarizeRacSources([
      makeRow({ profileId: 1, workspaceId: 1 }),
      makeRow({ profileId: 1, workspaceId: 2 }),
      makeRow({ profileId: 2, workspaceId: 1 }),
    ]);
    expect(s.distinctProfileCount).toBe(2);
    expect(s.distinctWorkspaceCount).toBe(2);
  });
});

describe("summarizeRacSources — priority stats", () => {
  it("computes stats across all rows", () => {
    const s = summarizeRacSources([
      makeRow({ priority: 10 }),
      makeRow({ priority: 50 }),
      makeRow({ priority: 90 }),
    ]);
    expect(s.priorityStats!.count).toBe(3);
    expect(s.priorityStats!.sum).toBe(150);
    expect(s.priorityStats!.mean).toBe(50);
    expect(s.priorityStats!.min).toBe(10);
    expect(s.priorityStats!.max).toBe(90);
  });
});
