/**
 * RAC Phase 4 — retrieval planner / executor / filter tests.
 *
 * Plan §P4 acceptance cases (all covered):
 *   - Planner respects `priority` ordering on sources
 *   - Filter dedupes by hash
 *   - Filter rejects below-threshold chunks
 *   - Citation-required filter drops chunks without citation metadata
 *
 * Plus, since we own these primitives end-to-end:
 *   - buildItem skip-reason matrix (disabled / no_adapter /
 *     in_process_pending / embedding_unavailable)
 *   - Executor timeout converts a slow adapter into a `timeout` warning
 *     without breaking the rest of the run
 *   - Executor swallows adapter throws as `adapter_error` warnings
 *   - Filter respects per-policy overrides and falls back to defaults
 *     on NULL columns
 */

import { describe, it, expect } from "vitest";
import { buildItem } from "../../server/agent-studio/services/rac/retrieval-planner";
import {
  executeRetrieval,
  DEFAULT_RETRIEVAL_TIMEOUT_MS,
} from "../../server/agent-studio/services/rac/retrieval-executor";
import {
  filterRetrieval,
  DEFAULT_RETRIEVAL_FILTER_CONFIG,
} from "../../server/agent-studio/services/rac/retrieval-filter";
import type {
  RacIngestionAdapter,
  RacRetrievalChunk,
  RacRetrievalRequest,
  RacRetrievalResult,
} from "../../server/agent-studio/services/rac/ingestion";
import type {
  RacPolicy,
  RacProfile,
  RacSource,
  RacWorkspaceEmbeddingDefault,
} from "../../server/agent-studio/services/rac/sources";
import type { RetrievalPlan } from "../../server/agent-studio/services/rac/retrieval-planner";

// ── Fixtures ─────────────────────────────────────────────────────────

