/**
 * Phase 23 §1 — missing-source-version scanner (10th registered scanKind).
 *
 * Detects nodes with `sourceId` set but no `sourceVersionId` — a
 * half-built projection state that violates version-pinning.
 */

import { describe, it, expect } from "vitest";
import {
  scanForMissingSourceVersion,
  missingSourceVersionScanner,
  QUALITY_SCANNER_REGISTRY,
  proposalKindForFinding,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/public-api";

describe("scanForMissingSourceVersion — pure scanner", () => {
  it("emits no findings for empty sample", () => {
    expect(
      scanForMissingSourceVersion({
        nodes: [],
        edges: [],
        truncated: false,
      }),
    ).toEqual([]);
  });

  it("emits no findings when every node has sourceVersionId", () => {
    expect(
      scanForMissingSourceVersion({
        nodes: [
          {
            typeKey: "Note",
            id: "note:1",
            sourceId: "1",
            sourceVersionId: "v1",
          },
          {
            typeKey: "Note",
            id: "note:2",
            sourceId: "2",
            sourceVersionId: "v2",
          },
        ],
        edges: [],
        truncated: false,
      }),
    ).toEqual([]);
  });

  it("skips nodes with NO sourceId (caught by missing-provenance scanner)", () => {
    expect(
      scanForMissingSourceVersion({
        nodes: [
          { typeKey: "Note", id: "note:1" }, // no sourceId at all
          { typeKey: "Note", id: "note:2", sourceId: "" }, // empty sourceId
        ],
        edges: [],
        truncated: false,
      }),
    ).toEqual([]);
  });

  it("flags nodes with sourceId but no sourceVersionId", () => {
    const findings = scanForMissingSourceVersion({
      nodes: [
        { typeKey: "Note", id: "note:1", sourceId: "1" }, // versionId absent
        {
          typeKey: "Note",
          id: "note:2",
          sourceId: "2",
          sourceVersionId: "",
        }, // versionId empty
        {
          typeKey: "Note",
          id: "note:3",
          sourceId: "3",
          sourceVersionId: "v3",
        }, // OK
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.sourceId)).toEqual(["note:1", "note:2"]);
    expect(findings.every((f) => f.findingClass === "missing_source_version")).toBe(
      true,
    );
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });

  it("details carry nodeTypeKey + nodeId + sourceId for triage", () => {
    const findings = scanForMissingSourceVersion({
      nodes: [{ typeKey: "Note", id: "note:1", sourceId: "src-42" }],
      edges: [],
      truncated: false,
    });
    expect(findings[0].details).toMatchObject({
      nodeTypeKey: "Note",
      nodeId: "note:1",
      sourceId: "src-42",
    });
  });

  it("carries sampleTruncated flag", () => {
    const findings = scanForMissingSourceVersion({
      nodes: [{ typeKey: "Note", id: "note:1", sourceId: "src-42" }],
      edges: [],
      truncated: true,
    });
    expect(findings[0].details).toMatchObject({ sampleTruncated: true });
  });
});

describe("missingSourceVersionScanner registration", () => {
  it("registers under scanKind=missing_source_version", () => {
    expect(missingSourceVersionScanner.scanKind).toBe("missing_source_version");
  });

  it("appears in QUALITY_SCANNER_REGISTRY alongside the 9 prior scanners", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(kinds).toContain("missing_source_version");
    expect(kinds).toContain("missing_provenance");
    expect(kinds).toContain("orphan_node");
    expect(kinds).toContain("isolated_subgraph");
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.length).toBeGreaterThanOrEqual(10);
  });
});

describe("missing_source_version → proposalKind mapping", () => {
  it("maps to backfill_source_version_or_reproject_node", () => {
    expect(FINDING_CLASS_TO_PROPOSAL_KIND["missing_source_version"]).toBe(
      "backfill_source_version_or_reproject_node",
    );
  });

  it("proposalKindForFinding returns the canonical kind", () => {
    expect(proposalKindForFinding("missing_source_version")).toBe(
      "backfill_source_version_or_reproject_node",
    );
  });
});
