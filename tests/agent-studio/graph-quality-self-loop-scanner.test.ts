/**
 * Phase 23 §1 — self-loop scanner (4th registered scanKind).
 */

import { describe, it, expect } from "vitest";
import {
  scanForSelfLoops,
  selfLoopScanner,
  QUALITY_SCANNER_REGISTRY,
  proposalKindForFinding,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/public-api";

describe("scanForSelfLoops — pure scanner", () => {
  it("flags edges whose source and target node ids are equal", () => {
    const findings = scanForSelfLoops({
      nodes: [
        { typeKey: "Note", id: "n:1" },
        { typeKey: "Note", id: "n:2" },
      ],
      edges: [
        {
          typeKey: "LINKS_TO",
          id: "e:1",
          sourceNode: { typeKey: "Note", id: "n:1" },
          targetNode: { typeKey: "Note", id: "n:1" }, // self-loop
        },
        {
          typeKey: "LINKS_TO",
          id: "e:2",
          sourceNode: { typeKey: "Note", id: "n:1" },
          targetNode: { typeKey: "Note", id: "n:2" }, // OK
        },
      ],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingClass: "self_loop",
      severity: "high",
      sourceTypeKey: "LINKS_TO",
      sourceId: "e:1",
    });
    expect(findings[0].details).toMatchObject({
      nodeId: "n:1",
      nodeTypeKey: "Note",
      edgeTypeKey: "LINKS_TO",
    });
  });

  it("does not flag distinct-endpoint edges", () => {
    const findings = scanForSelfLoops({
      nodes: [],
      edges: [
        {
          typeKey: "LINKS_TO",
          sourceNode: { typeKey: "Note", id: "n:1" },
          targetNode: { typeKey: "Note", id: "n:2" },
        },
        {
          typeKey: "DERIVED_FROM",
          sourceNode: { typeKey: "Note", id: "n:3" },
          targetNode: { typeKey: "Note", id: "n:4" },
        },
      ],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("emits one finding per self-loop edge (multi-loop case)", () => {
    const findings = scanForSelfLoops({
      nodes: [],
      edges: [
        {
          typeKey: "A",
          id: "e:a",
          sourceNode: { typeKey: "T", id: "n:1" },
          targetNode: { typeKey: "T", id: "n:1" },
        },
        {
          typeKey: "B",
          id: "e:b",
          sourceNode: { typeKey: "T", id: "n:2" },
          targetNode: { typeKey: "T", id: "n:2" },
        },
        {
          typeKey: "C",
          id: "e:c",
          sourceNode: { typeKey: "T", id: "n:1" },
          targetNode: { typeKey: "T", id: "n:2" },
        },
      ],
      truncated: false,
    });
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.details?.nodeId).sort()).toEqual([
      "n:1",
      "n:2",
    ]);
  });

  it("carries sampleTruncated into details for forensics", () => {
    const findings = scanForSelfLoops({
      nodes: [],
      edges: [
        {
          typeKey: "R",
          sourceNode: { typeKey: "X", id: "x:1" },
          targetNode: { typeKey: "X", id: "x:1" },
        },
      ],
      truncated: true,
    });
    expect(findings[0].details).toMatchObject({ sampleTruncated: true });
  });

  it("handles empty sample without throwing", () => {
    const findings = scanForSelfLoops({ nodes: [], edges: [], truncated: false });
    expect(findings).toEqual([]);
  });
});

describe("selfLoopScanner registration", () => {
  it("registers under scanKind=self_loop", () => {
    expect(selfLoopScanner.scanKind).toBe("self_loop");
  });

  it("is present in QUALITY_SCANNER_REGISTRY alongside the prior three scanners", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(kinds).toContain("orphan_node");
    expect(kinds).toContain("duplicate_entity");
    expect(kinds).toContain("stale_node");
    expect(kinds).toContain("self_loop");
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("self_loop → proposalKind mapping", () => {
  it("falls through to the review_<class> default (no canonical mapping yet)", () => {
    expect(proposalKindForFinding("self_loop")).toBe("review_self_loop");
    expect(FINDING_CLASS_TO_PROPOSAL_KIND.self_loop).toBeUndefined();
  });
});
