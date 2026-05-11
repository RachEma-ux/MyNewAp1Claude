/**
 * Phase 12 §5 — graphragAdapter → GraphRetrievalRouter dispatch.
 *
 * Verifies:
 *   - Requests without a `retrievalMethod` still return the legacy
 *     `source_unavailable` stub (back-compat).
 *   - Requests with an unrecognized method also return the stub
 *     (validation defense — strict 5-method whitelist).
 *   - Requests with a recognized method dispatch through the router
 *     against the in-memory TestGraphRepository and surface mapped
 *     chunks, rejection reasons, truncation, and safety events.
 *   - `methodToReservedMode` returns the matching graphrag_* literal.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { graphragAdapter } from "../../server/agent-studio/services/rac/ingestion/graphrag-adapter";
import {
  methodToReservedMode,
  GRAPHRAG_RETRIEVAL_METHODS,
} from "../../server/agent-studio/services/rac/planner-mode";
import { _resetGraphRepository } from "../../server/agent-studio/services/graph/repository";

const ORIGINAL_BACKEND = process.env.GRAPH_BACKEND;

beforeEach(() => {
  // Force the test backend so dispatch hits TestGraphRepository (in-memory).
  process.env.GRAPH_BACKEND = "test";
  _resetGraphRepository();
});

afterEach(() => {
  process.env.GRAPH_BACKEND = ORIGINAL_BACKEND;
  _resetGraphRepository();
});

describe("methodToReservedMode", () => {
  it("returns graphrag_<method> for every method", () => {
    for (const m of GRAPHRAG_RETRIEVAL_METHODS) {
      expect(methodToReservedMode(m)).toBe(`graphrag_${m}`);
    }
  });
});

describe("graphragAdapter — back-compat (no retrievalMethod)", () => {
  it("returns source_unavailable when retrievalMethod is absent", async () => {
    const r = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 7,
      query: "test",
      topK: 5,
    });
    expect(r.chunks).toEqual([]);
    expect(r.warnings[0]).toContain("source_unavailable");
    expect(r.warnings[0]).not.toContain("method=");
  });

  it("returns source_unavailable when retrievalMethod is unrecognized", async () => {
    const r = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 7,
      query: "test",
      topK: 5,
      retrievalMethod: "made_up_method",
    });
    expect(r.chunks).toEqual([]);
    expect(r.warnings[0]).toContain("source_unavailable");
    // Stub still surfaces the (unrecognized) method tag for debugging
    expect(r.warnings[0]).toContain("method=made_up_method");
  });
});

describe("graphragAdapter — Phase 12 §5 router dispatch", () => {
  it("graphrag_local without seedNodeId surfaces router rejection (no_seed_node)", async () => {
    const r = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 7,
      query: "test",
      topK: 5,
      retrievalMethod: "local",
    });
    expect(r.chunks).toEqual([]);
    expect(r.warnings.join("\n")).toContain(
      "graphrag_router_rejected: source=7 method=local reason=no_seed_node",
    );
  });

  it("graphrag_text2cypher with mutation cypher surfaces router rejection", async () => {
    const r = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 7,
      query: "test",
      topK: 5,
      retrievalMethod: "text2cypher",
      filters: {
        generatedCypher: "CREATE (n:Foo {x: 1}) RETURN n",
      },
    });
    expect(r.chunks).toEqual([]);
    expect(r.warnings.join("\n")).toMatch(
      /graphrag_router_rejected.*method=text2cypher.*reason=text2cypher_/,
    );
  });

  it("graphrag_global dispatches and returns the in-memory repo's global sample (TestGraphRepository default is empty → no chunks, no warnings)", async () => {
    const r = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 7,
      query: "test",
      topK: 5,
      retrievalMethod: "global",
    });
    expect(r.chunks).toEqual([]);
    // No rejection because the call shape is valid; an empty repo
    // just yields zero blocks.
    expect(r.warnings).toEqual([]);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("graphrag_local with a seeded TestGraphRepository node returns a mapped chunk with JSON content + citation", async () => {
    const { getGraphRepository } = await import(
      "../../server/agent-studio/services/graph/repository"
    );
    const repo = getGraphRepository() as InstanceType<
      typeof import("../../server/agent-studio/services/graph/repository").TestGraphRepository
    >;
    // TestGraphRepository surface: upsertNode(node, runtime).
    await repo.upsertNode({
      typeKey: "company",
      id: "n:1",
      sourceId: "src-1",
      sourceVersionId: "v-1",
      properties: { name: "Acme Corp" },
      provenance: {
        sourceType: "test",
        sourceId: "src-1",
        sourceVersionId: "v-1",
        lineageStatus: "asserted",
        governanceStatus: "active",
      },
    });

    const r = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 7,
      query: "test",
      topK: 5,
      retrievalMethod: "local",
      filters: { seedNodeId: "n:1" },
    });
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0].sourceChunkId).toBe("n:1");
    expect(r.chunks[0].score).toBe(1);
    expect(r.chunks[0].citation).toContain("src-1");
    expect(r.chunks[0].citation).toContain("§v-1");
    expect(r.chunks[0].metadata?.sourceId).toBe("src-1");
    expect(r.warnings).toEqual([]);
  });

  it("filters propagate to router: maxResults override is honored over topK", async () => {
    // Seed two nodes so we can confirm maxResults caps the response.
    const { getGraphRepository } = await import(
      "../../server/agent-studio/services/graph/repository"
    );
    const repo = getGraphRepository() as InstanceType<
      typeof import("../../server/agent-studio/services/graph/repository").TestGraphRepository
    >;
    await repo.upsertNode({
      typeKey: "company",
      id: "n:1",
      sourceId: "src-1",
      properties: { name: "Acme" },
      provenance: {
        sourceType: "test",
        sourceId: "src-1",
        lineageStatus: "asserted",
        governanceStatus: "active",
      },
    });
    await repo.upsertNode({
      typeKey: "company",
      id: "n:2",
      sourceId: "src-2",
      properties: { name: "Beta" },
      provenance: {
        sourceType: "test",
        sourceId: "src-2",
        lineageStatus: "asserted",
        governanceStatus: "active",
      },
    });

    const r = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 7,
      query: "test",
      topK: 50, // big
      retrievalMethod: "global",
      filters: { maxResults: 1 }, // cap to 1
    });
    expect(r.chunks.length).toBeLessThanOrEqual(1);
  });
});
