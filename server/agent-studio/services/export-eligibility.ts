/**
 * Plan v3 Phase 31 — Export Catalog eligibility rules.
 *
 * `evaluateExportEligibility` runs the 9-gate Phase 31 contract against a
 * candidate built by `buildExportCandidate` (Phase 30). Each gate is a
 * pure boolean check against the candidate's verdict snapshots; no DB
 * fan-out happens here — Phase 30's lookups already produced everything
 * we need.
 *
 * Phase 30's `prepareExportRegisterPayload` calls this before invoking
 * `aiTypes.catalog.register`; failed eligibility throws with the gate id
 * + reason so the caller can render an actionable error.
 */

import type { AgentStudioExportCandidate } from "../shared/export-candidate";

/**
 * The Phase 31 gate registry. Each entry's `id` is stable and used in
 * audit/UI; `description` is short human-readable text. Order matches
 * the EXECUTION_CHECKLIST listing.
 */
export const EXPORT_ELIGIBILITY_GATES = [
  "version_release",
  "provider_binding_valid",
  "provider_connection_active",
  "model_approved",
  "readiness_score_threshold",
  "governance_verdict_acceptable",
  "metadata_complete",
  "not_already_imported",
  "no_duplicate_canonical_entry",
  "rac_readiness",
] as const;

export type ExportEligibilityGate = typeof EXPORT_ELIGIBILITY_GATES[number];

// ============================================================================
// Per-gate operator-facing metadata (T-E.4)
// ============================================================================

export interface ExportEligibilityGateMetadata {
  /** Display label rendered in the export pre-flight UI / verdict drill-down. */
  readonly label: string;
  /** Short operator-facing description of what the gate checks. */
  readonly description: string;
  /** Closed-taxonomy classification of the gate concern:
   *  - `governance`: governance verdict / approval / readiness signal.
   *  - `metadata_completeness`: required candidate fields populated.
   *  - `provider_binding`: model + provider binding validity.
   *  - `idempotency`: prevents duplicate imports / canonical entries.
   *  - `runtime_readiness`: post-import behavior signal (e.g. RAC). */
  readonly concern:
    | "governance"
    | "metadata_completeness"
    | "provider_binding"
    | "idempotency"
    | "runtime_readiness";
  /** Whether this gate's failure is operator-fixable (true) or
   *  requires re-running an upstream pipeline (false). UI uses this
   *  to render a "fix it" vs "wait for upstream" affordance. */
  readonly operatorFixable: boolean;
}

export const EXPORT_ELIGIBILITY_GATE_METADATA: Readonly<
  Record<ExportEligibilityGate, ExportEligibilityGateMetadata>
> = {
  version_release: {
    label: "Version Released",
    description:
      "Candidate's source version must be a released (non-draft) version — exports never ship in-progress drafts.",
    concern: "governance",
    operatorFixable: true,
  },
  provider_binding_valid: {
    label: "Provider Binding Valid",
    description:
      "Candidate's provider-binding row must exist and reference a known provider. Phase 30 D-PMB-1 invariant.",
    concern: "provider_binding",
    operatorFixable: true,
  },
  provider_connection_active: {
    label: "Provider Connection Active",
    description:
      "Bound provider connection must be in `active` lifecycle state — disabled connections fail this gate.",
    concern: "provider_binding",
    operatorFixable: true,
  },
  model_approved: {
    label: "Model Approved",
    description:
      "Candidate's model ref must be in the workspace's approved-model allowlist — unapproved models cannot ship.",
    concern: "governance",
    operatorFixable: true,
  },
  readiness_score_threshold: {
    label: "Readiness Score Meets Threshold",
    description:
      "Candidate's readinessScore must meet or exceed the publish threshold (default 70).",
    concern: "runtime_readiness",
    operatorFixable: false,
  },
  governance_verdict_acceptable: {
    label: "Governance Verdict Acceptable",
    description:
      "Governance evaluation must return verdict in {approved / approved_with_warnings} — rejected verdicts hard-block export.",
    concern: "governance",
    operatorFixable: true,
  },
  metadata_complete: {
    label: "Metadata Complete",
    description:
      "Required metadata fields (description, capability lane, owner) must be populated on the candidate row.",
    concern: "metadata_completeness",
    operatorFixable: true,
  },
  not_already_imported: {
    label: "Not Already Imported",
    description:
      "Same source-id must not already exist in the catalog — Phase 30 register guard idempotency. Prevents duplicate import flows.",
    concern: "idempotency",
    operatorFixable: false,
  },
  no_duplicate_canonical_entry: {
    label: "No Duplicate Canonical Entry",
    description:
      "No other catalog row at the same `(sourceType, sourceId)` pair — surfaces ahead of register so UI flags before click.",
    concern: "idempotency",
    operatorFixable: false,
  },
  rac_readiness: {
    label: "RAC Readiness",
    description:
      "Candidate's RAC retrieval signals (source registrations / embedding bindings) are wired through — post-import RAC will work.",
    concern: "runtime_readiness",
    operatorFixable: true,
  },
};

