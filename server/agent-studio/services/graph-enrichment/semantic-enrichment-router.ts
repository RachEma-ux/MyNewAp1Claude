/**
 * Semantic Enrichment — tRPC router (T-D.3.α).
 *
 * Operator-facing read surface for the Semantic Enrichment Agent.
 * Contracts (T-D.3 closed taxonomy) + agent runtime (T-D.3.5 wire-up)
 * + store + evidence-collector + proposer are all shipped; this PR
 * mounts a thin router so the operator dashboard can:
 *
 *   - Enumerate the 5 closed-taxonomy proposal kinds
 *     (`listKnownProposalKinds`) for dropdown population — same
 *     parameterless-enumeration pattern as
 *     `codeGraph.listKnownTypes` / `securityGraph.listKnownTypes` /
 *     `recommendation.listKnownKinds` /
 *     `impactAnalysis.listKnownKinds`.
 *
 * **Deferred — recent-runs + per-run drill-in.**
 * Listing recent enrichment runs and per-run proposals requires
 * adding ASDB read methods to `SemanticEnrichmentStore` (currently
 * write-only). A follow-up slice (T-D.3.β) extends the store with
 * read methods and adds `listRecentRuns` / `listProposals` /
 * `getRunStats` procedures. This slice keeps the contract surface
 * minimal so the dashboard can wire up the proposal-kind picker
 * today.
 *
 * **Deferred — run-trigger mutation.**
 * Manually triggering an enrichment run is a mutation that needs
 * the candidate-selection layer plumbed (T-D.3 §candidates). That's
 * a separate slice (T-D.3.γ).
 *
 * Mounted at `agentStudio.semanticEnrichment.*`. The procedure is
 * `adminProcedure` and read-only.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - No DB I/O — the procedure is pure computation on a
 *     compile-time constant.
 *   - `adminProcedure` floor preserved.
 */

import { adminProcedure, router } from "../../../_core/trpc.js";
import {
  SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA,
  SEMANTIC_ENRICHMENT_PROPOSAL_KINDS,
  type SemanticEnrichmentProposalKind,
  type SemanticEnrichmentProposalKindMetadata,
} from "./contracts.js";

// ============================================================================
// Output envelopes
// ============================================================================

export interface ListSemanticEnrichmentProposalKindsEnvelope {
  readonly kinds: ReadonlyArray<SemanticEnrichmentProposalKind>;
  readonly metadata: Readonly<
    Record<
      SemanticEnrichmentProposalKind,
      SemanticEnrichmentProposalKindMetadata
    >
  >;
}

// ============================================================================
// Router
// ============================================================================

export const semanticEnrichmentRouter = router({
  /**
   * Closed-taxonomy enumeration. Parameterless. Mirrors
   * `codeGraph.listKnownTypes` / `securityGraph.listKnownTypes` /
   * `recommendation.listKnownKinds` /
   * `impactAnalysis.listKnownKinds`.
   *
   * Drives the operator dashboard's "Enrichment proposal kinds"
   * picker — the 5 closed-taxonomy values + per-kind label +
   * description + `requiresSourceCitation` flag (all 5 require
   * citations, but the field is part of the contract so future
   * cite-less kinds can be added without a flag-day cutover).
   */
  listKnownProposalKinds: adminProcedure.query(
    (): ListSemanticEnrichmentProposalKindsEnvelope => ({
      kinds: SEMANTIC_ENRICHMENT_PROPOSAL_KINDS,
      metadata: SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA,
    }),
  ),
});

export type SemanticEnrichmentRouter = typeof semanticEnrichmentRouter;
