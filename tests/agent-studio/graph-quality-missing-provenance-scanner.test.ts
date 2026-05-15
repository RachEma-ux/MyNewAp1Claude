/**
 * Phase 23 §1 — missing-provenance scanner (5th registered scanKind).
 *
 * Detects nodes inserted without a `sourceId`. Provenance is a hard
 * rule per roadmap §4.17 — a node without `sourceId` breaks rollback,
 * citation, and drift detection. Severity is "high"; the
 * `missing_provenance → backfill_or_delete_unprovenanced_node`
 * mapping in `FINDING_CLASS_TO_PROPOSAL_KIND` lets the operator
 * either fix the provenance manually or delete the node.
 *
 * T-D first slice of the remaining execution plan
 * (`docs/implementation/agent-studio-native-graph-workspace-remaining-execution-plan.md`).
 */

import { describe, it, expect } from "vitest";
import {
  scanForMissingProvenance,
  missingProvenanceScanner,
  QUALITY_SCANNER_REGISTRY,
  proposalKindForFinding,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/public-api";

describe("scanForMissingProvenance — pure scanner", () => {
  it("flags nodes with undefined sourceId", () => {
    const findings = scanForMissingProvenance({
      nodes: [
        { typeKey: "Note", id: "n:1" /* no sourceId */ },
        { typeKey: "Note", id: "n:2", sourceId: "promotion:42" },
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingClass: "missing_provenance",
      severity: "high",
      sourceTypeKey: "Note",
      sourceId: "n:1",
    });
  });

  it("flags nodes with empty-string sourceId (a half-built projection sentinel)", () => {
    const findings = scanForMissingProvenance({
      nodes: [{ typeKey: "X", id: "x:1", sourceId: "" }],
      edges: [],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingClass: "missing_provenance",
      severity: "high",
    });
  });

  it("details.hasSourceVersionId reflects whether the orphan-provenance row carried a version id", () => {
    const findings = scanForMissingProvenance({
      nodes: [
        { typeKey: "X", id: "x:1" /* no sourceId, no sourceVersionId */ },
        { typeKey: "X", id: "x:2", sourceVersionId: "v:abc" /* no sourceId */ },
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toHaveLength(2);
    const x1 = findings.find((f) => f.sourceId === "x:1");
    const x2 = findings.find((f) => f.sourceId === "x:2");
    expect(x1?.details?.hasSourceVersionId).toBe(false);
    expect(x2?.details?.hasSourceVersionId).toBe(true);
  });

  it("returns empty when every node carries a sourceId", () => {
    const findings = scanForMissingProvenance({
      nodes: [
        { typeKey: "A", id: "a:1", sourceId: "promotion:1" },
        { typeKey: "B", id: "b:1", sourceId: "promotion:2" },
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("carries sampleTruncated into details for forensics", () => {
    const findings = scanForMissingProvenance({
      nodes: [{ typeKey: "X", id: "x:1" }],
      edges: [],
      truncated: true,
    });
    expect(findings[0].details).toMatchObject({ sampleTruncated: true });
  });

  it("handles empty sample without throwing", () => {
    const findings = scanForMissingProvenance({
      nodes: [],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });
});

describe("missingProvenanceScanner registration", () => {
  it("registers under scanKind=missing_provenance", () => {
    expect(missingProvenanceScanner.scanKind).toBe("missing_provenance");
  });

  it("is present in QUALITY_SCANNER_REGISTRY alongside the prior 4 scanners", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(kinds).toContain("orphan_node");
    expect(kinds).toContain("duplicate_entity");
    expect(kinds).toContain("stale_node");
    expect(kinds).toContain("self_loop");
    expect(kinds).toContain("missing_provenance");
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("missing_provenance → proposalKind mapping", () => {
  it("maps via FINDING_CLASS_TO_PROPOSAL_KIND to backfill_or_delete_unprovenanced_node", () => {
    expect(FINDING_CLASS_TO_PROPOSAL_KIND["missing_provenance"]).toBe(
      "backfill_or_delete_unprovenanced_node",
    );
  });

  it("proposalKindForFinding returns the canonical kind (not the review_ fallback)", () => {
    expect(proposalKindForFinding("missing_provenance")).toBe(
      "backfill_or_delete_unprovenanced_node",
    );
  });
});
