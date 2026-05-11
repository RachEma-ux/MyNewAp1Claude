/**
 * Graph Correction Proposal Lifecycle.
 *
 * Phase 23. Wires the dormant `ags_graph_correction_proposals` +
 * `ags_graph_correction_decisions` + `ags_graph_correction_audit_events`
 * tables. Closes the Phase 23 acceptance criteria:
 *
 *   - Graph Quality Agent creates proposals only.
 *   - Semantic Enrichment Agent creates proposals only.
 *   - Human/governance approval is required for source-of-truth
 *     mutation.
 *   - Approved correction is auditable.
 *   - Rejected correction is auditable.
 *
 * Lifecycle:
 *   1. `submitCorrectionProposal` — agents (or operators) write a
 *      proposal row with `status="pending"`. An audit event with
 *      `eventKind="submitted"` records the submission.
 *   2. `approveCorrectionProposal` — operator approval flips the
 *      proposal `status="approved"` and writes a decision row +
 *      `eventKind="approved"` audit row. The actual graph mutation
 *      (apply the proposed change to Postgres / re-project to
 *      Neo4j) is OUT OF SCOPE for this service — that's
 *      Phase 7.5 + Phase 11.5 (graph change proposals already
 *      ship the mutation path).
 *   3. `rejectCorrectionProposal` — flips status to "rejected",
 *      writes a decision row + `eventKind="rejected"` audit row.
 *   4. `requestRevisionForProposal` — operator asks for changes;
 *      flips status to "revision_requested" and audits.
 *
 * The proposal cannot transition out of `pending` more than once;
 * decisions are recorded once per proposal and the status is the
 * source of truth for "what was decided." Audit events accumulate
 * (one per state transition) so the operator can replay the
 * decision history.
 *
 * ADR: docs/architecture/agent-studio-graph-quality-strategy.md (future)
 */

import { and, desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphCorrectionProposals,
  agsGraphCorrectionDecisions,
  agsGraphCorrectionAuditEvents,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class CorrectionProposalNotFoundError extends Error {
  constructor(public readonly proposalId: number) {
    super(`Graph correction proposal ${proposalId} not found`);
    this.name = "CorrectionProposalNotFoundError";
  }
}

export class ProposalNotProposerError extends Error {
  constructor(
    public readonly proposalId: number,
    public readonly proposedByUserId: number | null,
    public readonly attemptedUserId: number,
  ) {
    super(
      `Proposal ${proposalId} can only be withdrawn by the original proposer (proposedByUserId=${proposedByUserId ?? "<agent>"}); user ${attemptedUserId} is not authorized.`,
    );
    this.name = "ProposalNotProposerError";
  }
}

export class ProposalAlreadyDecidedError extends Error {
  constructor(
    public readonly proposalId: number,
    public readonly currentStatus: string,
  ) {
    super(
      `Proposal ${proposalId} cannot be decided again (current status: ${currentStatus})`,
    );
    this.name = "ProposalAlreadyDecidedError";
  }
}

export type ProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "withdrawn";

export interface SubmitProposalInput {
  readonly proposalKind: string;
  readonly targetTypeKey?: string | null;
  readonly targetId?: number | null;
  readonly proposedChange: Record<string, unknown>;
  readonly confidence?: number | null;
  readonly rationale?: string | null;
  readonly proposedByUserId?: number | null;
  readonly proposedByAgentId?: number | null;
}

export interface ProposalRow {
  readonly id: number;
  readonly proposalKind: string;
  readonly targetTypeKey: string | null;
  readonly targetId: number | null;
  readonly proposedChange: Record<string, unknown>;
  readonly confidence: number | null;
  readonly rationale: string | null;
  readonly proposedByUserId: number | null;
  readonly proposedByAgentId: number | null;
  readonly status: ProposalStatus;
  readonly createdAt: Date;
}

export interface ServiceOptions {
  readonly getDb?: typeof getAsDb;
}

function rowToProposal(r: Record<string, unknown>): ProposalRow {
  return {
    id: Number(r.id),
    proposalKind: String(r.proposalKind),
    targetTypeKey: r.targetTypeKey == null ? null : String(r.targetTypeKey),
    targetId: r.targetId == null ? null : Number(r.targetId),
    proposedChange:
      (r.proposedChange as Record<string, unknown> | undefined) ?? {},
    confidence: r.confidence == null ? null : Number(r.confidence),
    rationale: r.rationale == null ? null : String(r.rationale),
    proposedByUserId:
      r.proposedByUserId == null ? null : Number(r.proposedByUserId),
    proposedByAgentId:
      r.proposedByAgentId == null ? null : Number(r.proposedByAgentId),
    status: String(r.status) as ProposalStatus,
    createdAt: r.createdAt as Date,
  };
}

export async function submitCorrectionProposal(
  input: SubmitProposalInput,
  options: ServiceOptions = {},
): Promise<ProposalRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const inserted = await db
    .insert(agsGraphCorrectionProposals)
    .values({
      proposalKind: input.proposalKind,
      targetTypeKey: input.targetTypeKey ?? null,
      targetId: input.targetId ?? null,
      proposedChange: input.proposedChange,
      // Drizzle numeric() expects a string in inserts.
      confidence:
        input.confidence == null ? null : String(input.confidence),
      rationale: input.rationale ?? null,
      proposedByUserId: input.proposedByUserId ?? null,
      proposedByAgentId: input.proposedByAgentId ?? null,
      status: "pending",
    })
    .returning({
      id: agsGraphCorrectionProposals.id,
      proposalKind: agsGraphCorrectionProposals.proposalKind,
      targetTypeKey: agsGraphCorrectionProposals.targetTypeKey,
      targetId: agsGraphCorrectionProposals.targetId,
      proposedChange: agsGraphCorrectionProposals.proposedChange,
      confidence: agsGraphCorrectionProposals.confidence,
      rationale: agsGraphCorrectionProposals.rationale,
      proposedByUserId: agsGraphCorrectionProposals.proposedByUserId,
      proposedByAgentId: agsGraphCorrectionProposals.proposedByAgentId,
      status: agsGraphCorrectionProposals.status,
      createdAt: agsGraphCorrectionProposals.createdAt,
    });
  const row = inserted[0];
  if (!row) throw new Error("Failed to insert correction proposal");

  await db.insert(agsGraphCorrectionAuditEvents).values({
    proposalId: row.id,
    eventKind: "submitted",
    metadata: {
      proposedByUserId: input.proposedByUserId ?? null,
      proposedByAgentId: input.proposedByAgentId ?? null,
      confidence: input.confidence ?? null,
    },
  });

  return rowToProposal(row);
}

