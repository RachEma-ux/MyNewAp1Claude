/**
 * Phase 23 §1 — duplicate-entity scanner (2nd scanner; registry-extension test).
 */

import { describe, it, expect } from "vitest";
import {
  scanForDuplicateEntities,
  duplicateEntityScanner,
  QUALITY_SCANNER_REGISTRY,
} from "../../server/agent-studio/services/graph-quality/public-api";

describe("scanForDuplicateEntities — pure scanner", () => {
  it("flags duplicate nodes that share (typeKey, sourceId)", () => {
    const findings = scanForDuplicateEntities({
      nodes: [
        { typeKey: "Entity", id: "ent:A", sourceId: "src-1" },
        { typeKey: "Entity", id: "ent:B", sourceId: "src-1" },
        { typeKey: "Entity", id: "ent:C", sourceId: "src-2" },
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingClass: "duplicate_entity",
      severity: "high",
      sourceTypeKey: "Entity",
      sourceId: "src-1",
    });
  });

  it("picks canonical by deterministic id ordering", () => {
    const findings = scanForDuplicateEntities({
      nodes: [
        { typeKey: "X", id: "z-id", sourceId: "s" },
        { typeKey: "X", id: "a-id", sourceId: "s" },
        { typeKey: "X", id: "m-id", sourceId: "s" },
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toHaveLength(2);
    // Sorted ids: a-id (canonical), m-id, z-id → two findings for m-id + z-id
    const flaggedIds = findings.map((f) => f.details?.duplicateNodeId).sort();
    expect(flaggedIds).toEqual(["m-id", "z-id"]);
    for (const f of findings) {
      expect(f.details?.canonicalNodeId).toBe("a-id");
      expect(f.details?.groupSize).toBe(3);
    }
  });

  it("does not flag nodes that differ only in typeKey", () => {
    const findings = scanForDuplicateEntities({
      nodes: [
        { typeKey: "Note", id: "n:1", sourceId: "doc-1" },
        { typeKey: "Entity", id: "e:1", sourceId: "doc-1" },
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("skips nodes without sourceId (cannot be deduped by provenance)", () => {
    const findings = scanForDuplicateEntities({
      nodes: [
        { typeKey: "X", id: "a" }, // no sourceId
        { typeKey: "X", id: "b" }, // no sourceId
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("carries sampleTruncated into details for forensics", () => {
    const findings = scanForDuplicateEntities({
      nodes: [
        { typeKey: "X", id: "a", sourceId: "s" },
        { typeKey: "X", id: "b", sourceId: "s" },
      ],
      edges: [],
      truncated: true,
    });
    expect(findings[0].details).toMatchObject({ sampleTruncated: true });
  });

  it("returns empty for a sample with no duplicates", () => {
    const findings = scanForDuplicateEntities({
      nodes: [
        { typeKey: "X", id: "a", sourceId: "s1" },
        { typeKey: "X", id: "b", sourceId: "s2" },
        { typeKey: "Y", id: "c", sourceId: "s1" },
      ],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });
});

describe("duplicateEntityScanner registration", () => {
  it("registers under scanKind=duplicate_entity", () => {
    expect(duplicateEntityScanner.scanKind).toBe("duplicate_entity");
    expect(typeof duplicateEntityScanner.run).toBe("function");
  });

  it("is present in QUALITY_SCANNER_REGISTRY", () => {
    const found = QUALITY_SCANNER_REGISTRY.find(
      (r) => r.scanKind === "duplicate_entity",
    );
    expect(found).toBeDefined();
  });

  it("registry still has unique scanKinds after the addition", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toContain("orphan_node");
    expect(kinds).toContain("duplicate_entity");
  });
});
