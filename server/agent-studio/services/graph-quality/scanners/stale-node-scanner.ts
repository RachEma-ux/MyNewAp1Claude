/**
 * Stale-node scanner — Phase 23 §1 third scanner.
 *
 * Flags nodes in the sampled subgraph that lack `sourceVersionId`
 * metadata when their `sourceId` is set. Projection invariants
 * require every promoted node to carry the version pin of the
 * source artifact that produced it, so the projection can be
 * rebuilt deterministically when the source revises.
 *
 * Without a `sourceVersionId`:
 *   - the projection cannot tell "is this node still current?"
 *     vs. "is this node from a superseded source version?"
 *   - drift detection cannot operate (the projection-drift
 *     scanner relies on version-pin comparison)
 *   - operator UI cannot link back to a specific note version
 *
 * Severity is "medium" by default — like orphans, stale nodes
 * aren't broken per se, but they cannot participate in versioned
 * rebuilds. Operators triage them via the Phase 23 proposal
 * lifecycle (`re_promote_with_version` proposal kind once the
 * proposal-payload builder lands).
 *
 * Nodes without a `sourceId` are skipped — they can't be expected
 * to have version metadata if they aren't sourced from a versioned
 * artifact at all.
 */

import type {
  QualityFinding,
  QualityScanSample,
  QualityScannerRegistration,
} from "../scan-orchestrator.js";

export function scanForStaleNodes(
  sample: QualityScanSample,
): readonly QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const n of sample.nodes) {
    if (!n.sourceId) continue; // un-sourced nodes are out of scope
    if (n.sourceVersionId) continue; // version-pinned — OK
    findings.push({
      findingClass: "stale_node",
      severity: "medium",
      sourceTypeKey: n.typeKey,
      sourceId: n.sourceId,
      details: {
        sampleTruncated: sample.truncated,
        nodeId: n.id,
        reason: "missing_source_version_id",
      },
    });
  }
  return findings;
}

export const staleNodeScanner: QualityScannerRegistration = {
  scanKind: "stale_node",
  run: scanForStaleNodes,
};
