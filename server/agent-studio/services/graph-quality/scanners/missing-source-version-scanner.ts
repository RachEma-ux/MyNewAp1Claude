/**
 * Missing-source-version scanner — Phase 23 §1 tenth scanner.
 *
 * Detects projection nodes that have a `sourceId` set but NO
 * `sourceVersionId` — a half-built projection state that violates
 * the version-pinning invariant required by Phase 11 rollback +
 * Phase 28 acceptance criteria #13 ("Graph Skill note references
 * are version-pinned") and #12 ("CAG note references are
 * version-pinned").
 *
 * The pre-existing `missing-provenance-scanner.ts` (#986) catches
 * the LARGER case (no sourceId AT ALL). This scanner catches the
 * subtler case where sourceId exists but versionId doesn't —
 * typically a projection that ran before the version-pinning
 * migration completed, or an emitter that wrote sourceId before
 * versionId was wired.
 *
 * Severity is "medium" — the node IS traceable to a source row
 * (sourceId is set), but operators cannot reconcile it against a
 * specific source-version. Rollback still works at the source-row
 * level but loses cross-version replay.
 *
 * Hard-rule compliance:
 *   - Pure function over `QualityScanSample`. No DB I/O. No graph
 *     mutation. No `neo4j-driver` / dispatcher / openrouter imports.
 *   - Aligns with missing-provenance-scanner shape (#986).
 */

import type {
  QualityFinding,
  QualityScanSample,
  QualityScannerRegistration,
} from "../scan-orchestrator.js";

export function scanForMissingSourceVersion(
  sample: QualityScanSample,
): readonly QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const n of sample.nodes) {
    const sourceId = n.sourceId ?? "";
    // Skip nodes that don't have sourceId — those are caught by the
    // missing-provenance scanner (#986).
    if (sourceId.length === 0) continue;
    const sourceVersionId = n.sourceVersionId ?? "";
    if (sourceVersionId.length > 0) continue;
    findings.push({
      findingClass: "missing_source_version",
      severity: "medium",
      sourceTypeKey: n.typeKey,
      sourceId: n.id,
      details: {
        sampleTruncated: sample.truncated,
        nodeTypeKey: n.typeKey,
        nodeId: n.id,
        sourceId,
      },
    });
  }
  return findings;
}

export const missingSourceVersionScanner: QualityScannerRegistration = {
  scanKind: "missing_source_version",
  run: scanForMissingSourceVersion,
};