export async function getProposalById(
  proposalId: number,
  options: ServiceOptions = {},
): Promise<ProposalRow | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: agsGraphCorrectionProposals.id,
      proposalKind: agsGraphCorrectionProposals.proposalKind,
      targetTypeKey: agsGraphCorrectionProposals.targetTypeKey,
      targetId: agsGraphCorrectionProposals.targetId,
      proposedChange: agsGraphCorrectionProposals.proposedChange,
      confidence: agsGraphCorrectionProposals.confidence,
      rationale: agsGraphCorrectionProposals.rationale,
      proposedByUserId: agsGraphCorrectionProposals.proposedByUserId,
      proposedByAgentId: agsGraphCorrectionProposals.proposedByAgentId,
      status: agsGraphCorrectionProposals.status,
      createdAt: agsGraphCorrectionProposals.createdAt,
    })
    .from(agsGraphCorrectionProposals)
    .where(eq(agsGraphCorrectionProposals.id, proposalId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToProposal(rows[0]);
}

export interface ListProposalsInput {
  readonly status?: ProposalStatus;
  readonly proposalKind?: string;
  readonly limit?: number;
}

export async function listProposals(
  input: ListProposalsInput = {},
  options: ServiceOptions = {},
): Promise<ProposalRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const filters = [];
  if (input.status !== undefined) {
    filters.push(eq(agsGraphCorrectionProposals.status, input.status));
  }
  if (input.proposalKind !== undefined) {
    filters.push(
      eq(agsGraphCorrectionProposals.proposalKind, input.proposalKind),
    );
  }

  const rows = await db
    .select({
      id: agsGraphCorrectionProposals.id,
      proposalKind: agsGraphCorrectionProposals.proposalKind,
      targetTypeKey: agsGraphCorrectionProposals.targetTypeKey,
      targetId: agsGraphCorrectionProposals.targetId,
      proposedChange: agsGraphCorrectionProposals.proposedChange,
      confidence: agsGraphCorrectionProposals.confidence,
      rationale: agsGraphCorrectionProposals.rationale,
      proposedByUserId: agsGraphCorrectionProposals.proposedByUserId,
      proposedByAgentId: agsGraphCorrectionProposals.proposedByAgentId,
      status: agsGraphCorrectionProposals.status,
      createdAt: agsGraphCorrectionProposals.createdAt,
    })
    .from(agsGraphCorrectionProposals)
    .where(
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters),
    )
    .orderBy(desc(agsGraphCorrectionProposals.createdAt))
    .limit(input.limit ?? 100);
  return rows.map(rowToProposal);
}

interface DecideInput {
  proposalId: number;
  decision: "approved" | "rejected" | "revision_requested";
  decidedByUserId: number;
  rationale?: string | null;
}

