/**
 * Missing-provenance scanner — Phase 23 §1 fifth scanner.
 *
 * Detects graph nodes inserted without a `sourceId` — a violation of
 * the Phase 23 invariant from the roadmap §4.17 "Provenance and lineage
 * apply to every graph fact." A node without `sourceId` cannot be
 * traced back to a source-note version, which breaks:
 *
 *   - rollback (Phase 11 rollback walks `sourceId → notePromotion → version`)
 *   - citation (RAC retrieval-filter cites `sourceId` per chunk)
 *   - drift detection (projection-drift cron compares Postgres source
 *     row to projected node by `sourceId`)
 *
 * Severity is "high" — a missing-provenance node is a contract
 * violation, not a hygiene issue. The Phase 23 mutation worker cannot
 * propose a meaningful fix (no `sourceId` means no upstream to
 * reconcile against), so findings emitted here are operator-action:
 * the operator either backfills the `sourceId` manually or accepts
 * the loss-of-provenance + dismisses the finding.
 *
 * Hard-rule compliance:
 *   - Pure function over `QualityScanSample`. No DB I/O. No graph
 *     mutation. No `neo4j-driver` / dispatcher / openrouter imports.
 *   - Aligns with the orphan-node scanner pattern.
 */

import type {
  QualityFinding,
  QualityScanSample,
  QualityScannerRegistration,
} from "../scan-orchestrator.js";

export function scanForMissingProvenance(
  sample: QualityScanSample,
): readonly QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const n of sample.nodes) {
    // A node with no `sourceId` (undefined OR empty string) violates
    // the provenance invariant. The `??` collapses both null variants
    // to empty-string for the predicate.
    const sourceId = n.sourceId ?? "";
    if (sourceId.length > 0) continue;
    findings.push({
      findingClass: "missing_provenance",
      severity: "high",
      sourceTypeKey: n.typeKey,
      sourceId: n.id,
      details: {
        sampleTruncated: sample.truncated,
        nodeTypeKey: n.typeKey,
        nodeId: n.id,
        // Surface `sourceVersionId` too — operators sometimes find a
        // version id but no source id (a sentinel of a half-built
        // projection row).
        hasSourceVersionId: typeof n.sourceVersionId === "string"
          && n.sourceVersionId.length > 0,
      },
    });
  }
  return findings;
}

export const missingProvenanceScanner: QualityScannerRegistration = {
  scanKind: "missing_provenance",
  run: scanForMissingProvenance,
};
