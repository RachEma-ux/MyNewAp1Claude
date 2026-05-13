/**
 * Graph Change Proposals — retention sweep service.
 *
 * Phase 22 follow-up #673. Sibling of `graph-correction-proposals-
 * retention.ts` (#661) — same 4-table cascade shape but for the
 * Phase 11.5 structural-change subsystem (graph mutations, entity
 * resolution, projection corrections, …), NOT the autonomous
 * graph-quality remediation subsystem.
 *
 * Writers: `services/graph-change-proposals/adapter-asdb.ts` —
 * inserts on createProposal, status updates on approve/reject/
 * withdraw, audit-event appends throughout the lifecycle.
 *
 * Tables (drizzle/tables/agent-studio-graph-promotion.ts):
 *   - `ags_graph_change_proposals` (parent)
 *       id / proposalKind / proposedByUserId / proposedByAgentId /
 *       status / summary / confidence / createdAt / updatedAt
 *   - `ags_graph_change_proposal_items` (child, FK proposalId)
 *   - `ags_graph_change_decisions` (child, FK proposalId)
 *   - `ags_graph_change_audit_events` (child, FK proposalId)
 *
 * All 3 children FK with NO ACTION (no `.onDelete()` specifier), so
 * application-level child-first deletion is mandatory. Children are
 * deleted in parallel via `Promise.all` (same pattern as #661).
 *
 * Status vocabulary (per
 * `services/graph-change-proposals/lifecycle.ts:39`):
 *   - `pending` — initial, never swept
 *   - `validating` — in-flight, never swept
 *   - `in_review` — in-flight, never swept
 *   - `approved` — terminal, sweep-eligible
 *   - `rejected` — terminal, sweep-eligible
 *   - `withdrawn` — terminal, sweep-eligible
 *
 * Compared to graph-correction-proposals: the change-proposal
 * lifecycle has NO `applied` state — once a structural mutation is
 * approved, the execution outcome is tracked via `auditEvents`
 * rather than on the parent row. So approved is the natural "done"
 * terminal here.
 *
 * The `agsGraphChangeAuditEvents` table is the per-proposal
 * operational event log — analogous to `agsGraphCorrectionAuditEvents`
 * (#661 doc-block) and `agsRuntimePolicyEvents`. Cascade-swept with
 * parent. **Not** a compliance-tier audit table like
 * `agsReleaseAuditRefs`.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import {
  agsGraphChangeProposals,
  agsGraphChangeProposalItems,
  agsGraphChangeDecisions,
  agsGraphChangeAuditEvents,
} from "../../../drizzle/tables/agent-studio-graph-promotion.js";

export type GraphChangeProposalStatus =
  | "pending"
  | "validating"
  | "in_review"
  | "approved"
  | "rejected"
  | "withdrawn";

/** Default terminal statuses pruned by a sweep. */
const DEFAULT_TERMINAL_STATUSES: readonly GraphChangeProposalStatus[] = [
  "approved",
  "rejected",
  "withdrawn",
];

const ZERO_RESULT: PruneOldGraphChangeProposalsResult = {
  deletedProposalsCount: 0,
  deletedItemsCount: 0,
  deletedDecisionsCount: 0,
  deletedAuditEventsCount: 0,
};

export interface PruneOldGraphChangeProposalsInput {
  /** Cutoff — proposals with `createdAt < olderThan` are eligible. */
  readonly olderThan: Date;
  /**
   * Restrict to these terminal statuses. Default:
   * `["approved", "rejected", "withdrawn"]`. The non-terminal
   * `pending` / `validating` / `in_review` are never swept — those
   * are in-flight.
   *
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly statuses?: readonly GraphChangeProposalStatus[];
  /**
   * Restrict to one proposalKind (`eq`) or a set (`inArray`).
   * `proposalKind` examples: `entity_merge`, `entity_split`,
   * `projection_correction`, `relationship_create`. Empty array
   * short-circuits BEFORE the ASDB probe.
   */
  readonly proposalKind?: string | readonly string[];
}

export interface PruneOldGraphChangeProposalsResult {
  readonly deletedProposalsCount: number;
  readonly deletedItemsCount: number;
  readonly deletedDecisionsCount: number;
  readonly deletedAuditEventsCount: number;
}

export interface PruneOldGraphChangeProposalsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldGraphChangeProposals(
  input: PruneOldGraphChangeProposalsInput,
  options: PruneOldGraphChangeProposalsOptions = {},
): Promise<PruneOldGraphChangeProposalsResult> {
  if (Array.isArray(input.statuses) && input.statuses.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.proposalKind) && input.proposalKind.length === 0) {
    return ZERO_RESULT;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO_RESULT;

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsGraphChangeProposals.createdAt, input.olderThan),
    inArray(
      agsGraphChangeProposals.status,
      statuses as GraphChangeProposalStatus[],
    ),
  ];
  const kindInput = input.proposalKind;
  if (kindInput !== undefined) {
    if (Array.isArray(kindInput)) {
      filters.push(inArray(agsGraphChangeProposals.proposalKind, kindInput));
    } else {
      filters.push(
        eq(agsGraphChangeProposals.proposalKind, kindInput as string),
      );
    }
  }

  const candidates = await db
    .select({ id: agsGraphChangeProposals.id })
    .from(agsGraphChangeProposals)
    .where(and(...filters));

  if (candidates.length === 0) {
    return ZERO_RESULT;
  }

  const proposalIds = candidates.map((r) => Number(r.id));

  // Cascade-delete the three child tables IN PARALLEL — the FKs are
  // declared without onDelete(), so Drizzle generates NO ACTION /
  // RESTRICT, requiring children-first deletion at the app layer.
  const [deletedItems, deletedDecisions, deletedAuditEvents] =
    await Promise.all([
      db
        .delete(agsGraphChangeProposalItems)
        .where(inArray(agsGraphChangeProposalItems.proposalId, proposalIds))
        .returning({ id: agsGraphChangeProposalItems.id }),
      db
        .delete(agsGraphChangeDecisions)
        .where(inArray(agsGraphChangeDecisions.proposalId, proposalIds))
        .returning({ id: agsGraphChangeDecisions.id }),
      db
        .delete(agsGraphChangeAuditEvents)
        .where(inArray(agsGraphChangeAuditEvents.proposalId, proposalIds))
        .returning({ id: agsGraphChangeAuditEvents.id }),
    ]);

  const deletedProposals = await db
    .delete(agsGraphChangeProposals)
    .where(inArray(agsGraphChangeProposals.id, proposalIds))
    .returning({ id: agsGraphChangeProposals.id });

  return {
    deletedProposalsCount: deletedProposals.length,
    deletedItemsCount: deletedItems.length,
    deletedDecisionsCount: deletedDecisions.length,
    deletedAuditEventsCount: deletedAuditEvents.length,
  };
}
