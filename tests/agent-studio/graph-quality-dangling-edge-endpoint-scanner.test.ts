/**
 * Phase 23 §1 — dangling-edge-endpoint scanner (6th registered scanKind).
 *
 * Detects edges whose sourceNode.id or targetNode.id doesn't exist in
 * the sample's nodes array. A dangling endpoint is a structural
 * invariant violation — traversals break and projection drift between
 * Postgres SoT and Neo4j projection is not honored.
 *
 * T-D second slice of the remaining execution plan.
 */

import { describe, it, expect } from "vitest";
import {
  scanForDanglingEdgeEndpoints,
  danglingEdgeEndpointScanner,
  QUALITY_SCANNER_REGISTRY,
  proposalKindForFinding,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/public-api";

describe("scanForDanglingEdgeEndpoints — pure scanner", () => {
  it("flags edges whose sourceNode.id is missing from the nodes set", () => {
    const findings = scanForDanglingEdgeEndpoints({
      nodes: [{ typeKey: "Note", id: "n:2" }],
      edges: [
        {
          typeKey: "LINKS_TO",
          id: "e:1",
          sourceNode: { typeKey: "Note", id: "n:1" /* missing */ },
          targetNode: { typeKey: "Note", id: "n:2" },
        },
      ],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingClass: "dangling_edge_endpoint",
      severity: "high",
      sourceTypeKey: "LINKS_TO",
      sourceId: "e:1",
    });
    expect(findings[0].details).toMatchObject({
      missingEndpoint: "source",
      missingNodeId: "n:1",
      missingNodeTypeKey: "Note",
    });
  });

  it("flags edges whose targetNode.id is missing", () => {
    const findings = scanForDanglingEdgeEndpoints({
      nodes: [{ typeKey: "Note", id: "n:1" }],
      edges: [
        {
          typeKey: "LINKS_TO",
          id: "e:1",
          sourceNode: { typeKey: "Note", id: "n:1" },
          targetNode: { typeKey: "Note", id: "n:2" /* missing */ },
        },
      ],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].details).toMatchObject({
      missingEndpoint: "target",
      missingNodeId: "n:2",
    });
  });

  it("emits TWO findings when both endpoints are missing (fully-orphan edge)", () => {
    const findings = scanForDanglingEdgeEndpoints({
      nodes: [],
      edges: [
        {
          typeKey: "A",
          id: "e:1",
          sourceNode: { typeKey: "N", id: "n:1" },
          targetNode: { typeKey: "N", id: "n:2" },
        },
      ],
      truncated: false,
    });
    expect(findings).toHaveLength(2);
    const endpoints = findings.map((f) => f.details?.missingEndpoint).sort();
    expect(endpoints).toEqual(["source", "target"]);
  });

  it("does not flag edges with both endpoints present", () => {
    const findings = scanForDanglingEdgeEndpoints({
      nodes: [
        { typeKey: "Note", id: "n:1" },
        { typeKey: "Note", id: "n:2" },
      ],
      edges: [
        {
          typeKey: "LINKS_TO",
          sourceNode: { typeKey: "Note", id: "n:1" },
          targetNode: { typeKey: "Note", id: "n:2" },
        },
      ],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("carries sampleTruncated into details (operator forensics for pagination-vs-real-bug)", () => {
    const findings = scanForDanglingEdgeEndpoints({
      nodes: [],
      edges: [
        {
          typeKey: "R",
          sourceNode: { typeKey: "X", id: "x:1" },
          targetNode: { typeKey: "X", id: "x:2" },
        },
      ],
      truncated: true,
    });
    expect(findings[0].details).toMatchObject({ sampleTruncated: true });
    expect(findings[1].details).toMatchObject({ sampleTruncated: true });
  });

  it("handles empty sample without throwing", () => {
    const findings = scanForDanglingEdgeEndpoints({
      nodes: [],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });
});

describe("danglingEdgeEndpointScanner registration", () => {
  it("registers under scanKind=dangling_edge_endpoint", () => {
    expect(danglingEdgeEndpointScanner.scanKind).toBe(
      "dangling_edge_endpoint",
    );
  });

  it("is present in QUALITY_SCANNER_REGISTRY alongside the prior 5 scanners", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(kinds).toContain("orphan_node");
    expect(kinds).toContain("duplicate_entity");
    expect(kinds).toContain("stale_node");
    expect(kinds).toContain("self_loop");
    expect(kinds).toContain("missing_provenance");
    expect(kinds).toContain("dangling_edge_endpoint");
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("dangling_edge_endpoint → proposalKind mapping", () => {
  it("maps to backfill_node_or_delete_dangling_edge", () => {
    expect(FINDING_CLASS_TO_PROPOSAL_KIND["dangling_edge_endpoint"]).toBe(
      "backfill_node_or_delete_dangling_edge",
    );
  });

  it("proposalKindForFinding returns the canonical kind (not review_ fallback)", () => {
    expect(proposalKindForFinding("dangling_edge_endpoint")).toBe(
      "backfill_node_or_delete_dangling_edge",
    );
  });
});
