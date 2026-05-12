/**
 * Graph Correction Proposals — retention sweep service.
 *
 * Phase 22 follow-up #661. The `ags_graph_correction_proposals` table
 * accumulates one row per graph-correction proposal (operator-issued
 * or auto-agent-issued); `ags_graph_correction_decisions` adds one
 * row per terminal decision; `ags_graph_correction_audit_events`
 * accumulates many event rows during a proposal's lifetime. No
 * retention before this PR — all three tables grow unbounded.
 *
 * Pattern mirrors `graph-quality-scans-retention.ts` (#657):
 *  - Parent with explicit FK children
 *  - Both children FK with `.references(parent.id)` and no
 *    `.onDelete()` specifier → NO ACTION / RESTRICT → application-
 *    level child-first deletion is REQUIRED.
 *  - Terminal-state filter on parent's `status` column.
 *
 * Note on "audit-events" naming: `agsGraphCorrectionAuditEvents` is
 * a PER-PROPOSAL operational event log (proposal_created /
 * proposal_decided / proposal_applied / etc) — NOT a compliance-tier
 * audit table. It is bounded by the proposal's lifecycle and is
 * useless once the parent proposal is pruned (orphaned audit rows
 * pointing at deleted proposals). This is structurally analogous to
 * `agsRuntimePolicyEvents` (per-runtime-trace forensics, swept with
 * runtime-runs cascade), not to `agsReleaseAuditRefs` (release-level
 * compliance audit, explicitly excluded from generic retention per
 * the approval-lifecycle policy).
 *
 * Status vocabulary (verified against current code):
 *  - `pending` — initial
 *  - `approved` / `rejected` / `applied` / `superseded` — terminal
 *  Default terminal statuses pruned: approved / rejected / applied /
 *  superseded.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import {
  agsGraphCorrectionProposals,
  agsGraphCorrectionDecisions,
  agsGraphCorrectionAuditEvents,
} from "../../../drizzle/tables/agent-studio-graph-quality.js";

export type GraphCorrectionProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "applied"
  | "superseded";

/** Default terminal statuses pruned by a sweep. */
const DEFAULT_TERMINAL_STATUSES: readonly GraphCorrectionProposalStatus[] = [
  "approved",
  "rejected",
  "applied",
  "superseded",
];

const ZERO_RESULT: PruneOldGraphCorrectionProposalsResult = {
  deletedProposalsCount: 0,
  deletedDecisionsCount: 0,
  deletedAuditEventsCount: 0,
};

export interface PruneOldGraphCorrectionProposalsInput {
  /** Cutoff — proposals with `createdAt < olderThan` are eligible. */
  readonly olderThan: Date;
  /**
   * Restrict to these terminal statuses. Default:
   * `["approved", "rejected", "applied", "superseded"]`.
   * `pending` proposals are NEVER swept — those are in-flight.
   *
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly statuses?: readonly GraphCorrectionProposalStatus[];
  /**
   * Restrict to one proposal kind (`eq`) or set (`inArray`).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly proposalKind?: string | readonly string[];
  /**
   * Restrict to one targetTypeKey (`eq`) or set (`inArray`).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly targetTypeKey?: string | readonly string[];
}

export interface PruneOldGraphCorrectionProposalsResult {
  readonly deletedProposalsCount: number;
  readonly deletedDecisionsCount: number;
  readonly deletedAuditEventsCount: number;
}

export interface PruneOldGraphCorrectionProposalsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldGraphCorrectionProposals(
  input: PruneOldGraphCorrectionProposalsInput,
  options: PruneOldGraphCorrectionProposalsOptions = {},
): Promise<PruneOldGraphCorrectionProposalsResult> {
  if (Array.isArray(input.statuses) && input.statuses.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.proposalKind) && input.proposalKind.length === 0) {
    return ZERO_RESULT;
  }
  if (
    Array.isArray(input.targetTypeKey) &&
    input.targetTypeKey.length === 0
  ) {
    return ZERO_RESULT;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO_RESULT;

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsGraphCorrectionProposals.createdAt, input.olderThan),
    inArray(
      agsGraphCorrectionProposals.status,
      statuses as GraphCorrectionProposalStatus[],
    ),
  ];
  const kindInput = input.proposalKind;
  if (kindInput !== undefined) {
    if (Array.isArray(kindInput)) {
      filters.push(
        inArray(agsGraphCorrectionProposals.proposalKind, kindInput),
      );
    } else {
      filters.push(
        eq(agsGraphCorrectionProposals.proposalKind, kindInput as string),
      );
    }
  }
  const tgtInput = input.targetTypeKey;
  if (tgtInput !== undefined) {
    if (Array.isArray(tgtInput)) {
      filters.push(
        inArray(agsGraphCorrectionProposals.targetTypeKey, tgtInput),
      );
    } else {
      filters.push(
        eq(agsGraphCorrectionProposals.targetTypeKey, tgtInput as string),
      );
    }
  }

  const candidates = await db
    .select({ id: agsGraphCorrectionProposals.id })
    .from(agsGraphCorrectionProposals)
    .where(and(...filters));

  if (candidates.length === 0) {
    return ZERO_RESULT;
  }

  const proposalIds = candidates.map((r) => Number(r.id));

  // Cascade-delete children first — both child tables FK with NO
  // ACTION (no .onDelete()), so parent-first would FK-violate.
  // Issue the two child deletes in parallel; they're independent.
  const [deletedDecisions, deletedAuditEvents] = await Promise.all([
    db
      .delete(agsGraphCorrectionDecisions)
      .where(inArray(agsGraphCorrectionDecisions.proposalId, proposalIds))
      .returning({ id: agsGraphCorrectionDecisions.id }),
    db
      .delete(agsGraphCorrectionAuditEvents)
      .where(inArray(agsGraphCorrectionAuditEvents.proposalId, proposalIds))
      .returning({ id: agsGraphCorrectionAuditEvents.id }),
  ]);

  const deletedProposals = await db
    .delete(agsGraphCorrectionProposals)
    .where(inArray(agsGraphCorrectionProposals.id, proposalIds))
    .returning({ id: agsGraphCorrectionProposals.id });

  return {
    deletedProposalsCount: deletedProposals.length,
    deletedDecisionsCount: deletedDecisions.length,
    deletedAuditEventsCount: deletedAuditEvents.length,
  };
}