async function decide(
  input: DecideInput,
  options: ServiceOptions = {},
): Promise<ProposalRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const current = await getProposalById(input.proposalId, options);
  if (!current) throw new CorrectionProposalNotFoundError(input.proposalId);
  if (current.status !== "pending") {
    throw new ProposalAlreadyDecidedError(input.proposalId, current.status);
  }

  const nextStatus: ProposalStatus = input.decision;

  await db
    .update(agsGraphCorrectionProposals)
    .set({ status: nextStatus })
    .where(eq(agsGraphCorrectionProposals.id, input.proposalId));

  await db.insert(agsGraphCorrectionDecisions).values({
    proposalId: input.proposalId,
    decision: input.decision,
    decidedByUserId: input.decidedByUserId,
    rationale: input.rationale ?? null,
  });

  await db.insert(agsGraphCorrectionAuditEvents).values({
    proposalId: input.proposalId,
    eventKind: input.decision,
    metadata: {
      decidedByUserId: input.decidedByUserId,
      rationale: input.rationale ?? null,
    },
  });

  const updated = await getProposalById(input.proposalId, options);
  if (!updated) throw new CorrectionProposalNotFoundError(input.proposalId);
  return updated;
}

export async function approveCorrectionProposal(
  proposalId: number,
  decidedByUserId: number,
  rationale: string | null = null,
  options: ServiceOptions = {},
): Promise<ProposalRow> {
  return decide(
    { proposalId, decision: "approved", decidedByUserId, rationale },
    options,
  );
}

export async function rejectCorrectionProposal(
  proposalId: number,
  decidedByUserId: number,
  rationale: string | null = null,
  options: ServiceOptions = {},
): Promise<ProposalRow> {
  return decide(
    { proposalId, decision: "rejected", decidedByUserId, rationale },
    options,
  );
}

export async function requestRevisionForProposal(
  proposalId: number,
  decidedByUserId: number,
  rationale: string | null = null,
  options: ServiceOptions = {},
): Promise<ProposalRow> {
  return decide(
    {
      proposalId,
      decision: "revision_requested",
      decidedByUserId,
      rationale,
    },
    options,
  );
}

// ---------- withdraw ----------

/**
 * Proposer-initiated retract. Different conceptual lane from
 * approve/reject/requestRevision (which are reviewer decisions):
 *   - only the original proposer (userId on the row) can withdraw —
 *     agent-proposed rows cannot be withdrawn through this path
 *   - the proposal must still be pending (a decided proposal is
 *     locked; the operator must revert through the existing
 *     approval/rejection paths)
 *
 * Writes a decision row with decision="withdrawn" and an audit event
 * with eventKind="withdrawn" so the proposal's history stays linear.
 */
export async function withdrawCorrectionProposal(
  proposalId: number,
  withdrawerUserId: number,
  rationale: string | null = null,
  options: ServiceOptions = {},
): Promise<ProposalRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const current = await getProposalById(proposalId, options);
  if (!current) throw new CorrectionProposalNotFoundError(proposalId);
  if (current.status !== "pending") {
    throw new ProposalAlreadyDecidedError(proposalId, current.status);
  }
  if (current.proposedByUserId !== withdrawerUserId) {
    throw new ProposalNotProposerError(
      proposalId,
      current.proposedByUserId,
      withdrawerUserId,
    );
  }

  await db
    .update(agsGraphCorrectionProposals)
    .set({ status: "withdrawn" })
    .where(eq(agsGraphCorrectionProposals.id, proposalId));

  await db.insert(agsGraphCorrectionDecisions).values({
    proposalId,
    decision: "withdrawn",
    decidedByUserId: withdrawerUserId,
    rationale: rationale ?? null,
  });

  await db.insert(agsGraphCorrectionAuditEvents).values({
    proposalId,
    eventKind: "withdrawn",
    metadata: {
      withdrawerUserId,
      rationale: rationale ?? null,
    },
  });

  const updated = await getProposalById(proposalId, options);
  if (!updated) throw new CorrectionProposalNotFoundError(proposalId);
  return updated;
}

// ---------- bulk approve ----------

export interface BulkApproveCorrectionProposalsInput {
  readonly proposalIds: readonly number[];
  readonly decidedByUserId: number;
  readonly rationale?: string;
}

export interface BulkApproveCorrectionProposalsResult {
  readonly approved: readonly ProposalRow[];
  readonly skipped: readonly {
    readonly proposalId: number;
    readonly reason: "not_found" | "already_decided";
    readonly currentStatus?: string;
  }[];
}

