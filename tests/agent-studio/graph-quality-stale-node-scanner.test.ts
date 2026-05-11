/**
 * Phase 23 §1 — stale-node scanner (3rd registered scanKind).
 */

import { describe, it, expect } from "vitest";
import {
  scanForStaleNodes,
  staleNodeScanner,
  QUALITY_SCANNER_REGISTRY,
  proposalKindForFinding,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/public-api";

describe("scanForStaleNodes — pure scanner", () => {
  it("flags nodes that have sourceId but no sourceVersionId", () => {
    const findings = scanForStaleNodes({
      nodes: [
        { typeKey: "Note", id: "n:1", sourceId: "doc-1" }, // stale
        {
          typeKey: "Note",
          id: "n:2",
          sourceId: "doc-2",
          sourceVersionId: "v7",
        }, // OK
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingClass: "stale_node",
      severity: "medium",
      sourceTypeKey: "Note",
      sourceId: "doc-1",
    });
    expect(findings[0].details).toMatchObject({
      nodeId: "n:1",
      reason: "missing_source_version_id",
    });
  });

  it("does not flag nodes that lack both sourceId and sourceVersionId", () => {
    const findings = scanForStaleNodes({
      nodes: [{ typeKey: "X", id: "x:1" }],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("does not flag nodes that have both sourceId and sourceVersionId", () => {
    const findings = scanForStaleNodes({
      nodes: [
        { typeKey: "X", id: "x:1", sourceId: "s1", sourceVersionId: "v1" },
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("carries sampleTruncated into details for forensics", () => {
    const findings = scanForStaleNodes({
      nodes: [{ typeKey: "X", id: "x:1", sourceId: "s1" }],
      edges: [],
      truncated: true,
    });
    expect(findings[0].details).toMatchObject({ sampleTruncated: true });
  });

  it("emits one finding per stale node", () => {
    const findings = scanForStaleNodes({
      nodes: [
        { typeKey: "Note", id: "n:1", sourceId: "d-1" },
        { typeKey: "Note", id: "n:2", sourceId: "d-2" },
        { typeKey: "Note", id: "n:3", sourceId: "d-3", sourceVersionId: "v1" },
        { typeKey: "Note", id: "n:4", sourceId: "d-4" },
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.details?.nodeId).sort()).toEqual([
      "n:1",
      "n:2",
      "n:4",
    ]);
  });
});

describe("staleNodeScanner registration", () => {
  it("registers under scanKind=stale_node", () => {
    expect(staleNodeScanner.scanKind).toBe("stale_node");
  });

  it("is present in QUALITY_SCANNER_REGISTRY alongside the prior two scanners", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(kinds).toContain("orphan_node");
    expect(kinds).toContain("duplicate_entity");
    expect(kinds).toContain("stale_node");
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("stale_node → proposalKind mapping", () => {
  it("maps stale_node → re_promote_with_source_version", () => {
    expect(proposalKindForFinding("stale_node")).toBe(
      "re_promote_with_source_version",
    );
    expect(FINDING_CLASS_TO_PROPOSAL_KIND.stale_node).toBe(
      "re_promote_with_source_version",
    );
  });
});
