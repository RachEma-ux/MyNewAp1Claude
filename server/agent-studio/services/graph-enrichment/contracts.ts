/**
 * Semantic Enrichment Agent contracts — T-D.3.
 *
 * Closed taxonomy + boundary types for the LLM-driven proposer that
 * walks the institutional / code / security graphs, identifies nodes
 * with weak / missing descriptions or stale facts, and emits
 * `GraphCorrectionProposal`-shaped rows backed by source-note evidence.
 *
 * Hard rules:
 *   - LLM access ONLY via OpenRouter Model Access (boundary tested).
 *   - Source-backed: every proposal cites the source-note version.
 *   - Confidence threshold gate (config-driven; default 0.8) — below
 *     threshold proposals auto-rejected at creation time.
 *   - Reuses the Phase 13.5 agentic loop bounded-iteration scaffold.
 *   - Agent emits proposals ONLY; never mutates the graph directly.
 *     Approval flows through `agsGraphCorrectionProposals` →
 *     `approve-and-apply.ts` → `mutation-worker.ts` → reprojection.
 */

// ============================================================================
// Closed taxonomy
// ============================================================================

export const SEMANTIC_ENRICHMENT_PROPOSAL_KINDS = [
  "description_enrichment",
  "missing_property_fill",
  "stale_fact_refresh",
  "entity_disambiguation",
  "relationship_label_repair",
] as const;

export type SemanticEnrichmentProposalKind =
  (typeof SEMANTIC_ENRICHMENT_PROPOSAL_KINDS)[number];

export function isSemanticEnrichmentProposalKind(
  s: unknown,
): s is SemanticEnrichmentProposalKind {
  return (
    typeof s === "string" &&
    (SEMANTIC_ENRICHMENT_PROPOSAL_KINDS as ReadonlyArray<string>).includes(s)
  );
}

export interface SemanticEnrichmentProposalKindMetadata {
  readonly key: SemanticEnrichmentProposalKind;
  readonly label: string;
  readonly description: string;
  readonly requiresSourceCitation: boolean;
}

export const SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA: Readonly<
  Record<SemanticEnrichmentProposalKind, SemanticEnrichmentProposalKindMetadata>
> = {
  description_enrichment: {
    key: "description_enrichment",
    label: "Description enrichment",
    description:
      "Add or strengthen the human-readable description on a node whose description is empty or weak.",
    requiresSourceCitation: true,
  },
  missing_property_fill: {
    key: "missing_property_fill",
    label: "Missing property fill",
    description:
      "Populate a required-but-missing property (e.g., owner, lifecycle status) from source evidence.",
    requiresSourceCitation: true,
  },
  stale_fact_refresh: {
    key: "stale_fact_refresh",
    label: "Stale fact refresh",
    description:
      "Replace a fact whose source-note version has been superseded by a newer revision.",
    requiresSourceCitation: true,
  },
  entity_disambiguation: {
    key: "entity_disambiguation",
    label: "Entity disambiguation",
    description:
      "Distinguish two same-named entities by adding a qualifier / scope property.",
    requiresSourceCitation: true,
  },
  relationship_label_repair: {
    key: "relationship_label_repair",
    label: "Relationship label repair",
    description:
      "Replace a generic edge label (RELATED_TO) with a more specific one supported by source evidence.",
    requiresSourceCitation: true,
  },
};

// ============================================================================
// Boundary I/O
// ============================================================================

export interface SemanticEnrichmentSourceCitation {
  readonly noteId: number;
  readonly noteVersionId: number;
  readonly excerpt: string;
}

export interface SemanticEnrichmentProposal {
  readonly kind: SemanticEnrichmentProposalKind;
  readonly targetTypeKey: string;
  readonly targetId: number;
  readonly proposedChange: Record<string, unknown>;
  readonly confidence: number;
  readonly rationale: string;
  readonly citations: ReadonlyArray<SemanticEnrichmentSourceCitation>;
}

export interface SemanticEnrichmentRunInput {
  readonly workspaceId: number;
  readonly scopeTypeKey?: string;
  readonly maxProposals?: number;
  readonly minConfidence?: number;
}

export interface SemanticEnrichmentRunOutput {
  readonly runId: number;
  readonly proposalsCreated: number;
  readonly proposalsRejectedBelowThreshold: number;
  readonly status: "completed" | "failed";
  readonly startedAt: Date;
  readonly completedAt: Date;
}

// ============================================================================
// Configuration
// ============================================================================

export const DEFAULT_SEMANTIC_ENRICHMENT_MIN_CONFIDENCE = 0.8;
export const DEFAULT_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN = 50;
export const ABSOLUTE_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN = 500;

export function normalizeSemanticEnrichmentMaxProposals(
  requested: number | undefined,
): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return DEFAULT_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN;
  }
  if (requested <= 0) return DEFAULT_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN;
  if (requested > ABSOLUTE_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN) {
    return ABSOLUTE_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN;
  }
  return Math.floor(requested);
}

export function normalizeSemanticEnrichmentMinConfidence(
  requested: number | undefined,
): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return DEFAULT_SEMANTIC_ENRICHMENT_MIN_CONFIDENCE;
  }
  if (requested < 0) return 0;
  if (requested > 1) return 1;
  return requested;
}