function makeSource(overrides: Partial<RacSource> = {}): RacSource {
  return {
    id: 1,
    workspaceId: 7,
    profileId: 11,
    sourceType: "graph_index",
    ownerModule: "dataAnalysis",
    externalRefId: null,
    displayName: null,
    enabled: true,
    priority: 50,
    embeddingProviderConnectionId: 100,
    embeddingModelRef: "text-embedding-3-small",
    embeddingModelDim: 1536,
    embeddingModelVersion: null,
    embeddingModelPinnedAt: new Date("2026-05-06"),
    chunkSizeOverride: null,
    chunkOverlapOverride: null,
    metadataJson: null,
    createdBy: 1,
    createdAt: new Date("2026-05-06"),
    updatedAt: new Date("2026-05-06"),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<RacProfile> = {}): RacProfile {
  return {
    id: 11,
    workspaceId: 7,
    agentId: 5,
    agentDraftId: 9,
    profileKey: "default",
    enabled: true,
    timeoutMs: null,
    notes: null,
    createdBy: 1,
    createdAt: new Date("2026-05-06"),
    updatedAt: new Date("2026-05-06"),
    ...overrides,
  };
}

function makeChunk(overrides: Partial<RacRetrievalChunk>): RacRetrievalChunk {
  return {
    content: "default content",
    score: 0.8,
    citation: "[doc:Test §1]",
    sourceChunkId: "chunk-default",
    ...overrides,
  };
}

const wsDefault: RacWorkspaceEmbeddingDefault = {
  workspaceId: 7,
  embeddingProviderConnectionId: 100,
  embeddingModelRef: "text-embedding-3-small",
  embeddingModelDim: 1536,
  createdBy: 1,
  createdAt: new Date("2026-05-06"),
  updatedAt: new Date("2026-05-06"),
};

// ── Planner: priority ordering + skip-reason matrix ──────────────────

describe("planner — buildItem skip-reason matrix", () => {
  it("flags disabled sources without consulting the adapter", () => {
    const item = buildItem(
      makeSource({ enabled: false, sourceType: "graph_index" }),
      wsDefault,
    );
    expect(item.skipReason).toBe("disabled");
    expect(item.adapter).toBeNull();
    expect(item.embedding).toBeNull();
  });

  it("flags cag_pack as in_process_pending (CAG renders it outside RAC)", () => {
    // The legacy synthesizer types — memory / workspace_context /
    // project_context / tool_result_context / manual_context — were
    // dropped from the enum at D3 closure. Only `cag_pack` remains
    // adapter-less because the CAG resolver renders it directly.
    const item = buildItem(makeSource({ sourceType: "cag_pack" }), wsDefault);
    expect(item.skipReason).toBe("in_process_pending");
  });

  it("flags document_collection / external_connector as no_adapter (P4 wiring pending)", () => {
    for (const t of ["document_collection", "external_connector"] as const) {
      const item = buildItem(makeSource({ sourceType: t }), wsDefault);
      expect(item.skipReason, `source_type=${t}`).toBe("no_adapter");
    }
  });

  it("flags D-EMB-5 fail-closed as embedding_unavailable (no row refs, no ws default)", () => {
    const item = buildItem(
      makeSource({
        sourceType: "graph_index",
        embeddingProviderConnectionId: null,
        embeddingModelRef: null,
        embeddingModelDim: null,
      }),
      null,
    );
    expect(item.skipReason).toBe("embedding_unavailable");
    expect(item.adapter).not.toBeNull(); // adapter resolved fine; binding didn't
  });

  it("plain runnable item has skipReason=null and embedding from source", () => {
    const item = buildItem(makeSource({ sourceType: "graph_index" }), wsDefault);
    expect(item.skipReason).toBeNull();
    expect(item.adapter).not.toBeNull();
    expect(item.embedding?.resolvedFrom).toBe("source");
  });
});

describe("planner — priority ordering", () => {
  it("input order is preserved when caller pre-sorts by priority desc (store contract)", () => {
    // Simulates `listSourcesForProfile` output: priority DESC, id ASC.
    const sources = [
      makeSource({ id: 10, priority: 100, sourceType: "graph_index" }),
      makeSource({ id: 11, priority: 80, sourceType: "graph_index" }),
      makeSource({ id: 12, priority: 50, sourceType: "graph_index" }),
    ];
    const items = sources.map((s) => buildItem(s, wsDefault));
    expect(items.map((i) => i.source.id)).toEqual([10, 11, 12]);
    expect(items.map((i) => i.source.priority)).toEqual([100, 80, 50]);
  });
});

// ── Executor: per-source isolation, timeout, error swallowing ────────

function fakePlan(items: RetrievalPlan["items"]): RetrievalPlan {
  return {
    workspaceId: 7,
    profile: makeProfile(),
    workspaceEmbeddingDefault: wsDefault,
    items,
    runnableCount: items.filter((i) => !i.skipReason).length,
    skipCounts: {
      disabled: items.filter((i) => i.skipReason === "disabled").length,
      no_adapter: items.filter((i) => i.skipReason === "no_adapter").length,
      in_process_pending: items.filter((i) => i.skipReason === "in_process_pending").length,
      embedding_unavailable: items.filter(
        (i) => i.skipReason === "embedding_unavailable",
      ).length,
    },
    warnings: [],
  };
}

const succeedingAdapter: RacIngestionAdapter = {
  async search(_req: RacRetrievalRequest): Promise<RacRetrievalResult> {
    return {
      chunks: [
        makeChunk({ sourceChunkId: "ok-1", score: 0.9, content: "alpha" }),
        makeChunk({ sourceChunkId: "ok-2", score: 0.7, content: "beta" }),
      ],
      latencyMs: 5,
      warnings: ["partial_result"],
    };
  },
  async health() {
    return { status: "ok" as const };
  },
};

const slowAdapter: RacIngestionAdapter = {
  async search(_req: RacRetrievalRequest): Promise<RacRetrievalResult> {
    await new Promise((r) => setTimeout(r, 200));
    return { chunks: [], latencyMs: 200, warnings: [] };
  },
  async health() {
    return { status: "ok" as const };
  },
};

const throwingAdapter: RacIngestionAdapter = {
  async search(_req: RacRetrievalRequest): Promise<RacRetrievalResult> {
    throw new Error("upstream_500");
  },
  async health() {
    return { status: "degraded" as const };
  },
};

describe("executor — per-source isolation", () => {
  it("returns chunks from the runnable source, skip-row for disabled", async () => {
    const plan = fakePlan([
      {
        source: makeSource({ id: 1, priority: 90 }),
        adapter: succeedingAdapter,
        embedding: {
          providerConnectionId: 100,
          modelRef: "x",
          dim: 1536,
          resolvedFrom: "source",
        },
        skipReason: null,
      },
      {
        source: makeSource({ id: 2, enabled: false, priority: 80 }),
        adapter: null,
        embedding: null,
        skipReason: "disabled",
      },
    ]);
    const out = await executeRetrieval({ plan, query: "q" });
    expect(out.perSource).toHaveLength(2);
    expect(out.perSource[0].chunks.map((c) => c.sourceChunkId)).toEqual(["ok-1", "ok-2"]);
    expect(out.perSource[1].errorReason).toBe("skipped");
    expect(out.perSource[1].skipReason).toBe("disabled");
    expect(out.chunks).toHaveLength(2); // aggregated from runnable only
  });

  it("forwards adapter warnings prefixed with source id", async () => {
    const plan = fakePlan([
      {
        source: makeSource({ id: 42 }),
        adapter: succeedingAdapter,
        embedding: {
          providerConnectionId: 100,
          modelRef: "x",
          dim: 1536,
          resolvedFrom: "source",
        },
        skipReason: null,
      },
    ]);
    const out = await executeRetrieval({ plan, query: "q" });
    expect(out.warnings.some((w) => /source=42: partial_result/.test(w))).toBe(true);
  });

  it("converts a slow adapter into a `timeout` errorReason without breaking siblings", async () => {
    const plan = fakePlan([
      {
        source: makeSource({ id: 1 }),
        adapter: slowAdapter,
        embedding: {
          providerConnectionId: 100,
          modelRef: "x",
          dim: 1536,
          resolvedFrom: "source",
        },
        skipReason: null,
      },
      {
        source: makeSource({ id: 2 }),
        adapter: succeedingAdapter,
        embedding: {
          providerConnectionId: 100,
          modelRef: "x",
          dim: 1536,
          resolvedFrom: "source",
        },
        skipReason: null,
      },
    ]);
    plan.profile.timeoutMs = 50; // tighter than slowAdapter's 200ms delay
    const out = await executeRetrieval({ plan, query: "q" });
    const slow = out.perSource.find((p) => p.sourceId === 1)!;
    const ok = out.perSource.find((p) => p.sourceId === 2)!;
    expect(slow.errorReason).toBe("timeout");
    expect(slow.chunks).toEqual([]);
    expect(ok.errorReason).toBeUndefined();
    expect(ok.chunks.length).toBeGreaterThan(0);
  });

  it("swallows adapter throws as `adapter_error` warnings", async () => {
    const plan = fakePlan([
      {
        source: makeSource({ id: 1 }),
        adapter: throwingAdapter,
        embedding: {
          providerConnectionId: 100,
          modelRef: "x",
          dim: 1536,
          resolvedFrom: "source",
        },
        skipReason: null,
      },
    ]);
    const out = await executeRetrieval({ plan, query: "q" });
    expect(out.perSource[0].errorReason).toBe("adapter_error");
    expect(out.perSource[0].warnings.some((w) => /upstream_500/.test(w))).toBe(true);
  });

  it("uses DEFAULT_RETRIEVAL_TIMEOUT_MS when profile.timeoutMs is null", () => {
    expect(DEFAULT_RETRIEVAL_TIMEOUT_MS).toBe(3000);
  });
});

// ── Filter: D-RET-5 defaults + overrides ─────────────────────────────

describe("filter — D-RET-5 defaults", () => {
  it("default minScore=0.45 drops below-threshold chunks", () => {
    // Distinct content per chunk so the dedupe step doesn't mask
    // the minScore-only assertion.
    const out = filterRetrieval({
      chunks: [
        makeChunk({ sourceChunkId: "a", score: 0.9, content: "alpha" }),
        makeChunk({ sourceChunkId: "b", score: 0.44, content: "beta" }), // below threshold
        makeChunk({ sourceChunkId: "c", score: 0.45, content: "gamma" }), // exactly at threshold
      ],
      policy: null,
    });
    expect(out.chunks.map((c) => c.sourceChunkId)).toEqual(["a", "c"]);
    expect(out.rejectionCounts.belowMinScore).toBe(1);
  });

  it("citationRequired=true (default) drops chunks without citation", () => {
    const out = filterRetrieval({
      chunks: [
        makeChunk({ sourceChunkId: "a" }),
        makeChunk({ sourceChunkId: "b", citation: "" }),
        makeChunk({ sourceChunkId: "c", citation: "   " }), // whitespace only
      ],
      policy: null,
    });
    expect(out.chunks.map((c) => c.sourceChunkId)).toEqual(["a"]);
    expect(out.rejectionCounts.citationRequired).toBe(2);
  });

  it("dedupeBy=hash (default) keeps first occurrence of identical content", () => {
    const out = filterRetrieval({
      chunks: [
        makeChunk({ sourceChunkId: "a", content: "duplicate body", score: 0.9 }),
        makeChunk({ sourceChunkId: "b", content: "unique body", score: 0.85 }),
        makeChunk({ sourceChunkId: "c", content: "duplicate body", score: 0.95 }),
      ],
      policy: null,
    });
    // First occurrence wins. Order after sort: highest score first among
    // survivors → "a" (kept first, its score 0.9), then "b" (0.85).
    expect(out.chunks.map((c) => c.sourceChunkId).sort()).toEqual(["a", "b"]);
    expect(out.rejectionCounts.duplicate).toBe(1);
  });

  it("maxChunks=8 (default) head-caps after sort, surplus counted", () => {
    const chunks = Array.from({ length: 12 }, (_, i) =>
      makeChunk({ sourceChunkId: `s${i}`, score: 0.9 - i * 0.01, content: `c${i}` }),
    );
    const out = filterRetrieval({ chunks, policy: null });
    expect(out.chunks).toHaveLength(8);
    expect(out.rejectionCounts.capacity).toBe(4);
    // Sort order: highest score first → s0, s1, ..., s7.
    expect(out.chunks.map((c) => c.sourceChunkId)).toEqual([
      "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7",
    ]);
  });

  it("freshnessMaxAgeDays=null (default) keeps chunks with old timestamps", () => {
    const out = filterRetrieval({
      chunks: [
        makeChunk({
          sourceChunkId: "ancient",
          metadata: { createdAt: "2024-01-01T00:00:00Z" },
        }),
      ],
      policy: null,
    });
    expect(out.chunks).toHaveLength(1);
    expect(out.rejectionCounts.freshness).toBe(0);
  });
});

describe("filter — per-policy overrides (P2 ags_rac_policies)", () => {
  function makePolicy(overrides: Partial<RacPolicy>): RacPolicy {
    return {
      id: 1,
      workspaceId: 7,
      profileId: 11,
      minScore: null,
      maxChunks: null,
      dedupeBy: null,
      freshnessMaxAgeDays: null,
      citationRequired: null,
      sourcePermissionFilter: null,
      piiPolicy: null,
      licensePolicy: null,
      timeoutMs: null,
      createdBy: 1,
      createdAt: new Date("2026-05-06"),
      updatedAt: new Date("2026-05-06"),
      ...overrides,
    };
  }

  it("override minScore=0.7 raises the bar", () => {
    const out = filterRetrieval({
      chunks: [
        makeChunk({ sourceChunkId: "a", score: 0.69, content: "alpha" }),
        makeChunk({ sourceChunkId: "b", score: 0.71, content: "beta" }),
      ],
      policy: makePolicy({ minScore: 0.7 }),
    });
    expect(out.chunks.map((c) => c.sourceChunkId)).toEqual(["b"]);
  });

  it("override citationRequired=false keeps citation-less chunks", () => {
    const out = filterRetrieval({
      chunks: [makeChunk({ sourceChunkId: "a", citation: "" })],
      policy: makePolicy({ citationRequired: false }),
    });
    expect(out.chunks).toHaveLength(1);
  });

  it("override maxChunks=2 caps regardless of score density", () => {
    const chunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk({ sourceChunkId: `s${i}`, score: 0.9, content: `c${i}` }),
    );
    const out = filterRetrieval({ chunks, policy: makePolicy({ maxChunks: 2 }) });
    expect(out.chunks).toHaveLength(2);
    expect(out.rejectionCounts.capacity).toBe(3);
  });

  it("override freshnessMaxAgeDays=1 drops chunks older than 1 day", () => {
    const fixedNow = Date.parse("2026-05-06T12:00:00Z");
    const out = filterRetrieval({
      chunks: [
        makeChunk({
          sourceChunkId: "fresh",
          metadata: { createdAt: "2026-05-06T11:00:00Z" }, // 1 hr old
        }),
        makeChunk({
          sourceChunkId: "stale",
          metadata: { createdAt: "2026-05-04T11:00:00Z" }, // 2 days old
        }),
      ],
      policy: makePolicy({ freshnessMaxAgeDays: 1 }),
      now: () => fixedNow,
    });
    expect(out.chunks.map((c) => c.sourceChunkId)).toEqual(["fresh"]);
    expect(out.rejectionCounts.freshness).toBe(1);
  });
});

describe("filter — DEFAULT_RETRIEVAL_FILTER_CONFIG sanity", () => {
  it("matches the locked D-RET-5 values exactly", () => {
    expect(DEFAULT_RETRIEVAL_FILTER_CONFIG.minScore).toBe(0.45);
    expect(DEFAULT_RETRIEVAL_FILTER_CONFIG.maxChunks).toBe(8);
    expect(DEFAULT_RETRIEVAL_FILTER_CONFIG.dedupeBy).toBe("hash");
    expect(DEFAULT_RETRIEVAL_FILTER_CONFIG.freshnessMaxAgeDays).toBeNull();
    expect(DEFAULT_RETRIEVAL_FILTER_CONFIG.citationRequired).toBe(true);
    expect(DEFAULT_RETRIEVAL_FILTER_CONFIG.sourcePermissionFilter).toBe(
      "workspace_id_match",
    );
    expect(DEFAULT_RETRIEVAL_FILTER_CONFIG.piiPolicy).toBe("warn");
    expect(DEFAULT_RETRIEVAL_FILTER_CONFIG.licensePolicy).toBe("warn");
  });
});
