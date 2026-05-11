/**
 * Phase 23 §1 — proposal payload builder.
 *
 * Tests the per-findingClass discriminated-union payload shapes
 * that proposals carry forward to the future mutation worker.
 */

import { describe, it, expect } from "vitest";
import {
  buildProposalPayload,
  buildProposalPayloadFromQualityFinding,
} from "../../server/agent-studio/services/graph-quality/proposal-payload-builder";

describe("buildProposalPayload — orphan_node", () => {
  it("emits archive_node with nodeId pulled from details.nodeSourceId", () => {
    const payload = buildProposalPayload({
      findingClass: "orphan_node",
      severity: "medium",
      sourceTypeKey: "Note",
      sourceId: "note:42",
      details: { sampleTruncated: false, nodeSourceId: "42" },
    });
    expect(payload).toEqual({
      kind: "archive_node",
      typeKey: "Note",
      nodeId: "42",
      reason: "orphan_node: zero edges in sampled subgraph",
    });
  });

  it("falls back to sourceId when nodeSourceId is missing", () => {
    const payload = buildProposalPayload({
      findingClass: "orphan_node",
      severity: "medium",
      sourceTypeKey: "Note",
      sourceId: "note:99",
      details: { sampleTruncated: false },
    });
    expect(payload).toMatchObject({ kind: "archive_node", nodeId: "note:99" });
  });
});

describe("buildProposalPayload — duplicate_entity", () => {
  it("emits merge_into_canonical with canonical/duplicate ids + groupSize", () => {
    const payload = buildProposalPayload({
      findingClass: "duplicate_entity",
      severity: "high",
      sourceTypeKey: "Entity",
      sourceId: "src-1",
      details: {
        canonicalNodeId: "ent:A",
        duplicateNodeId: "ent:B",
        groupSize: 3,
      },
    });
    expect(payload).toEqual({
      kind: "merge_into_canonical",
      typeKey: "Entity",
      canonicalNodeId: "ent:A",
      duplicateNodeId: "ent:B",
      groupSize: 3,
    });
  });

  it("defaults groupSize=2 when details omit it", () => {
    const payload = buildProposalPayload({
      findingClass: "duplicate_entity",
      severity: "high",
      sourceTypeKey: "Entity",
      sourceId: "src-1",
      details: {
        canonicalNodeId: "a",
        duplicateNodeId: "b",
      },
    });
    expect(payload).toMatchObject({ kind: "merge_into_canonical", groupSize: 2 });
  });
});

describe("buildProposalPayload — stale_node", () => {
  it("emits re_promote_with_source_version with source identifiers + target nodeId", () => {
    const payload = buildProposalPayload({
      findingClass: "stale_node",
      severity: "medium",
      sourceTypeKey: "Note",
      sourceId: "doc-1",
      details: { nodeId: "n:1", reason: "missing_source_version_id" },
    });
    expect(payload).toEqual({
      kind: "re_promote_with_source_version",
      sourceTypeKey: "Note",
      sourceId: "doc-1",
      targetNodeId: "n:1",
    });
  });
});

describe("buildProposalPayload — unknown finding class", () => {
  it("falls back to manual_review with a note", () => {
    const payload = buildProposalPayload({
      findingClass: "weird_future_kind",
      severity: "low",
      sourceTypeKey: null,
      sourceId: null,
      details: null,
    });
    expect(payload).toMatchObject({
      kind: "manual_review",
      findingClass: "weird_future_kind",
    });
  });
});

describe("buildProposalPayloadFromQualityFinding", () => {
  it("accepts the in-memory QualityFinding shape from a scanner", () => {
    const payload = buildProposalPayloadFromQualityFinding({
      findingClass: "orphan_node",
      severity: "medium",
      sourceTypeKey: "Note",
      sourceId: "note:7",
      details: { sampleTruncated: false, nodeSourceId: "7" },
    });
    expect(payload).toMatchObject({ kind: "archive_node", nodeId: "7" });
  });

  it("is idempotent — same input twice produces deep-equal payloads", () => {
    const input = {
      findingClass: "duplicate_entity",
      severity: "high" as const,
      sourceTypeKey: "X",
      sourceId: "s",
      details: { canonicalNodeId: "a", duplicateNodeId: "b", groupSize: 4 },
    };
    expect(buildProposalPayloadFromQualityFinding(input)).toEqual(
      buildProposalPayloadFromQualityFinding(input),
    );
  });
});

describe("payload discriminated union — kind values are stable", () => {
  it("enumerates the canonical kind set", () => {
    const kinds = new Set<string>();
    for (const findingClass of [
      "orphan_node",
      "duplicate_entity",
      "stale_node",
      "wild_unknown",
    ]) {
      const p = buildProposalPayload({
        findingClass,
        severity: "low",
        sourceTypeKey: null,
        sourceId: null,
        details: null,
      });
      kinds.add(p.kind);
    }
    expect(kinds.has("archive_node")).toBe(true);
    expect(kinds.has("merge_into_canonical")).toBe(true);
    expect(kinds.has("re_promote_with_source_version")).toBe(true);
    expect(kinds.has("manual_review")).toBe(true);
  });
});
