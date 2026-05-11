/**
 * Self-loop scanner — Phase 23 §1 fourth scanner.
 *
 * Detects edges whose `sourceNode.id` equals `targetNode.id` within the
 * sampled subgraph. Emits one `self_loop` finding per such edge.
 *
 * Self-loops in the native graph workspace almost always indicate a
 * projection or promotion bug:
 *   - a deduplication merge that pointed the canonical and duplicate
 *     to the same node before the promotion finalized
 *   - a Cypher template parameter mix-up writing `MATCH (n)-[:R]-(n)`
 *   - a malformed source edge whose source and target ids collapsed
 *     onto the same identifier
 *
 * None of those cases are valid in the projection model; the operator
 * should review the source artifact and either delete the edge or
 * fix the source identifier.
 *
 * Severity is "high" by default — unlike orphans or stale nodes, a
 * self-loop is a structural defect that breaks edge-traversal
 * invariants (counts, paths, neighborhood queries) and warrants
 * faster triage. The proposal map (`finding-to-proposal`) routes
 * `self_loop` to the default `review_<class>` proposal kind so the
 * operator gets a manual_review proposal row.
 */

import type {
  QualityFinding,
  QualityScanSample,
  QualityScannerRegistration,
} from "../scan-orchestrator.js";

export function scanForSelfLoops(
  sample: QualityScanSample,
): readonly QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const e of sample.edges) {
    if (e.sourceNode.id !== e.targetNode.id) continue;
    findings.push({
      findingClass: "self_loop",
      severity: "high",
      sourceTypeKey: e.typeKey,
      sourceId: e.id,
      details: {
        sampleTruncated: sample.truncated,
        nodeId: e.sourceNode.id,
        nodeTypeKey: e.sourceNode.typeKey,
        edgeTypeKey: e.typeKey,
      },
    });
  }
  return findings;
}

export const selfLoopScanner: QualityScannerRegistration = {
  scanKind: "self_loop",
  run: scanForSelfLoops,
};
