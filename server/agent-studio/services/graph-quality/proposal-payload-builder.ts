/**
 * Proposal payload builder.
 *
 * Phase 23 §1. Given a graph-quality finding, produces a concrete
 * `proposedChange.payload` describing HOW the eventual mutation worker
 * should fix it. The payload is a discriminated union — each finding
 * class has a canonical "default action" the worker can apply without
 * re-running the scanner.
 *
 * Default actions (operators can override before approval):
 *   - orphan_node            → `archive_node`
 *   - duplicate_entity       → `merge_into_canonical`
 *   - stale_node             → `re_promote_with_source_version`
 *   - (unknown finding kind) → `manual_review` (no automation; opens
 *     a proposal anyway so the audit trail captures the finding)
 *
 * The builder is pure: same finding row → same payload. It does not
 * read the graph; node identities, source identifiers, etc. all come
 * from the finding row + its `details`. Re-running the builder over
 * the same finding row is safe and idempotent.
 *
 * The payload is the proposal's machine-actionable side. The future
 * mutation worker pattern-matches on `payload.kind` and dispatches
 * to a typed applier; new finding kinds add a payload variant +
 * applier in lockstep.
 */

import type { QualityFinding } from "./scan-orchestrator.js";

export type ProposalPayload =
  | {
      readonly kind: "archive_node";
      readonly typeKey: string;
      readonly nodeId: string;
      readonly reason: string;
    }
  | {
      readonly kind: "merge_into_canonical";
      readonly typeKey: string;
      readonly canonicalNodeId: string;
      readonly duplicateNodeId: string;
      readonly groupSize: number;
    }
  | {
      readonly kind: "re_promote_with_source_version";
      readonly sourceTypeKey: string;
      readonly sourceId: string;
      readonly targetNodeId: string;
    }
  | {
      readonly kind: "manual_review";
      readonly findingClass: string;
      readonly note: string;
    };

/**
 * Shape the builder accepts. Matches what the finding-to-proposal
 * converter reads from the `ags_graph_quality_findings` row — but
 * accepts the in-memory `QualityFinding` shape too (no id), since the
 * Quality Agent run path can build a payload before persisting.
 */
export interface FindingForPayload {
  readonly findingClass: string;
  readonly severity: string;
  readonly sourceTypeKey: string | null;
  readonly sourceId: string | null;
  readonly details: Record<string, unknown> | null;
}

function getString(
  details: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!details) return null;
  const v = details[key];
  return typeof v === "string" ? v : null;
}

function getNumber(
  details: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!details) return null;
  const v = details[key];
  return typeof v === "number" ? v : null;
}

export function buildProposalPayload(
  finding: FindingForPayload,
): ProposalPayload {
  const { findingClass, sourceTypeKey, sourceId, details } = finding;

  switch (findingClass) {
    case "orphan_node": {
      const nodeId = getString(details, "nodeSourceId") ?? sourceId ?? "";
      return {
        kind: "archive_node",
        typeKey: sourceTypeKey ?? "Unknown",
        nodeId,
        reason: "orphan_node: zero edges in sampled subgraph",
      };
    }
    case "duplicate_entity": {
      const canonical = getString(details, "canonicalNodeId") ?? "";
      const duplicate = getString(details, "duplicateNodeId") ?? "";
      const groupSize = getNumber(details, "groupSize") ?? 2;
      return {
        kind: "merge_into_canonical",
        typeKey: sourceTypeKey ?? "Unknown",
        canonicalNodeId: canonical,
        duplicateNodeId: duplicate,
        groupSize,
      };
    }
    case "stale_node": {
      const nodeId = getString(details, "nodeId") ?? "";
      return {
        kind: "re_promote_with_source_version",
        sourceTypeKey: sourceTypeKey ?? "Unknown",
        sourceId: sourceId ?? "",
        targetNodeId: nodeId,
      };
    }
    default:
      return {
        kind: "manual_review",
        findingClass,
        note: `No automated payload builder registered for findingClass="${findingClass}". Operator must hand-craft the change.`,
      };
  }
}

/**
 * Helper used by tests + Quality Agent run paths that want the
 * payload for an in-memory finding (pre-persist).
 */
export function buildProposalPayloadFromQualityFinding(
  finding: QualityFinding,
): ProposalPayload {
  return buildProposalPayload({
    findingClass: finding.findingClass,
    severity: finding.severity,
    sourceTypeKey: finding.sourceTypeKey ?? null,
    sourceId: finding.sourceId ?? null,
    details: finding.details ?? null,
  });
}