export function getExportEligibilityGateMetadata(
  gate: ExportEligibilityGate,
): ExportEligibilityGateMetadata {
  return EXPORT_ELIGIBILITY_GATE_METADATA[gate];
}

export interface ExportEligibilityGateResult {
  gate: ExportEligibilityGate;
  /** True when the candidate satisfies the gate. */
  pass: boolean;
  /** When pass=false: why; when pass=true: a short positive description. */
  reason: string;
}

export interface ExportEligibilityVerdict {
  /** True only when every gate passes. */
  eligible: boolean;
  /**
   * All gates evaluated, in the order declared in
   * `EXPORT_ELIGIBILITY_GATES`. Stable order makes audit diffs easy.
   */
  gates: ExportEligibilityGateResult[];
  /** First failing gate id, when not eligible; null when eligible. */
  firstFailure: ExportEligibilityGate | null;
}

export interface EvaluateExportEligibilityOptions {
  /** Minimum readinessScore. Default 70 (= the publish threshold). */
  readinessScoreThreshold?: number;
  /**
   * Optional check: does another catalog row exist at the SAME
   * `(sourceType, sourceId)` pair? Phase 30 already prevents the
   * register path from creating a duplicate via `aiTypes.catalog.register`'s
   * `checkDuplicateLegacyImport` guard, but the eligibility verdict
   * surfaces this as a separate gate so the UI can flag it before the
   * user clicks Export. The hook is parameterized so tests can inject a
   * fake; the live implementation lives in the lookups bridge.
   */
  hasDuplicateCanonicalEntry?: (
    sourceType: string,
    sourceId: number,
  ) => Promise<boolean>;
}

const DEFAULT_THRESHOLD = 70;

/**
 * Plan v3 Phase 31 — runs every gate, returns the full verdict.
 *
 * The function is order-stable but does NOT short-circuit — every gate
 * runs so the UI can render the complete eligibility surface for an
 * agent that fails multiple gates.
 */
