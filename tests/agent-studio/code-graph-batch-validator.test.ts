/**
 * Code Intelligence Graph batch validator — Phase 25 §T-G.7.
 *
 * Reason-bearing validator + batch validator for code-graph edges.
 * Pure-function tests; no DB / no spike / no parser.
 */

import { describe, it, expect } from "vitest";
import {
  validateCodeGraphEdgeWithReason,
  validateCodeGraphEdgeBatch,
  listAllowedEdgeTypesToTarget,
  CODE_GRAPH_EDGE_CONSTRAINTS,
} from "../../server/agent-studio/services/code-graph/contracts/public-api";

describe("validateCodeGraphEdgeWithReason — happy path", () => {
  it("accepts a well-typed allowed edge", () => {
    const out = validateCodeGraphEdgeWithReason("file", "imports", "file");
    expect(out.ok).toBe(true);
  });

  it("accepts function calls method", () => {
    const out = validateCodeGraphEdgeWithReason("function", "calls", "method");
    expect(out.ok).toBe(true);
  });

  it("accepts test_file tests function", () => {
    const out = validateCodeGraphEdgeWithReason(
      "test_file",
      "tests",
      "function",
    );
    expect(out.ok).toBe(true);
  });
});

describe("validateCodeGraphEdgeWithReason — rejection reasons", () => {
  it("unknown_source_type when source not in taxonomy", () => {
    const out = validateCodeGraphEdgeWithReason(
      "not_a_node_type",
      "imports",
      "file",
    );
    expect(out).toEqual({ ok: false, reason: "unknown_source_type" });
  });

  it("unknown_edge_type when edge not in taxonomy", () => {
    const out = validateCodeGraphEdgeWithReason(
      "file",
      "not_an_edge_type",
      "file",
    );
    expect(out).toEqual({ ok: false, reason: "unknown_edge_type" });
  });

  it("unknown_target_type when target not in taxonomy", () => {
    const out = validateCodeGraphEdgeWithReason(
      "file",
      "imports",
      "not_a_node_type",
    );
    expect(out).toEqual({ ok: false, reason: "unknown_target_type" });
  });

  it("source_type_not_allowed_for_edge when source typeKey is wrong", () => {
    // `calls` requires source = function | method. db_table is not allowed.
    const out = validateCodeGraphEdgeWithReason(
      "db_table",
      "calls",
      "function",
    );
    expect(out).toEqual({
      ok: false,
      reason: "source_type_not_allowed_for_edge",
    });
  });

  it("target_type_not_allowed_for_edge when target typeKey is wrong", () => {
    // `reads_from_table` requires target = db_table. file is not allowed.
    const out = validateCodeGraphEdgeWithReason(
      "function",
      "reads_from_table",
      "file",
    );
    expect(out).toEqual({
      ok: false,
      reason: "target_type_not_allowed_for_edge",
    });
  });

  it("source check runs before target check (early-return ordering)", () => {
    // Both source AND target are wrong — should report source first.
    const out = validateCodeGraphEdgeWithReason(
      "db_table",
      "calls",
      "db_table",
    );
    expect(out).toEqual({
      ok: false,
      reason: "source_type_not_allowed_for_edge",
    });
  });
});

describe("validateCodeGraphEdgeBatch", () => {
  it("partitions accepted vs rejected with counts per reason", () => {
    const result = validateCodeGraphEdgeBatch([
      // Good — keeps acceptedEdgeIds in order.
      {
        edgeId: "e1",
        sourceTypeKey: "file",
        edgeTypeKey: "imports",
        targetTypeKey: "file",
      },
      // unknown_source_type
      {
        edgeId: "e2",
        sourceTypeKey: "bogus",
        edgeTypeKey: "imports",
        targetTypeKey: "file",
      },
      // unknown_edge_type
      {
        edgeId: "e3",
        sourceTypeKey: "file",
        edgeTypeKey: "bogus",
        targetTypeKey: "file",
      },
      // source_type_not_allowed_for_edge
      {
        edgeId: "e4",
        sourceTypeKey: "db_table",
        edgeTypeKey: "calls",
        targetTypeKey: "function",
      },
      // target_type_not_allowed_for_edge
      {
        edgeId: "e5",
        sourceTypeKey: "function",
        edgeTypeKey: "reads_from_table",
        targetTypeKey: "file",
      },
      // Another good edge (interleaved).
      {
        edgeId: "e6",
        sourceTypeKey: "function",
        edgeTypeKey: "calls",
        targetTypeKey: "method",
      },
    ]);

    expect(result.acceptedEdgeIds).toEqual(["e1", "e6"]);
    expect(result.rejected).toEqual([
      { edgeId: "e2", reason: "unknown_source_type" },
      { edgeId: "e3", reason: "unknown_edge_type" },
      { edgeId: "e4", reason: "source_type_not_allowed_for_edge" },
      { edgeId: "e5", reason: "target_type_not_allowed_for_edge" },
    ]);
    expect(result.rejectionsByReason).toEqual({
      unknown_source_type: 1,
      unknown_edge_type: 1,
      unknown_target_type: 0,
      source_type_not_allowed_for_edge: 1,
      target_type_not_allowed_for_edge: 1,
    });
  });

  it("empty batch returns empty partitions + zero counts", () => {
    const result = validateCodeGraphEdgeBatch([]);
    expect(result.acceptedEdgeIds).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(
      Object.values(result.rejectionsByReason).every((c) => c === 0),
    ).toBe(true);
  });

  it("rejectionsByReason keys are exhaustive over the closed taxonomy", () => {
    const result = validateCodeGraphEdgeBatch([
      {
        edgeId: "x",
        sourceTypeKey: "file",
        edgeTypeKey: "imports",
        targetTypeKey: "file",
      },
    ]);
    // All 5 reason buckets are always present, even if zero — operator
    // dashboards rely on this for stable column rendering.
    expect(Object.keys(result.rejectionsByReason).sort()).toEqual(
      [
        "source_type_not_allowed_for_edge",
        "target_type_not_allowed_for_edge",
        "unknown_edge_type",
        "unknown_source_type",
        "unknown_target_type",
      ].sort(),
    );
  });
});

describe("listAllowedEdgeTypesToTarget — symmetric helper", () => {
  it("api_endpoint accepts calls + declares as inbound edges", () => {
    const edges = listAllowedEdgeTypesToTarget("api_endpoint");
    expect(edges).toContain("calls");
    expect(edges).toContain("declares");
    expect(edges).toContain("tests");
    expect(edges).not.toContain("reads_from_table");
  });

  it("db_table only accepts reads_from_table + writes_to_table", () => {
    const edges = listAllowedEdgeTypesToTarget("db_table");
    expect(edges).toContain("reads_from_table");
    expect(edges).toContain("writes_to_table");
    expect(edges).not.toContain("calls");
    expect(edges).not.toContain("imports");
  });

  it("matches the inverse of CODE_GRAPH_EDGE_CONSTRAINTS targetTypeKeys", () => {
    // Spot-check: every returned edge for "function" target has
    // "function" in its targetTypeKeys.
    const edges = listAllowedEdgeTypesToTarget("function");
    for (const e of edges) {
      const c = CODE_GRAPH_EDGE_CONSTRAINTS[e];
      expect(
        c.targetTypeKeys.length === 0 || c.targetTypeKeys.includes("function"),
      ).toBe(true);
    }
  });
});
