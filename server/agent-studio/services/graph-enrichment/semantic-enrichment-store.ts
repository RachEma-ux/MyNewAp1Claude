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

/**
 * One row of cross-run rejection telemetry — used by
 * `listRecentRejectionsByKind` (T-D.3.γ) to drive the operator
 * "which kinds are most-often failing the confidence gate" panel.
 * One row per (runId, proposalKind) pair where below-threshold
 * rejections were recorded.
 *
 * Mirrors the security-graph `listRecentRejectionsByReason` row
 * shape (T-G.3.ε) — flatten + attach source-of-record context
 * (here: runId + runStartedAt) so operators can correlate spikes
 * to specific runs.
 */
export interface SemanticEnrichmentRecentRejectionRow {
  readonly runId: number;
  readonly proposalKind: string;
  readonly count: number;
  readonly runStartedAt: Date | null;
}

/**
 * Full per-proposal detail row used by `getProposalDetail`
 * (T-D.3.ε). Includes the heavy `payload` + `sourceEvidence` JSON
 * that the T-D.3.β list view intentionally omits — operator
 * triage needs the full rationale + cite evidence to decide
 * approve / reject.
 */
export interface SemanticEnrichmentProposalDetail {
  readonly id: number;
  readonly runId: number | null;
  readonly proposalKind: string;
  readonly targetTypeKey: string | null;
  readonly targetId: number | null;
  readonly confidence: string | null;
  readonly status: string;
  readonly payload: Record<string, unknown> | null;
  readonly sourceEvidence: Record<string, unknown> | null;
  readonly createdAt: Date;
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

  /**
   * T-D.3.γ rejection telemetry. Flattens below-threshold rejections
   * across the most-recent `runLimit` runs, grouped by
   * `(runId, proposalKind)`. Drives the operator panel that
   * surfaces "which kinds are most-often failing the confidence
   * gate".
   *
   * Returns at most `rowLimit` rows, newest-run first then by count
   * desc within a run. Same shape as security-graph
   * listRecentRejectionsByReason (T-G.3.ε).
   */
  listRecentRejectionsByKind(input: {
    readonly runLimit: number;
    readonly rowLimit: number;
  }): Promise<ReadonlyArray<SemanticEnrichmentRecentRejectionRow>>;

  /**
   * T-D.3.ε per-proposal detail (full payload + sourceEvidence).
   * Returns null when proposalId isn't found (stale-link safety
   * per the §22 lesson). Operator triage drill-in.
   */
  getProposalDetail(
    proposalId: number,
  ): Promise<SemanticEnrichmentProposalDetail | null>;
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

    async listRecentRejectionsByKind(input) {
      const db = requireDb(options.db);
      // 1) Find the N most-recent runs (any status). We don't pre-
      //    filter to runs WITH rejections because the join below
      //    filters down naturally — keeps the windowing query simple
      //    + matches the security-graph T-G.3.ε pattern.
      const recentRunRows = await db
        .select({
          id: agsSemanticEnrichmentRuns.id,
          startedAt: agsSemanticEnrichmentRuns.startedAt,
          createdAt: agsSemanticEnrichmentRuns.createdAt,
        })
        .from(agsSemanticEnrichmentRuns)
        .orderBy(desc(agsSemanticEnrichmentRuns.createdAt))
        .limit(input.runLimit);
      if (recentRunRows.length === 0) return [];

      const runIdToStartedAt = new Map<number, Date | null>(
        recentRunRows.map(
          (r: { id: number; startedAt: Date | null }) => [r.id, r.startedAt],
        ),
      );

      // 2) Per (runId, proposalKind), count below-threshold
      //    rejections. The IN() filter caps the scan to the windowed
      //    runs so a never-ending rejected_below_threshold backlog
      //    doesn't get re-scanned.
      const counts = await db
        .select({
          runId: agsSemanticEnrichmentProposals.runId,
          proposalKind: agsSemanticEnrichmentProposals.proposalKind,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(agsSemanticEnrichmentProposals)
        .where(
          and(
            eq(
              agsSemanticEnrichmentProposals.status,
              PROPOSAL_STATUS_REJECTED_BELOW_THRESHOLD,
            ),
            sql`${agsSemanticEnrichmentProposals.runId} IN (${sql.join(
              recentRunRows.map((r: { id: number }) => sql`${r.id}`),
              sql`, `,
            )})`,
          ),
        )
        .groupBy(
          agsSemanticEnrichmentProposals.runId,
          agsSemanticEnrichmentProposals.proposalKind,
        );

      // 3) Sort newest-run first then count desc within a run; cap.
      const rows: SemanticEnrichmentRecentRejectionRow[] = counts.map(
        (r: {
          runId: number | null;
          proposalKind: string;
          count: number;
        }) => ({
          runId: r.runId ?? 0,
          proposalKind: r.proposalKind,
          count: Number(r.count),
          runStartedAt: runIdToStartedAt.get(r.runId ?? -1) ?? null,
        }),
      );
      rows.sort((a, b) => {
        if (a.runId !== b.runId) return b.runId - a.runId;
        return b.count - a.count;
      });
      return rows.slice(0, input.rowLimit);
    },

    async getProposalDetail(proposalId) {
      const db = requireDb(options.db);
      const rows = await db
        .select({
          id: agsSemanticEnrichmentProposals.id,
          runId: agsSemanticEnrichmentProposals.runId,
          proposalKind: agsSemanticEnrichmentProposals.proposalKind,
          targetTypeKey: agsSemanticEnrichmentProposals.targetTypeKey,
          targetId: agsSemanticEnrichmentProposals.targetId,
          confidence: agsSemanticEnrichmentProposals.confidence,
          status: agsSemanticEnrichmentProposals.status,
          payload: agsSemanticEnrichmentProposals.payload,
          sourceEvidence: agsSemanticEnrichmentProposals.sourceEvidence,
          createdAt: agsSemanticEnrichmentProposals.createdAt,
        })
        .from(agsSemanticEnrichmentProposals)
        .where(eq(agsSemanticEnrichmentProposals.id, proposalId))
        .limit(1);
      if (rows.length === 0) return null;
      const r = rows[0] as {
        id: number;
        runId: number | null;
        proposalKind: string;
        targetTypeKey: string | null;
        targetId: number | null;
        confidence: string | null;
        status: string;
        payload: Record<string, unknown> | null;
        sourceEvidence: Record<string, unknown> | null;
        createdAt: Date;
      };
      return {
        id: r.id,
        runId: r.runId,
        proposalKind: r.proposalKind,
        targetTypeKey: r.targetTypeKey,
        targetId: r.targetId,
        confidence: r.confidence,
        status: r.status,
        payload: r.payload,
        sourceEvidence: r.sourceEvidence,
        createdAt: r.createdAt,
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
