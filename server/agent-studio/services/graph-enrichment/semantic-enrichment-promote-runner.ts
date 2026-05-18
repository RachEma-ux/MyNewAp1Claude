/**
 * Semantic Enrichment promotion runner — T-D.4 slice 2.
 *
 * Production composition for `promoteSemanticEnrichmentProposal`:
 * supplies the 4 DI seams (reader + 3 writers) wired against ASDB
 * through Drizzle. The router calls `runPromoteSemanticEnrichment`;
 * tests of the router pass the bridge a fake reader/writers instead.
 *
 * Pattern mirrors `semantic-enrichment-runner.ts` (T-D.3.δ) which
 * composes the agent's run-time. Concentrating the Drizzle imports
 * here keeps every other graph-enrichment module clean of direct DB
 * access on this code path.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `openrouter` / `dispatchMcpToolCall`
 *     imports — promotion is metadata + audit row writes only.
 *   - Graph mutation lives DOWNSTREAM of this in the
 *     `applyApprovedProposal` chain; this runner only inserts the
 *     correction-proposal row + flips the source enrichment row's
 *     status + writes the decision-audit row.
 *   - Workspace scoping is inherited from the enrichment proposal's
 *     row (no cross-tenant promotion paths).
 */

import { and, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphCorrectionProposals,
  agsSemanticEnrichmentDecisions,
  agsSemanticEnrichmentProposals,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import { createSemanticEnrichmentStore } from "./semantic-enrichment-store.js";
import {
  promoteSemanticEnrichmentProposal,
  SEMANTIC_ENRICHMENT_PROMOTED_STATUS,
  type CorrectionProposalWriter,
  type EnrichmentDecisionWriter,
  type EnrichmentProposalReader,
  type EnrichmentProposalStatusWriter,
  type PromoteSemanticEnrichmentInput,
  type PromoteSemanticEnrichmentResult,
} from "./semantic-enrichment-promotion-bridge.js";

type AsDb = NonNullable<ReturnType<typeof getAsDb>>;

export class AsdbUnavailableForPromotionError extends Error {
  constructor() {
    super("ASDB unavailable — cannot promote semantic enrichment proposal");
    this.name = "AsdbUnavailableForPromotionError";
  }
}

/**
 * Read fn: load the enrichment proposal detail via the existing store.
 * Uses `createSemanticEnrichmentStore({ db })` so we share the read
 * path with the T-D.3.ε `getProposalDetail` tRPC endpoint.
 */
function makeReader(db: AsDb): EnrichmentProposalReader {
  const store = createSemanticEnrichmentStore({ db });
  return (proposalId) => store.getProposalDetail(proposalId);
}

/**
 * Write fn: insert into `ags_graph_correction_proposals`. Returns the
 * new row's id so the caller can stamp the audit decision with it.
 */
function makeCorrectionWriter(db: AsDb): CorrectionProposalWriter {
  return async (row) => {
    const [inserted] = await db
      .insert(agsGraphCorrectionProposals)
      .values({
        proposalKind: row.proposalKind,
        targetTypeKey: row.targetTypeKey,
        targetId: row.targetId,
        proposedChange: row.proposedChange,
        confidence: row.confidence.toFixed(2),
        rationale: row.rationale,
        proposedByUserId: row.proposedByUserId,
        proposedByAgentId: row.proposedByAgentId,
        status: row.status,
      })
      .returning({ id: agsGraphCorrectionProposals.id });
    if (!inserted) {
      throw new Error(
        "[T-D.4] correction-proposal insert returned no row",
      );
    }
    return { correctionProposalId: inserted.id };
  };
}

/**
 * Write fn: flip the source enrichment proposal's status to
 * `promoted`, scoped by `status = 'pending'` to detect concurrent
 * mutations (returns `wasUpdated: false` when a race already
 * promoted or rejected the row).
 */
function makeStatusWriter(db: AsDb): EnrichmentProposalStatusWriter {
  return async ({ proposalId, nextStatus }) => {
    const updated = await db
      .update(agsSemanticEnrichmentProposals)
      .set({ status: nextStatus })
      .where(
        and(
          eq(agsSemanticEnrichmentProposals.id, proposalId),
          eq(agsSemanticEnrichmentProposals.status, "pending"),
        ),
      )
      .returning({ id: agsSemanticEnrichmentProposals.id });
    return { wasUpdated: updated.length > 0 };
  };
}

/**
 * Write fn: append a `promoted` decision row to
 * `ags_semantic_enrichment_decisions`. Audit-trail only; the bridge
 * treats failure here as non-fatal.
 */
function makeDecisionWriter(db: AsDb): EnrichmentDecisionWriter {
  return async ({
    proposalId,
    decision,
    decidedByUserId,
    rationale,
    correctionProposalId,
  }) => {
    await db.insert(agsSemanticEnrichmentDecisions).values({
      proposalId,
      decision,
      decidedByUserId,
      // Pack the new correction-proposal id into the rationale so
      // operators reading the decision row can trace the bridge.
      // The bridge already injects a base rationale; we prefix the
      // correction id for clean traceability.
      rationale:
        rationale !== null && rationale !== undefined
          ? `[promoted → correctionProposalId=${correctionProposalId}] ${rationale}`
          : `[promoted → correctionProposalId=${correctionProposalId}]`,
    });
  };
}

export interface RunPromoteSemanticEnrichmentOptions {
  /**
   * Test seam — when supplied, the runner skips the live ASDB
   * resolution and uses this db. Production omits this.
   */
  readonly db?: AsDb;
}

/**
 * Operator-callable promotion entry point. Resolves ASDB (or honors
 * the test-seam override), wires the 4 production DI fns, calls the
 * bridge. Throws `AsdbUnavailableForPromotionError` if ASDB is null.
 */
export async function runPromoteSemanticEnrichment(
  input: PromoteSemanticEnrichmentInput,
  options: RunPromoteSemanticEnrichmentOptions = {},
): Promise<PromoteSemanticEnrichmentResult> {
  const db = options.db ?? (getAsDb() as AsDb | null);
  if (!db) {
    throw new AsdbUnavailableForPromotionError();
  }
  return promoteSemanticEnrichmentProposal(input, {
    readEnrichmentProposal: makeReader(db),
    writeCorrectionProposal: makeCorrectionWriter(db),
    writeEnrichmentStatus: makeStatusWriter(db),
    writeEnrichmentDecision: makeDecisionWriter(db),
  });
}

// Re-export the bridge's promoted-status constant so callers don't
// need a second import.
export { SEMANTIC_ENRICHMENT_PROMOTED_STATUS };
