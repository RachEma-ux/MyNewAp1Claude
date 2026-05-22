/**
 * F6 (2026-05-22) — `buildIndexSql` must render drizzle partial-index
 * `WHERE` clauses (e.g. `.uniqueIndex(...).where(sql\`<col> IS NOT NULL\`)`).
 *
 * Before this fix, the seed reconciler emitted a NON-partial UNIQUE
 * INDEX for `idx_ags_graph_edges_type_edge_key`, which collided with
 * pre-existing legitimately-non-unique rows and threw at every boot
 * with `[ASDB] index error on ags_graph_edges: could not create
 * unique index "idx_ags_graph_edges_type_edge_key"`. The actual
 * partial-unique constraint never landed.
 *
 * This test pins the renderer behaviour against a real drizzle table
 * declaration (no hand-rolled fixture — exercising the live shape).
 */

import { describe, it, expect } from "vitest";

import { __testing__ } from "../../server/agent-studio/db/seed";
import { agsGraphEdges } from "../../drizzle/tables/agent-studio-graph";

const { buildIndexSql, renderIndexWhereChunks } = __testing__;

describe("buildIndexSql — partial-index WHERE clause (F6)", () => {
  it("renders ags_graph_edges' partial unique with WHERE edge_key IS NOT NULL", () => {
    const stmts = buildIndexSql(agsGraphEdges);
    const partialStmt = stmts.find((s) =>
      s.includes("idx_ags_graph_edges_type_edge_key"),
    );
    expect(partialStmt).toBeDefined();
    expect(partialStmt).toMatch(/CREATE UNIQUE INDEX/);
    expect(partialStmt).toMatch(/"type_key", "edge_key"/);
    // The critical assertion: the WHERE clause is present.
    expect(partialStmt).toMatch(/WHERE "edge_key" IS NOT NULL/);
  });

  it("emits NO WHERE clause for non-partial indexes on the same table", () => {
    const stmts = buildIndexSql(agsGraphEdges);
    const sourceIdxStmt = stmts.find((s) =>
      s.includes("idx_ags_graph_edges_source_node"),
    );
    expect(sourceIdxStmt).toBeDefined();
    expect(sourceIdxStmt).not.toMatch(/WHERE/);
  });

  it("renderIndexWhereChunks renders a column reference + string-tag pair", () => {
    const fakeChunks: unknown[] = [
      { value: [""] },
      { name: "edge_key" },
      { value: [" IS NOT NULL"] },
    ];
    expect(renderIndexWhereChunks(fakeChunks)).toBe('"edge_key" IS NOT NULL');
  });

  it("renderIndexWhereChunks handles a simple two-column null check", () => {
    const fakeChunks: unknown[] = [
      { value: [""] },
      { name: "a" },
      { value: [" IS NOT NULL AND "] },
      { name: "b" },
      { value: [" IS NULL"] },
    ];
    expect(renderIndexWhereChunks(fakeChunks)).toBe(
      '"a" IS NOT NULL AND "b" IS NULL',
    );
  });

  it("renderIndexWhereChunks throws on unsupported chunk shapes", () => {
    expect(() => renderIndexWhereChunks([{ unsupported: true } as unknown])).toThrow(
      /unsupported partial-index WHERE chunk shape/,
    );
  });
});
