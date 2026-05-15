/**
 * Phase 23 §1 — excessive-fanout scanner (8th registered scanKind).
 *
 * Detects super-nodes whose in or out degree exceeds a threshold.
 * Signals entity-resolution miss, ontology design bug, or spam
 * ingest.
 *
 * T-D fourth slice.
 */

import { describe, it, expect } from "vitest";
import {
  scanForExcessiveFanout,
  excessiveFanoutScanner,
  DEFAULT_EXCESSIVE_FANOUT_THRESHOLD,
  QUALITY_SCANNER_REGISTRY,
  proposalKindForFinding,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/public-api";

describe("scanForExcessiveFanout — pure scanner", () => {
  it("emits no findings when no node exceeds the default threshold", () => {
    const findings = scanForExcessiveFanout({
      nodes: [{ typeKey: "N", id: "n:hub" }],
      edges: [
        {
          typeKey: "X",
          sourceNode: { typeKey: "N", id: "n:hub" },
          targetNode: { typeKey: "N", id: "n:t" },
        },
      ],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("flags a node whose out-degree exceeds an explicit low threshold", () => {
    const edges = Array.from({ length: 5 }, (_, i) => ({
      typeKey: "X",
      id: `e:${i}`,
      sourceNode: { typeKey: "Hub", id: "h:1" },
      targetNode: { typeKey: "Leaf", id: `l:${i}` },
    }));
    const findings = scanForExcessiveFanout(
      {
        nodes: [{ typeKey: "Hub", id: "h:1" }],
        edges,
        truncated: false,
      },
      { threshold: 2 },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingClass: "excessive_fanout",
      severity: "medium",
      sourceTypeKey: "Hub",
      sourceId: "h:1",
    });
    expect(findings[0].details).toMatchObject({
      direction: "out",
      actualDegree: 5,
      threshold: 2,
    });
  });

  it("flags in-degree super-sinks separately from out-degree", () => {
    const edges = Array.from({ length: 4 }, (_, i) => ({
      typeKey: "REFERS",
      id: `e:${i}`,
      sourceNode: { typeKey: "Note", id: `n:${i}` },
      targetNode: { typeKey: "User", id: "u:generic" },
    }));
    const findings = scanForExcessiveFanout(
      { nodes: [{ typeKey: "User", id: "u:generic" }], edges, truncated: false },
      { threshold: 2 },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].details).toMatchObject({
      direction: "in",
      actualDegree: 4,
      threshold: 2,
    });
  });

  it("emits separate findings when a node is super in BOTH directions", () => {
    // Out: h → t1..t3 = 3. In: t1..t3 → h = 3. Threshold 2 → both
    // directions trip.
    const edges = [
      ...Array.from({ length: 3 }, (_, i) => ({
        typeKey: "OUT",
        id: `eo:${i}`,
        sourceNode: { typeKey: "H", id: "h:1" },
        targetNode: { typeKey: "T", id: `t:${i}` },
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        typeKey: "IN",
        id: `ei:${i}`,
        sourceNode: { typeKey: "T", id: `t:${i}` },
        targetNode: { typeKey: "H", id: "h:1" },
      })),
    ];
    const findings = scanForExcessiveFanout(
      { nodes: [{ typeKey: "H", id: "h:1" }], edges, truncated: false },
      { threshold: 2 },
    );
    expect(findings).toHaveLength(2);
    const directions = findings.map((f) => f.details?.direction).sort();
    expect(directions).toEqual(["in", "out"]);
  });

  it("uses strict > threshold (degree exactly at threshold passes)", () => {
    const edges = Array.from({ length: 5 }, (_, i) => ({
      typeKey: "X",
      sourceNode: { typeKey: "H", id: "h:1" },
      targetNode: { typeKey: "T", id: `t:${i}` },
    }));
    const atThreshold = scanForExcessiveFanout(
      { nodes: [{ typeKey: "H", id: "h:1" }], edges, truncated: false },
      { threshold: 5 },
    );
    expect(atThreshold).toEqual([]);
    const aboveThreshold = scanForExcessiveFanout(
      { nodes: [{ typeKey: "H", id: "h:1" }], edges, truncated: false },
      { threshold: 4 },
    );
    expect(aboveThreshold).toHaveLength(1);
  });

  it("DEFAULT_EXCESSIVE_FANOUT_THRESHOLD is 100", () => {
    expect(DEFAULT_EXCESSIVE_FANOUT_THRESHOLD).toBe(100);
  });

  it("carries sampleTruncated into details", () => {
    const edges = Array.from({ length: 3 }, (_, i) => ({
      typeKey: "X",
      sourceNode: { typeKey: "H", id: "h:1" },
      targetNode: { typeKey: "T", id: `t:${i}` },
    }));
    const findings = scanForExcessiveFanout(
      { nodes: [{ typeKey: "H", id: "h:1" }], edges, truncated: true },
      { threshold: 1 },
    );
    expect(findings[0].details).toMatchObject({ sampleTruncated: true });
  });

  it("handles empty sample without throwing", () => {
    const findings = scanForExcessiveFanout({
      nodes: [],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });
});

describe("excessiveFanoutScanner registration", () => {
  it("registers under scanKind=excessive_fanout", () => {
    expect(excessiveFanoutScanner.scanKind).toBe("excessive_fanout");
  });

  it("is present in QUALITY_SCANNER_REGISTRY alongside the prior 7 scanners", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(kinds).toContain("orphan_node");
    expect(kinds).toContain("duplicate_entity");
    expect(kinds).toContain("stale_node");
    expect(kinds).toContain("self_loop");
    expect(kinds).toContain("missing_provenance");
    expect(kinds).toContain("dangling_edge_endpoint");
    expect(kinds).toContain("parallel_edges");
    expect(kinds).toContain("excessive_fanout");
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("excessive_fanout → proposalKind mapping", () => {
  it("maps to review_super_node_for_entity_resolution", () => {
    expect(FINDING_CLASS_TO_PROPOSAL_KIND["excessive_fanout"]).toBe(
      "review_super_node_for_entity_resolution",
    );
  });

  it("proposalKindForFinding returns the canonical kind", () => {
    expect(proposalKindForFinding("excessive_fanout")).toBe(
      "review_super_node_for_entity_resolution",
    );
  });
});
