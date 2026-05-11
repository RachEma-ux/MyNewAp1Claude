/**
 * Duplicate-entity scanner — Phase 23 §1 second scanner.
 *
 * Flags pairs (or larger groups) of nodes that share the same
 * `(typeKey, sourceId)` tuple within the sampled subgraph. Two nodes
 * deriving from the same source artifact and same type should have
 * been deduped at projection time; if they appear as distinct rows
 * with distinct `id` values, something upstream double-wrote.
 *
 * Severity is "high" — duplicate entities split provenance,
 * scatter relationship targets, and break Text2Cypher resolution
 * via the `(typeKey, sourceId)` lookup pattern. Operators triage
 * via the Phase 23 proposal lifecycle (merge proposal kind).
 *
 * Emits one `duplicate_entity` finding per duplicate node (the
 * "canonical" first occurrence is left unflagged so the merge target
 * is implicit; downstream proposal generation picks the canonical
 * by deterministic id ordering).
 */

import type {
  QualityFinding,
  QualityScanSample,
  QualityScannerRegistration,
} from "../scan-orchestrator.js";

export function scanForDuplicateEntities(
  sample: QualityScanSample,
): readonly QualityFinding[] {
  // Group node ids by (typeKey, sourceId). Nodes without a sourceId
  // cannot be duplicate-detected by source provenance and are skipped.
  const groups = new Map<string, { typeKey: string; sourceId: string; ids: string[] }>();
  for (const n of sample.nodes) {
    if (!n.sourceId) continue;
    const key = `${n.typeKey}::${n.sourceId}`;
    const g = groups.get(key);
    if (g) {
      g.ids.push(n.id);
    } else {
      groups.set(key, { typeKey: n.typeKey, sourceId: n.sourceId, ids: [n.id] });
    }
  }

  const findings: QualityFinding[] = [];
  for (const g of groups.values()) {
    if (g.ids.length < 2) continue;
    // Sort to make canonical-selection deterministic; first id is canonical,
    // remaining ids are flagged as duplicates.
    const sorted = [...g.ids].sort();
    const canonicalId = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      findings.push({
        findingClass: "duplicate_entity",
        severity: "high",
        sourceTypeKey: g.typeKey,
        sourceId: g.sourceId,
        details: {
          sampleTruncated: sample.truncated,
          duplicateNodeId: sorted[i],
          canonicalNodeId: canonicalId,
          groupSize: g.ids.length,
        },
      });
    }
  }
  return findings;
}

export const duplicateEntityScanner: QualityScannerRegistration = {
  scanKind: "duplicate_entity",
  run: scanForDuplicateEntities,
};
