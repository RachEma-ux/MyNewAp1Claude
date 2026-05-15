/**
 * Excessive-fanout scanner — Phase 23 §1 eighth scanner.
 *
 * Detects nodes whose in-degree OR out-degree (within the sample)
 * exceeds a threshold. "Super-nodes" often indicate:
 *
 *   - Entity resolution miss — a generic "user" or "system" node
 *     that every record points to instead of the distinct entity
 *     being resolved.
 *   - Ontology design bug — a node typeKey used as a junction table
 *     when it should be an edge.
 *   - Spam ingest — a malicious or stuck ingest path firing the same
 *     relationship hundreds of times.
 *
 * Severity is "medium" — a super-node degrades graph traversal but
 * doesn't break invariants. The threshold (default 100) is overridable
 * per registration; future operators can register multiple instances
 * of this scanner at different thresholds for tiered alerting.
 *
 * The scanner emits ONE finding per super-node, with the actual
 * degree recorded in `details.actualDegree`. In-degree and out-degree
 * findings are emitted separately (a node may be a sink in one
 * direction and a source in the other; both are independent signals).
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

export const DEFAULT_EXCESSIVE_FANOUT_THRESHOLD = 100;

export interface ScanForExcessiveFanoutOptions {
  /** Override the in/out degree threshold. Default 100. Findings emit
   *  when degree > threshold (strict — exactly at threshold passes). */
  readonly threshold?: number;
}

export function scanForExcessiveFanout(
  sample: QualityScanSample,
  options: ScanForExcessiveFanoutOptions = {},
): readonly QualityFinding[] {
  const threshold = options.threshold ?? DEFAULT_EXCESSIVE_FANOUT_THRESHOLD;
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  // Build node lookup for typeKey decoration in the finding details
  // — `sample.nodes` provides authoritative typeKey for each node.
  const nodeTypeKey = new Map<string, string>();
  for (const n of sample.nodes) nodeTypeKey.set(n.id, n.typeKey);

  for (const e of sample.edges) {
    outDegree.set(
      e.sourceNode.id,
      (outDegree.get(e.sourceNode.id) ?? 0) + 1,
    );
    inDegree.set(
      e.targetNode.id,
      (inDegree.get(e.targetNode.id) ?? 0) + 1,
    );
  }

  const findings: QualityFinding[] = [];
  for (const [nodeId, degree] of outDegree.entries()) {
    if (degree <= threshold) continue;
    findings.push({
      findingClass: "excessive_fanout",
      severity: "medium",
      sourceTypeKey: nodeTypeKey.get(nodeId),
      sourceId: nodeId,
      details: {
        sampleTruncated: sample.truncated,
        direction: "out",
        actualDegree: degree,
        threshold,
        nodeId,
        nodeTypeKey: nodeTypeKey.get(nodeId),
      },
    });
  }
  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree <= threshold) continue;
    findings.push({
      findingClass: "excessive_fanout",
      severity: "medium",
      sourceTypeKey: nodeTypeKey.get(nodeId),
      sourceId: nodeId,
      details: {
        sampleTruncated: sample.truncated,
        direction: "in",
        actualDegree: degree,
        threshold,
        nodeId,
        nodeTypeKey: nodeTypeKey.get(nodeId),
      },
    });
  }
  return findings;
}

export const excessiveFanoutScanner: QualityScannerRegistration = {
  scanKind: "excessive_fanout",
  run: (sample) => scanForExcessiveFanout(sample),
};
