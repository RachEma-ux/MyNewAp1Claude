/**
 * Dangling-edge-endpoint scanner — Phase 23 §1 sixth scanner.
 *
 * Detects edges whose `sourceNode.id` or `targetNode.id` does not
 * appear in the sample's `nodes` array. In a healthy projection
 * every edge endpoint corresponds to an existing node; a dangling
 * endpoint means either:
 *
 *   - A node was deleted but its edges weren't cleaned up
 *     (FK-cascade violation in the projection writer).
 *   - An edge was written for a node that hasn't projected yet
 *     (ordering bug in the projection sync — see Phase 1.7 ADR).
 *   - A sample-pagination artifact (the node exists but didn't fit
 *     the sample). The scanner is sample-bound, so we tag findings
 *     with `sampleTruncated` so the operator can distinguish.
 *
 * Severity is "high" because a dangling endpoint is a structural
 * invariant violation — traversals from the missing endpoint break,
 * graph queries return wrong cardinality, and the projection's
 * "Postgres is source of truth" invariant is undermined.
 *
 * The scanner emits one finding per dangling endpoint (so a fully-
 * orphan edge emits two findings — one for each missing endpoint —
 * surfacing both sides for the operator). Distinct emissions also
 * let `finding-to-proposal` build per-endpoint backfill proposals
 * via the existing `review_<findingClass>` fallback.
 *
 * Hard-rule compliance: pure function over `QualityScanSample`. No
 * DB I/O. No graph mutation. No dispatcher / openrouter / neo4j-driver
 * imports.
 */

import type {
  QualityFinding,
  QualityScanSample,
  QualityScannerRegistration,
} from "../scan-orchestrator.js";

export function scanForDanglingEdgeEndpoints(
  sample: QualityScanSample,
): readonly QualityFinding[] {
  const nodeIds = new Set<string>();
  for (const n of sample.nodes) nodeIds.add(n.id);

  const findings: QualityFinding[] = [];
  for (const e of sample.edges) {
    if (!nodeIds.has(e.sourceNode.id)) {
      findings.push({
        findingClass: "dangling_edge_endpoint",
        severity: "high",
        sourceTypeKey: e.typeKey,
        sourceId: e.id,
        details: {
          sampleTruncated: sample.truncated,
          edgeTypeKey: e.typeKey,
          edgeId: e.id,
          missingEndpoint: "source",
          missingNodeId: e.sourceNode.id,
          missingNodeTypeKey: e.sourceNode.typeKey,
        },
      });
    }
    if (!nodeIds.has(e.targetNode.id)) {
      findings.push({
        findingClass: "dangling_edge_endpoint",
        severity: "high",
        sourceTypeKey: e.typeKey,
        sourceId: e.id,
        details: {
          sampleTruncated: sample.truncated,
          edgeTypeKey: e.typeKey,
          edgeId: e.id,
          missingEndpoint: "target",
          missingNodeId: e.targetNode.id,
          missingNodeTypeKey: e.targetNode.typeKey,
        },
      });
    }
  }
  return findings;
}

export const danglingEdgeEndpointScanner: QualityScannerRegistration = {
  scanKind: "dangling_edge_endpoint",
  run: scanForDanglingEdgeEndpoints,
};
