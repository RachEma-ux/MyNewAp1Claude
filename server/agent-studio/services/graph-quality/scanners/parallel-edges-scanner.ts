/**
 * Parallel-edges scanner — Phase 23 §1 seventh scanner.
 *
 * Detects multiple edges of the same `typeKey` between the same
 * ordered (source, target) node pair. In a healthy graph, an edge
 * typeKey is at-most-one between any node pair — duplicate insertion
 * typically indicates either:
 *
 *   - Projection sync retry without idempotency (PR-AT-3 drift cron
 *     defends against this for nodes; edges weren't covered).
 *   - A KGRA build run that wasn't deduplicated against a prior run.
 *   - A graph-correction proposal applier that wrote without first
 *     deleting the obsolete edge.
 *
 * Severity is "medium" — parallel edges don't break invariants per se
 * (cardinality queries still work), but they:
 *   - inflate traversal cost (Cypher path enumeration explodes)
 *   - confuse impact-analysis (the same path appears N times)
 *   - distort graph-quality metrics (duplicate-edge factor)
 *
 * The scanner emits ONE finding per duplicate pair, recording the
 * total occurrence count in `details.occurrenceCount`. This avoids
 * findings-table inflation when a pathological insert created
 * 100 duplicates of the same edge.
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

export function scanForParallelEdges(
  sample: QualityScanSample,
): readonly QualityFinding[] {
  // Key on (typeKey, sourceId, targetId) so we count parallel edges
  // of the same kind between the same pair. Different typeKeys
  // between the same pair are NOT considered parallel — they're
  // semantically different relationships and may co-exist.
  type ParallelGroup = {
    count: number;
    edgeIds: string[];
    typeKey: string;
    sourceId: string;
    targetId: string;
    sourceTypeKey: string;
    targetTypeKey: string;
  };
  const groups = new Map<string, ParallelGroup>();
  for (const e of sample.edges) {
    const key = `${e.typeKey}${e.sourceNode.id}${e.targetNode.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (e.id !== undefined) existing.edgeIds.push(e.id);
    } else {
      groups.set(key, {
        count: 1,
        edgeIds: e.id !== undefined ? [e.id] : [],
        typeKey: e.typeKey,
        sourceId: e.sourceNode.id,
        targetId: e.targetNode.id,
        sourceTypeKey: e.sourceNode.typeKey,
        targetTypeKey: e.targetNode.typeKey,
      });
    }
  }

  const findings: QualityFinding[] = [];
  for (const g of groups.values()) {
    if (g.count <= 1) continue;
    findings.push({
      findingClass: "parallel_edges",
      severity: "medium",
      sourceTypeKey: g.typeKey,
      // Use the first edge id as the finding's sourceId — operator
      // navigation lands on a concrete row.
      sourceId: g.edgeIds[0],
      details: {
        sampleTruncated: sample.truncated,
        edgeTypeKey: g.typeKey,
        sourceNodeId: g.sourceId,
        targetNodeId: g.targetId,
        sourceNodeTypeKey: g.sourceTypeKey,
        targetNodeTypeKey: g.targetTypeKey,
        occurrenceCount: g.count,
        // Collect up to 10 edge ids — enough for the operator to act
        // on; capped so a pathological 1000x duplicate doesn't blow
        // the details JSON column.
        edgeIds: g.edgeIds.slice(0, 10),
      },
    });
  }
  return findings;
}

export const parallelEdgesScanner: QualityScannerRegistration = {
  scanKind: "parallel_edges",
  run: scanForParallelEdges,
};
