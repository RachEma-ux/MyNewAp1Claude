/**
 * Phase 25 §T-G.21 — summarizeCodeGraphCardinality lockstep.
 *
 * Tests the cardinality rollup over CODE_GRAPH_EDGE_TYPES + their
 * declared constraints.
 */

import { describe, it, expect } from "vitest";
import {
  CODE_GRAPH_EDGE_TYPES,
  CODE_GRAPH_EDGE_CONSTRAINTS,
  summarizeCodeGraphCardinality,
} from "../../server/agent-studio/services/code-graph/contracts/public-api.js";

describe("summarizeCodeGraphCardinality (T-G.21)", () => {
  it("total matches CODE_GRAPH_EDGE_TYPES.length", () => {
    expect(summarizeCodeGraphCardinality().total).toBe(
      CODE_GRAPH_EDGE_TYPES.length,
    );
  });

  it("oneToOne + oneToMany + manyToMany == total", () => {
    const s = summarizeCodeGraphCardinality();
    expect(s.oneToOne + s.oneToMany + s.manyToMany).toBe(s.total);
  });

  it("each cardinality count matches a direct filter over CODE_GRAPH_EDGE_CONSTRAINTS", () => {
    const s = summarizeCodeGraphCardinality();
    const oneToOne = CODE_GRAPH_EDGE_TYPES.filter(
      (t) => CODE_GRAPH_EDGE_CONSTRAINTS[t].cardinality === "one_to_one",
    ).length;
    const oneToMany = CODE_GRAPH_EDGE_TYPES.filter(
      (t) => CODE_GRAPH_EDGE_CONSTRAINTS[t].cardinality === "one_to_many",
    ).length;
    const manyToMany = CODE_GRAPH_EDGE_TYPES.filter(
      (t) => CODE_GRAPH_EDGE_CONSTRAINTS[t].cardinality === "many_to_many",
    ).length;
    expect(s.oneToOne).toBe(oneToOne);
    expect(s.oneToMany).toBe(oneToMany);
    expect(s.manyToMany).toBe(manyToMany);
  });

  it("returns non-negative counts", () => {
    const s = summarizeCodeGraphCardinality();
    expect(s.oneToOne).toBeGreaterThanOrEqual(0);
    expect(s.oneToMany).toBeGreaterThanOrEqual(0);
    expect(s.manyToMany).toBeGreaterThanOrEqual(0);
  });

  it("is pure — returns the same value across calls", () => {
    const a = summarizeCodeGraphCardinality();
    const b = summarizeCodeGraphCardinality();
    expect(a).toEqual(b);
  });
});
