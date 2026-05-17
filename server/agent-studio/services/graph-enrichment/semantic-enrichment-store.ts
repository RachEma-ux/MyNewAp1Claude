/**
 * Semantic Enrichment store — T-D.3.2 wire-up.
 *
 * ASDB persistence boundary for:
 *   - ags_semantic_enrichment_runs        (run lifecycle)
 *   - ags_semantic_enrichment_proposals   (per-proposal rows + audit
 *                                          sentinel for below-threshold
 *                                          rejections)
 *   - ags_semantic_enrichment_decisions   (operator approve/reject —
 *                                          written by the T-D.4
 *                                          approve-and-apply chain, not
 *                                          here)
 *
 * Why dedicated tables rather than agsGraphCorrectionProposals:
 *   the enrichment agent has its own run lifecycle + per-proposal
 *   confidence + source-evidence trail. The T-D.4 chain bridges
 *   approved enrichment proposals into the existing apply path; the
 *   bridge is a separate concern that does not change this writer.
 *
 * Hard rules:
 *   - No neo4j-driver import. Graph mutation flows through the
 *     T-D.4 approve-and-apply chain, NEVER from this store.
 *   - ASDB-null path: when getAsDb() returns null (no DATABASE_URL),
 *     writes throw a tagged error so callers can short-circuit.
 *     Reads aren't part of this store's contract.
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsSemanticEnrichmentRuns,
  agsSemanticEnrichmentProposals,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import type {
  SemanticEnrichmentProposal,
  SemanticEnrichmentRunInput,
  SemanticEnrichmentRunOutput,
} from "./contracts.js";

const SEMANTIC_ENRICHMENT_AGENT_KEY = "semantic_enrichment_agent";

const PROPOSAL_STATUS_PENDING = "pending";
const PROPOSAL_STATUS_REJECTED_BELOW_THRESHOLD = "rejected_below_threshold";

export interface SemanticEnrichmentStore {
  beginRun(
    input: SemanticEnrichmentRunInput,
  ): Promise<{ readonly runId: number; readonly startedAt: Date }>;

  recordProposal(
    runId: number,
    proposal: SemanticEnrichmentProposal,
  ): Promise<{ readonly proposalId: number }>;

  recordRejectedBelowThreshold(
    runId: number,
    proposal: SemanticEnrichmentProposal,
  ): Promise<void>;

  finishRun(
    runId: number,
    summary: {
      readonly proposalsCreated: number;
      readonly proposalsRejectedBelowThreshold: number;
      readonly status: SemanticEnrichmentRunOutput["status"];
      readonly completedAt: Date;
    },
  ): Promise<void>;
}

export interface CreateSemanticEnrichmentStoreOptions {
  /**
   * Drizzle ASDB instance. Defaults to the lazy `getAsDb()` accessor;
   * tests inject a `pg-mem` / stub DB shaped like the production one.
   */
  readonly db?: unknown;
}

type AsDb = NonNullable<ReturnType<typeof getAsDb>>;

function requireDb(injected: unknown): AsDb {
  const db = (injected as AsDb | null) ?? (getAsDb() as AsDb | null);
  if (!db) {
    throw new Error(
      "[T-D.3.2] semantic-enrichment-store — ASDB is null; configure DATABASE_URL_ASDB",
    );
  }
  return db;
}

export function createSemanticEnrichmentStore(
  options: CreateSemanticEnrichmentStoreOptions = {},
): SemanticEnrichmentStore {
  return {
    async beginRun(_input) {
      const db = requireDb(options.db);
      const startedAt = new Date();
      const [row] = await db
        .insert(agsSemanticEnrichmentRuns)
        .values({
          agentKey: SEMANTIC_ENRICHMENT_AGENT_KEY,
          startedAt,
          status: "running",
          proposalsCreated: 0,
        })
        .returning({ id: agsSemanticEnrichmentRuns.id });
      if (!row) {
        throw new Error(
          "[T-D.3.2] semantic-enrichment-store.beginRun — insert returned no row",
        );
      }
      return { runId: row.id, startedAt };
    },

    async recordProposal(runId, proposal) {
      const db = requireDb(options.db);
      const [row] = await db
        .insert(agsSemanticEnrichmentProposals)
        .values({
          runId,
          proposalKind: proposal.kind,
          targetTypeKey: proposal.targetTypeKey,
          targetId: proposal.targetId,
          payload: {
            proposedChange: proposal.proposedChange,
            rationale: proposal.rationale,
          } as Record<string, unknown>,
          confidence: proposal.confidence.toFixed(2),
          sourceEvidence: {
            citations: proposal.citations,
          } as Record<string, unknown>,
          status: PROPOSAL_STATUS_PENDING,
        })
        .returning({ id: agsSemanticEnrichmentProposals.id });
      if (!row) {
        throw new Error(
          "[T-D.3.2] semantic-enrichment-store.recordProposal — insert returned no row",
        );
      }
      return { proposalId: row.id };
    },

    async recordRejectedBelowThreshold(runId, proposal) {
      const db = requireDb(options.db);
      await db.insert(agsSemanticEnrichmentProposals).values({
        runId,
        proposalKind: proposal.kind,
        targetTypeKey: proposal.targetTypeKey,
        targetId: proposal.targetId,
        payload: {
          proposedChange: proposal.proposedChange,
          rationale: proposal.rationale,
          rejectionReason: "below_confidence_threshold",
        } as Record<string, unknown>,
        confidence: proposal.confidence.toFixed(2),
        sourceEvidence: {
          citations: proposal.citations,
        } as Record<string, unknown>,
        status: PROPOSAL_STATUS_REJECTED_BELOW_THRESHOLD,
      });
    },

    async finishRun(runId, summary) {
      const db = requireDb(options.db);
      await db
        .update(agsSemanticEnrichmentRuns)
        .set({
          completedAt: summary.completedAt,
          proposalsCreated: summary.proposalsCreated,
          status: summary.status,
        })
        .where(eq(agsSemanticEnrichmentRuns.id, runId));
    },
  };
}
