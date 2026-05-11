/**
 * Orphan-node scanner — Phase 23 §1 first scanner.
 *
 * Detects graph nodes that participate in zero edges in the sampled
 * subgraph. Emits one `orphan_node` finding per such node.
 *
 * Severity is "medium" by default — orphan nodes aren't broken per se,
 * but indicate either:
 *   - a promotion that never got linked (graph_skill_pack without
 *     PROMOTED_TO source edge)
 *   - a stale derivation (entity whose source note was deleted)
 *   - a manual addition with no provenance edge
 *
 * Operators triage these via the Phase 23 graph-correction proposal
 * lifecycle.
 */

import type {
  QualityFinding,
  QualityScanSample,
  QualityScannerRegistration,
} from "../scan-orchestrator.js";

export function scanForOrphanNodes(
  sample: QualityScanSample,
): readonly QualityFinding[] {
  const participatingNodeIds = new Set<string>();
  for (const e of sample.edges) {
    participatingNodeIds.add(e.sourceNode.id);
    participatingNodeIds.add(e.targetNode.id);
  }

  const findings: QualityFinding[] = [];
  for (const n of sample.nodes) {
    if (participatingNodeIds.has(n.id)) continue;
    findings.push({
      findingClass: "orphan_node",
      severity: "medium",
      sourceTypeKey: n.typeKey,
      sourceId: n.id,
      details: {
        sampleTruncated: sample.truncated,
        nodeSourceId: n.sourceId,
      },
    });
  }
  return findings;
}

export const orphanNodeScanner: QualityScannerRegistration = {
  scanKind: "orphan_node",
  run: scanForOrphanNodes,
};
