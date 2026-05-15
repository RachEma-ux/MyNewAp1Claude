/**
 * Phase 23 §1 — isolated-subgraph scanner (9th registered scanKind).
 *
 * Detects connected components below a size threshold. Flags
 * stale/orphan workspace sections.
 */

import { describe, it, expect } from "vitest";
import {
  scanForIsolatedSubgraphs,
  isolatedSubgraphScanner,
  DEFAULT_ISOLATED_COMPONENT_THRESHOLD,
  QUALITY_SCANNER_REGISTRY,
  proposalKindForFinding,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/public-api";

describe("scanForIsolatedSubgraphs — pure scanner", () => {
  it("emits no findings when the only component meets the threshold", () => {
    const nodes = Array.from({ length: 6 }, (_, i) => ({
      typeKey: "N",
      id: `n:${i}`,
    }));
    const edges = nodes
      .slice(0, -1)
      .map((n, i) => ({
        typeKey: "L",
        sourceNode: n,
        targetNode: nodes[i + 1],
      }));
    const findings = scanForIsolatedSubgraphs({
      nodes,
      edges,
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("flags a single isolated pair when threshold is 5", () => {
    const findings = scanForIsolatedSubgraphs({
      nodes: [
        { typeKey: "N", id: "a:1" },
        { typeKey: "N", id: "a:2" },
        { typeKey: "N", id: "b:1" },
        { typeKey: "N", id: "b:2" },
        { typeKey: "N", id: "b:3" },
        { typeKey: "N", id: "b:4" },
        { typeKey: "N", id: "b:5" },
      ],
      edges: [
        // Main cluster (5 nodes).
        {
          typeKey: "L",
          sourceNode: { typeKey: "N", id: "b:1" },
          targetNode: { typeKey: "N", id: "b:2" },
        },
        {
          typeKey: "L",
          sourceNode: { typeKey: "N", id: "b:2" },
          targetNode: { typeKey: "N", id: "b:3" },
        },
        {
          typeKey: "L",
          sourceNode: { typeKey: "N", id: "b:3" },
          targetNode: { typeKey: "N", id: "b:4" },
        },
        {
          typeKey: "L",
          sourceNode: { typeKey: "N", id: "b:4" },
          targetNode: { typeKey: "N", id: "b:5" },
        },
        // Isolated pair.
        {
          typeKey: "L",
          sourceNode: { typeKey: "N", id: "a:1" },
          targetNode: { typeKey: "N", id: "a:2" },
        },
      ],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingClass: "isolated_subgraph",
      severity: "low",
    });
    expect(findings[0].details).toMatchObject({
      componentSize: 2,
      threshold: 5,
    });
  });

  it("DEFAULT_ISOLATED_COMPONENT_THRESHOLD is 5", () => {
    expect(DEFAULT_ISOLATED_COMPONENT_THRESHOLD).toBe(5);
  });

  it("explicit threshold override is honored", () => {
    const findings = scanForIsolatedSubgraphs(
      {
        nodes: [
          { typeKey: "N", id: "a:1" },
          { typeKey: "N", id: "a:2" },
        ],
        edges: [
          {
            typeKey: "L",
            sourceNode: { typeKey: "N", id: "a:1" },
            targetNode: { typeKey: "N", id: "a:2" },
          },
        ],
        truncated: false,
      },
      { threshold: 2 },
    );
    // Component size = 2, threshold = 2. Strict less-than → no
    // finding emitted.
    expect(findings).toEqual([]);
  });

  it("isolated singleton (no edges) emits a finding at default threshold", () => {
    const findings = scanForIsolatedSubgraphs({
      nodes: [
        { typeKey: "N", id: "lonely:1" },
        { typeKey: "N", id: "main:1" },
        { typeKey: "N", id: "main:2" },
        { typeKey: "N", id: "main:3" },
        { typeKey: "N", id: "main:4" },
        { typeKey: "N", id: "main:5" },
      ],
      edges: [
        {
          typeKey: "L",
          sourceNode: { typeKey: "N", id: "main:1" },
          targetNode: { typeKey: "N", id: "main:2" },
        },
        {
          typeKey: "L",
          sourceNode: { typeKey: "N", id: "main:2" },
          targetNode: { typeKey: "N", id: "main:3" },
        },
        {
          typeKey: "L",
          sourceNode: { typeKey: "N", id: "main:3" },
          targetNode: { typeKey: "N", id: "main:4" },
        },
        {
          typeKey: "L",
          sourceNode: { typeKey: "N", id: "main:4" },
          targetNode: { typeKey: "N", id: "main:5" },
        },
      ],
      truncated: false,
    });
    // 'lonely:1' is a 1-node component; 'main:*' is a 5-node
    // component. Default threshold 5 → 5-node component passes,
    // 1-node component is flagged.
    expect(findings).toHaveLength(1);
    expect(findings[0].sourceId).toBe("lonely:1");
    expect(findings[0].details).toMatchObject({ componentSize: 1 });
  });

  it("caps nodeIds at 20 to defend the details JSON column", () => {
    const nodes = Array.from({ length: 50 }, (_, i) => ({
      typeKey: "N",
      id: `lonely:${i}`,
    }));
    // No edges → 50 separate 1-node components. Each emits a finding
    // (threshold default 5, component size 1).
    const findings = scanForIsolatedSubgraphs({
      nodes,
      edges: [],
      truncated: false,
    });
    expect(findings.length).toBe(50);
    for (const f of findings) {
      expect(
        (f.details?.nodeIds as readonly string[]).length,
      ).toBeLessThanOrEqual(20);
    }
  });

  it("carries sampleTruncated into details", () => {
    const findings = scanForIsolatedSubgraphs({
      nodes: [{ typeKey: "N", id: "a:1" }],
      edges: [],
      truncated: true,
    });
    expect(findings[0].details).toMatchObject({ sampleTruncated: true });
  });

  it("handles empty sample without throwing", () => {
    const findings = scanForIsolatedSubgraphs({
      nodes: [],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });
});

describe("isolatedSubgraphScanner registration", () => {
  it("registers under scanKind=isolated_subgraph", () => {
    expect(isolatedSubgraphScanner.scanKind).toBe("isolated_subgraph");
  });

  it("is present in QUALITY_SCANNER_REGISTRY alongside the prior 8 scanners", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(kinds).toContain("orphan_node");
    expect(kinds).toContain("duplicate_entity");
    expect(kinds).toContain("stale_node");
    expect(kinds).toContain("self_loop");
    expect(kinds).toContain("missing_provenance");
    expect(kinds).toContain("dangling_edge_endpoint");
    expect(kinds).toContain("parallel_edges");
    expect(kinds).toContain("excessive_fanout");
    expect(kinds).toContain("isolated_subgraph");
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("isolated_subgraph → proposalKind mapping", () => {
  it("maps to review_isolated_subgraph_for_stale_or_orphan", () => {
    expect(FINDING_CLASS_TO_PROPOSAL_KIND["isolated_subgraph"]).toBe(
      "review_isolated_subgraph_for_stale_or_orphan",
    );
  });

  it("proposalKindForFinding returns the canonical kind", () => {
    expect(proposalKindForFinding("isolated_subgraph")).toBe(
      "review_isolated_subgraph_for_stale_or_orphan",
    );
  });
});
