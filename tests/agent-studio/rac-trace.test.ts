/**
 * RAC Phase 7 — trace store + chunk-block builder tests.
 *
 * The DB-touching paths (writeTrace, writeContextBlocks,
 * recordFeedback) are exercised via integration once the migration
 * runs; here we cover the pure code paths that are unit-testable
 * without spinning ASDB:
 *
 *   - buildContextBlockRows projects the orchestrator's `sourceTrace`
 *     shape into per-block insert rows. Verifies rank ordering, hash
 *     determinism, citation passthrough, source-id mapping, latency
 *     lookup, and the "unknown source" fallback when chunkSourceMap
 *     misses a chunkId.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { buildContextBlockRows } from "../../server/agent-studio/services/rac/trace";
import type { RacRetrievalChunk } from "../../server/agent-studio/services/rac/ingestion";

function makeChunk(over: Partial<RacRetrievalChunk> = {}): RacRetrievalChunk {
  return {
    content: "default body",
    score: 0.9,
    citation: "[doc:Sample §1]",
    sourceChunkId: "chunk-default",
    ...over,
  };
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

describe("buildContextBlockRows — happy path", () => {
  it("maps each chunk to a row with rank=idx+1 (1-indexed)", () => {
    const rows = buildContextBlockRows({
      traceId: 42,
      workspaceId: 7,
      includedChunks: [
        makeChunk({ sourceChunkId: "a", content: "A", score: 0.9 }),
        makeChunk({ sourceChunkId: "b", content: "B", score: 0.7 }),
        makeChunk({ sourceChunkId: "c", content: "C", score: 0.5 }),
      ],
      chunkSourceMap: {
        a: { sourceId: 1, sourceType: "graph_index" },
        b: { sourceId: 1, sourceType: "graph_index" },
        c: { sourceId: 2, sourceType: "vector_index" },
      },
      perSourceLatencyMs: { 1: 30, 2: 50 },
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.sourceChunkId)).toEqual(["a", "b", "c"]);
  });

  it("preserves traceId + workspaceId on every row", () => {
    const rows = buildContextBlockRows({
      traceId: 99,
      workspaceId: 7,
      includedChunks: [
        makeChunk({ sourceChunkId: "a" }),
        makeChunk({ sourceChunkId: "b" }),
      ],
      chunkSourceMap: {
        a: { sourceId: 1, sourceType: "graph_index" },
        b: { sourceId: 1, sourceType: "graph_index" },
      },
      perSourceLatencyMs: { 1: 30 },
    });
    expect(rows.every((r) => r.traceId === 99)).toBe(true);
    expect(rows.every((r) => r.workspaceId === 7)).toBe(true);
  });

  it("computes SHA-256 contentHash deterministically per chunk content", () => {
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [
        makeChunk({ sourceChunkId: "x", content: "stable text" }),
      ],
      chunkSourceMap: { x: { sourceId: 1, sourceType: "graph_index" } },
      perSourceLatencyMs: { 1: 10 },
    });
    expect(rows[0].contentHash).toBe(sha256("stable text"));
    expect(rows[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("identical content → identical contentHash across chunks (dedupe-ready)", () => {
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [
        makeChunk({ sourceChunkId: "a", content: "same body" }),
        makeChunk({ sourceChunkId: "b", content: "same body" }),
      ],
      chunkSourceMap: {
        a: { sourceId: 1, sourceType: "graph_index" },
        b: { sourceId: 2, sourceType: "vector_index" },
      },
      perSourceLatencyMs: { 1: 10, 2: 20 },
    });
    expect(rows[0].contentHash).toBe(rows[1].contentHash);
  });
});

describe("buildContextBlockRows — citation + metadata passthrough", () => {
  it("normalises empty/whitespace citations to null", () => {
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [
        makeChunk({ sourceChunkId: "a", citation: "" }),
        makeChunk({ sourceChunkId: "b", citation: "[doc:Real §1]" }),
      ],
      chunkSourceMap: {
        a: { sourceId: 1, sourceType: "graph_index" },
        b: { sourceId: 1, sourceType: "graph_index" },
      },
      perSourceLatencyMs: { 1: 5 },
    });
    expect(rows[0].citation).toBeNull();
    expect(rows[1].citation).toBe("[doc:Real §1]");
  });

  it("forwards metadata blob unchanged", () => {
    const md = { documentId: 42, headingPath: "Ch.3 / Frag" };
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [makeChunk({ sourceChunkId: "x", metadata: md })],
      chunkSourceMap: { x: { sourceId: 1, sourceType: "graph_index" } },
      perSourceLatencyMs: { 1: 5 },
    });
    expect(rows[0].metadata).toEqual(md);
  });

  it("metadata=null when chunk has no metadata", () => {
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [makeChunk({ sourceChunkId: "x" })],
      chunkSourceMap: { x: { sourceId: 1, sourceType: "graph_index" } },
      perSourceLatencyMs: { 1: 5 },
    });
    expect(rows[0].metadata).toBeNull();
  });
});

describe("buildContextBlockRows — source-id mapping fallbacks", () => {
  it("uses chunkSourceMap entry when present", () => {
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [makeChunk({ sourceChunkId: "x" })],
      chunkSourceMap: { x: { sourceId: 7, sourceType: "graph_index" } },
      perSourceLatencyMs: { 7: 12 },
    });
    expect(rows[0].sourceId).toBe(7);
    expect(rows[0].sourceType).toBe("graph_index");
    expect(rows[0].sourceLatencyMs).toBe(12);
  });

  it("falls back to (sourceId=0, sourceType='unknown') when missing", () => {
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [makeChunk({ sourceChunkId: "orphan" })],
      chunkSourceMap: {},
      perSourceLatencyMs: {},
    });
    expect(rows[0].sourceId).toBe(0);
    expect(rows[0].sourceType).toBe("unknown");
    expect(rows[0].sourceLatencyMs).toBeNull();
  });

  it("sourceLatencyMs=null when the source has no latency entry", () => {
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [makeChunk({ sourceChunkId: "x" })],
      chunkSourceMap: { x: { sourceId: 5, sourceType: "graph_index" } },
      perSourceLatencyMs: { 99: 200 }, // no entry for source 5
    });
    expect(rows[0].sourceLatencyMs).toBeNull();
  });
});

describe("buildContextBlockRows — score + ordering preservation", () => {
  it("preserves the includedChunks order verbatim (caller pre-sorts)", () => {
    // Pass chunks in score-DESC order; rank should match.
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [
        makeChunk({ sourceChunkId: "high", score: 0.95 }),
        makeChunk({ sourceChunkId: "mid", score: 0.7 }),
        makeChunk({ sourceChunkId: "low", score: 0.5 }),
      ],
      chunkSourceMap: {
        high: { sourceId: 1, sourceType: "graph_index" },
        mid: { sourceId: 1, sourceType: "graph_index" },
        low: { sourceId: 1, sourceType: "graph_index" },
      },
      perSourceLatencyMs: { 1: 30 },
    });
    expect(rows.map((r) => r.sourceChunkId)).toEqual(["high", "mid", "low"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.score)).toEqual([0.95, 0.7, 0.5]);
  });

  it("returns empty array for empty input", () => {
    const rows = buildContextBlockRows({
      traceId: 1,
      workspaceId: 1,
      includedChunks: [],
      chunkSourceMap: {},
      perSourceLatencyMs: {},
    });
    expect(rows).toEqual([]);
  });
});