/**
 * Approve many correction proposals in one call. Per-proposal failures
 * (not-found, already-decided) are collected into `skipped` instead of
 * aborting the batch — operators clearing a triage queue want partial
 * success over all-or-nothing.
 *
 * Shape-symmetric to `bulkDismissFindings` (graph-quality §1) — same
 * deduplication + same skip-vs-bail policy. AsdbUnavailable and other
 * fatal errors bubble out: the whole batch can't proceed if the DB
 * is gone.
 *
 * `proposalIds` is deduplicated server-side; the same id twice in the
 * input list approves once (the second pass falls into already-decided
 * and skips).
 */
export async function bulkApproveCorrectionProposals(
  input: BulkApproveCorrectionProposalsInput,
  options: ServiceOptions = {},
): Promise<BulkApproveCorrectionProposalsResult> {
  const uniqueIds = Array.from(new Set(input.proposalIds));
  const approved: ProposalRow[] = [];
  const skipped: BulkApproveCorrectionProposalsResult["skipped"][number][] = [];

  for (const proposalId of uniqueIds) {
    try {
      const result = await approveCorrectionProposal(
        proposalId,
        input.decidedByUserId,
        input.rationale ?? null,
        options,
      );
      approved.push(result);
    } catch (err) {
      if (err instanceof CorrectionProposalNotFoundError) {
        skipped.push({ proposalId, reason: "not_found" });
      } else if (err instanceof ProposalAlreadyDecidedError) {
        skipped.push({
          proposalId,
          reason: "already_decided",
          currentStatus: err.currentStatus,
        });
      } else {
        // AsdbUnavailable etc. — bubble out.
        throw err;
      }
    }
  }

  return { approved, skipped };
}

// ---------- bulk reject ----------

export interface BulkRejectCorrectionProposalsInput {
  readonly proposalIds: readonly number[];
  readonly decidedByUserId: number;
  readonly rationale?: string;
}

export interface BulkRejectCorrectionProposalsResult {
  readonly rejected: readonly ProposalRow[];
  readonly skipped: readonly {
    readonly proposalId: number;
    readonly reason: "not_found" | "already_decided";
    readonly currentStatus?: string;
  }[];
}

/**
 * Reject many correction proposals in one call. Shape-symmetric to
 * `bulkApproveCorrectionProposals` — same dedup, same skip-vs-bail
 * policy, same returned-skipped shape.
 *
 * Operators use this to dismiss a batch of low-quality findings'
 * proposals (e.g. orphan-node findings on intentionally-disconnected
 * sentinel nodes that the autonomous scanner can't recognize).
 */
export async function bulkRejectCorrectionProposals(
  input: BulkRejectCorrectionProposalsInput,
  options: ServiceOptions = {},
): Promise<BulkRejectCorrectionProposalsResult> {
  const uniqueIds = Array.from(new Set(input.proposalIds));
  const rejected: ProposalRow[] = [];
  const skipped: BulkRejectCorrectionProposalsResult["skipped"][number][] = [];

  for (const proposalId of uniqueIds) {
    try {
      const result = await rejectCorrectionProposal(
        proposalId,
        input.decidedByUserId,
        input.rationale ?? null,
        options,
      );
      rejected.push(result);
    } catch (err) {
      if (err instanceof CorrectionProposalNotFoundError) {
        skipped.push({ proposalId, reason: "not_found" });
      } else if (err instanceof ProposalAlreadyDecidedError) {
        skipped.push({
          proposalId,
          reason: "already_decided",
          currentStatus: err.currentStatus,
        });
      } else {
        // AsdbUnavailable etc. — bubble out.
        throw err;
      }
    }
  }

  return { rejected, skipped };
}

export interface AuditEventRow {
  readonly id: number;
  readonly proposalId: number;
  readonly eventKind: string;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export async function listAuditEvents(
  proposalId: number,
  options: ServiceOptions = {},
): Promise<AuditEventRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: agsGraphCorrectionAuditEvents.id,
      proposalId: agsGraphCorrectionAuditEvents.proposalId,
      eventKind: agsGraphCorrectionAuditEvents.eventKind,
      metadata: agsGraphCorrectionAuditEvents.metadata,
      createdAt: agsGraphCorrectionAuditEvents.createdAt,
    })
    .from(agsGraphCorrectionAuditEvents)
    .where(eq(agsGraphCorrectionAuditEvents.proposalId, proposalId))
    .orderBy(desc(agsGraphCorrectionAuditEvents.createdAt));

  return rows.map((r) => ({
    id: Number(r.id),
    proposalId: Number(r.proposalId),
    eventKind: String(r.eventKind),
    metadata:
      (r.metadata as Record<string, unknown> | null | undefined) ?? null,
    createdAt: r.createdAt as Date,
  }));
}