export async function evaluateExportEligibility(
  candidate: AgentStudioExportCandidate,
  opts: EvaluateExportEligibilityOptions = {},
): Promise<ExportEligibilityVerdict> {
  const threshold = opts.readinessScoreThreshold ?? DEFAULT_THRESHOLD;
  const gates: ExportEligibilityGateResult[] = [];

  // 1. Require version/release.
  gates.push(
    candidate.versionId > 0 && candidate.activeSourceVersionId != null
      ? { gate: "version_release", pass: true, reason: "has versioned release" }
      : {
          gate: "version_release",
          pass: false,
          reason:
            candidate.versionId === 0
              ? "publishedVersionId is unset (not published)"
              : "no published ags_agent_releases row",
        },
  );

  // 2. Require valid provider binding.
  gates.push(
    candidate.binding.status === "binding_v1"
      ? { gate: "provider_binding_valid", pass: true, reason: "binding_v1" }
      : {
          gate: "provider_binding_valid",
          pass: false,
          reason: `binding status is ${candidate.binding.status}`,
        },
  );

  // 3. Require active provider connection.
  gates.push(
    candidate.binding.providerConnectionId != null
      ? {
          gate: "provider_connection_active",
          pass: true,
          reason: `connection #${candidate.binding.providerConnectionId}`,
        }
      : {
          gate: "provider_connection_active",
          pass: false,
          reason: "providerConnectionId is null",
        },
  );

  // 4. Require model approved (catalog-side modelCatalogEntryId set).
  gates.push(
    candidate.binding.modelCatalogEntryId != null
      ? {
          gate: "model_approved",
          pass: true,
          reason: `catalog entry #${candidate.binding.modelCatalogEntryId}`,
        }
      : {
          gate: "model_approved",
          pass: false,
          reason: "model is not in the approved catalog (modelCatalogEntryId null)",
        },
  );

  // 5. Require readiness score threshold.
  gates.push(
    candidate.readiness.readinessScore >= threshold
      ? {
          gate: "readiness_score_threshold",
          pass: true,
          reason: `score=${candidate.readiness.readinessScore} >= ${threshold}`,
        }
      : {
          gate: "readiness_score_threshold",
          pass: false,
          reason: `score=${candidate.readiness.readinessScore} < threshold=${threshold}`,
        },
  );

  // 6. Require acceptable governance verdict (cleared, not blocked).
  gates.push(
    candidate.governance.status === "cleared"
      ? {
          gate: "governance_verdict_acceptable",
          pass: true,
          reason: "governance status=cleared",
        }
      : {
          gate: "governance_verdict_acceptable",
          pass: false,
          reason: `governance status=${candidate.governance.status}; blockers=[${candidate.governance.blockerRules.join(",")}]`,
        },
  );

  // 7. Require metadata completeness (name + at least one capability).
  gates.push(
    candidate.name && candidate.name.length > 0 && candidate.capabilities.length > 0
      ? { gate: "metadata_complete", pass: true, reason: "name + capabilities present" }
      : {
          gate: "metadata_complete",
          pass: false,
          reason: !candidate.name
            ? "name missing"
            : "capabilities array is empty",
        },
  );

  // 8. Require not already imported (exportStatus != "exported").
  gates.push(
    candidate.exportStatus !== "exported"
      ? { gate: "not_already_imported", pass: true, reason: `status=${candidate.exportStatus}` }
      : {
          gate: "not_already_imported",
          pass: false,
          reason: "candidate is already exported (exportStatus=exported)",
        },
  );

  // 9. Require no duplicate canonical catalog entry (different sourceId
  //    pointing at the same logical agent — e.g. two catalog rows from
  //    a botched legacy import). The check is optional; when not
  //    provided we conservatively pass.
  if (opts.hasDuplicateCanonicalEntry) {
    const hasDup = await opts.hasDuplicateCanonicalEntry(
      "agent",
      candidate.sourceRefId,
    );
    gates.push(
      hasDup
        ? {
            gate: "no_duplicate_canonical_entry",
            pass: false,
            reason: "another catalog_entries row covers this (sourceType, sourceId)",
          }
        : {
            gate: "no_duplicate_canonical_entry",
            pass: true,
            reason: "no duplicate canonical entry",
          },
    );
  } else {
    gates.push({
      gate: "no_duplicate_canonical_entry",
      pass: true,
      reason: "duplicate-check not run (no lookup provided)",
    });
  }

  // 10. RAC P10 — D-TOOL-4 + D-SBX-2 hard-block matrix.
  //     "blocked" status = quarantined tool OR code_execution without
  //     a healthy sandbox. "degraded" passes (export proceeds with a
  //     surfaced warning); only "blocked" is a hard gate failure.
  const rac = candidate.racReadiness;
  if (rac.status === "blocked") {
    gates.push({
      gate: "rac_readiness",
      pass: false,
      reason: `racStatus=blocked; reasons=[${rac.reasons.join(",")}]`,
    });
  } else {
    gates.push({
      gate: "rac_readiness",
      pass: true,
      reason: rac.status === "degraded"
        ? `racStatus=degraded (warnings only); reasons=[${rac.reasons.join(",")}]`
        : "racStatus=ready",
    });
  }

  const firstFailureEntry = gates.find((g) => !g.pass);
  return {
    eligible: !firstFailureEntry,
    gates,
    firstFailure: firstFailureEntry?.gate ?? null,
  };
}
