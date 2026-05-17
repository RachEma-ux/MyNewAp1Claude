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

import { and, desc, eq, sql } from "drizzle-orm";
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

/**
 * Operator-facing list row for `agsSemanticEnrichmentRuns`. Same
 * shape as the row but typed to TS primitives + nullable timestamps.
 * Used by `listRecentRuns` (T-D.3.β).
 */
export interface SemanticEnrichmentRunListRow {
  readonly id: number;
  readonly agentKey: string;
  readonly status: string;
  readonly proposalsCreated: number;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Operator-facing list row for `agsSemanticEnrichmentProposals`.
 * Strips the heavy `payload` / `sourceEvidence` JSON for list views;
 * detail surfaces (not yet built) re-read with the full JSON. Used
 * by `listProposals` (T-D.3.β).
 */
export interface SemanticEnrichmentProposalListRow {
  readonly id: number;
  readonly runId: number | null;
  readonly proposalKind: string;
  readonly targetTypeKey: string | null;
  readonly targetId: number | null;
  readonly confidence: string | null;
  readonly status: string;
  readonly createdAt: Date;
}

/**
 * Aggregate stats for one enrichment run. Used by `getRunStats`
 * (T-D.3.β) to drive the per-run drill-in.
 */
export interface SemanticEnrichmentRunStats {
  readonly runId: number;
  readonly proposalCount: number;
  readonly proposalsByKind: ReadonlyArray<{
    readonly proposalKind: string;
    readonly count: number;
  }>;
  readonly proposalsByStatus: ReadonlyArray<{
    readonly status: string;
    readonly count: number;
  }>;
}

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

  /**
   * T-D.3.β read methods. Operator dashboard surfaces.
   */
  listRecentRuns(
    limit: number,
  ): Promise<ReadonlyArray<SemanticEnrichmentRunListRow>>;

  getRunStats(runId: number): Promise<SemanticEnrichmentRunStats | null>;

  listProposals(input: {
    readonly runId: number;
    readonly status?: string;
    readonly limit: number;
  }): Promise<ReadonlyArray<SemanticEnrichmentProposalListRow>>;
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

    async listRecentRuns(limit) {
      const db = requireDb(options.db);
      const rows = await db
        .select()
        .from(agsSemanticEnrichmentRuns)
        .orderBy(desc(agsSemanticEnrichmentRuns.createdAt))
        .limit(limit);
      return rows.map(
        (r: typeof agsSemanticEnrichmentRuns.$inferSelect) => ({
          id: r.id,
          agentKey: r.agentKey,
          status: r.status,
          proposalsCreated: r.proposalsCreated ?? 0,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          createdAt: r.createdAt,
        }),
      );
    },

    async getRunStats(runId) {
      const db = requireDb(options.db);
      const runRows = await db
        .select({ id: agsSemanticEnrichmentRuns.id })
        .from(agsSemanticEnrichmentRuns)
        .where(eq(agsSemanticEnrichmentRuns.id, runId))
        .limit(1);
      if (runRows.length === 0) return null;

      const byKind = await db
        .select({
          proposalKind: agsSemanticEnrichmentProposals.proposalKind,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(agsSemanticEnrichmentProposals)
        .where(eq(agsSemanticEnrichmentProposals.runId, runId))
        .groupBy(agsSemanticEnrichmentProposals.proposalKind);

      const byStatus = await db
        .select({
          status: agsSemanticEnrichmentProposals.status,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(agsSemanticEnrichmentProposals)
        .where(eq(agsSemanticEnrichmentProposals.runId, runId))
        .groupBy(agsSemanticEnrichmentProposals.status);

      const proposalCount = byKind.reduce(
        (a: number, r: { count: number }) => a + Number(r.count),
        0,
      );

      return {
        runId,
        proposalCount,
        proposalsByKind: byKind
          .map((r: { proposalKind: string; count: number }) => ({
            proposalKind: r.proposalKind,
            count: Number(r.count),
          }))
          .sort(
            (a: { count: number }, b: { count: number }) => b.count - a.count,
          ),
        proposalsByStatus: byStatus
          .map((r: { status: string; count: number }) => ({
            status: r.status,
            count: Number(r.count),
          }))
          .sort(
            (a: { count: number }, b: { count: number }) => b.count - a.count,
          ),
      };
    },

    async listProposals(input) {
      const db = requireDb(options.db);
      const whereClause =
        input.status !== undefined
          ? and(
              eq(agsSemanticEnrichmentProposals.runId, input.runId),
              eq(agsSemanticEnrichmentProposals.status, input.status),
            )
          : eq(agsSemanticEnrichmentProposals.runId, input.runId);
      const rows = await db
        .select({
          id: agsSemanticEnrichmentProposals.id,
          runId: agsSemanticEnrichmentProposals.runId,
          proposalKind: agsSemanticEnrichmentProposals.proposalKind,
          targetTypeKey: agsSemanticEnrichmentProposals.targetTypeKey,
          targetId: agsSemanticEnrichmentProposals.targetId,
          confidence: agsSemanticEnrichmentProposals.confidence,
          status: agsSemanticEnrichmentProposals.status,
          createdAt: agsSemanticEnrichmentProposals.createdAt,
        })
        .from(agsSemanticEnrichmentProposals)
        .where(whereClause)
        .orderBy(desc(agsSemanticEnrichmentProposals.createdAt))
        .limit(input.limit);
      return rows.map(
        (r: {
          id: number;
          runId: number | null;
          proposalKind: string;
          targetTypeKey: string | null;
          targetId: number | null;
          confidence: string | null;
          status: string;
          createdAt: Date;
        }) => ({
          id: r.id,
          runId: r.runId,
          proposalKind: r.proposalKind,
          targetTypeKey: r.targetTypeKey,
          targetId: r.targetId,
          confidence: r.confidence,
          status: r.status,
          createdAt: r.createdAt,
        }),
      );
    },
  };
}
