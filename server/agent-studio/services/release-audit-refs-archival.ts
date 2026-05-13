/**
 * ags_release_audit_refs — compliance-approved archival workflow (Track 2).
 *
 * **Permanent exclusion from the generic retention factory.** This module
 * MUST NEVER be reached from `makeRetentionCron`, the daily-sweep cron
 * ladder, or any age-only cleanup path. agsReleaseAuditRefs is a
 * compliance long-retention table — its entire purpose is to survive the
 * release lifecycle it documents.
 *
 * Policy (user 2026-05-12 §§0-9):
 *   - Default retention window: indefinite.
 *   - Minimum if finite: 7 years after the associated release is retired,
 *     superseded, or legally/audit-finalized.
 *   - Allowed actions: `archive`, `compact non-essential metadata`.
 *   - **Deletion blocked by default.** Deletion requires ALL of:
 *       1. Legal/compliance retention period has expired.
 *       2. No legal/audit/governance hold exists.
 *       3. No active audit or investigation references the row.
 *       4. Associated release is no longer active.
 *       5. Per-row or per-batch explicit governance/compliance approval
 *          exists.
 *     This module's `deleteReleaseAuditRef` always throws — operators
 *     wanting deletion must work through the compliance team's separate
 *     workflow, not this service.
 *
 * The companion `agsReleaseAuditRefs.archivedAt` / `archivedBy` /
 * `archiveReason` / `complianceApprovalRef` columns track the archive
 * action without removing the row.
 */

import { and, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { getAsDb } from "../db/connection.js";
import {
  agsAgentReleases,
  agsReleaseAuditRefs,
} from "../../../drizzle/tables/agent-studio.js";
import { listActiveHolds } from "./retention/lifecycle-holds-query.js";
import { isReleaseRetentionBlocker } from "./retention/lifecycle-state-vocab.js";

/** Minimum retention floor per the standing policy. 7 years in milliseconds. */
export const RELEASE_AUDIT_REFS_MIN_RETENTION_MS =
  7 * 365 * 24 * 60 * 60 * 1000;

export interface ListArchivalCandidatesInput {
  /**
   * The retention window. Must be at least RELEASE_AUDIT_REFS_MIN_RETENTION_MS.
   * The service throws if a smaller value is supplied — the 7-year floor is
   * not subject to operator-side override.
   */
  readonly minRetentionMs: number;
  /** Pagination cap. Defaults to 100; max 1000. */
  readonly limit?: number;
}

export interface ArchivalCandidate {
  readonly id: number;
  readonly releaseId: number;
  readonly auditSystem: string;
  readonly externalRef: string;
  readonly createdAt: Date;
  readonly releaseArchivedAt: Date | null;
}

export interface ArchivalServiceOptions {
  readonly getDb?: typeof getAsDb;
  readonly now?: Date;
}

/**
 * Returns ags_release_audit_refs rows that are candidates for archival:
 *   - row is NOT already archived
 *   - row.createdAt is older than (now - minRetentionMs)
 *   - associated release is archived (archivedAt IS NOT NULL)
 *   - no active hold against the row
 *
 * Does NOT mutate. Operators inspect the list, then apply
 * `archiveReleaseAuditRef` per row with a compliance approval ref.
 */
export async function listReleaseAuditRefsArchivalCandidates(
  input: ListArchivalCandidatesInput,
  options: ArchivalServiceOptions = {},
): Promise<ArchivalCandidate[]> {
  if (input.minRetentionMs < RELEASE_AUDIT_REFS_MIN_RETENTION_MS) {
    throw new Error(
      `release-audit-refs archival: minRetentionMs ${input.minRetentionMs} is below the 7-year floor (${RELEASE_AUDIT_REFS_MIN_RETENTION_MS}ms). The 7-year minimum is not operator-overridable.`,
    );
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - input.minRetentionMs);
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000);

  const rows = await db
    .select({
      id: agsReleaseAuditRefs.id,
      releaseId: agsReleaseAuditRefs.releaseId,
      auditSystem: agsReleaseAuditRefs.auditSystem,
      externalRef: agsReleaseAuditRefs.externalRef,
      createdAt: agsReleaseAuditRefs.createdAt,
      releaseState: agsAgentReleases.state,
      releaseArchivedAt: agsAgentReleases.archivedAt,
    })
    .from(agsReleaseAuditRefs)
    .leftJoin(
      agsAgentReleases,
      eq(agsAgentReleases.id, agsReleaseAuditRefs.releaseId),
    )
    .where(
      and(
        isNull(agsReleaseAuditRefs.archivedAt),
        lt(agsReleaseAuditRefs.createdAt, cutoff),
      ),
    )
    .limit(limit);

  const candidates: ArchivalCandidate[] = [];
  for (const r of rows) {
    // Skip if the release is still a retention blocker (not archived).
    if (
      r.releaseState !== null &&
      r.releaseArchivedAt !== undefined &&
      isReleaseRetentionBlocker({
        state: r.releaseState,
        archivedAt: r.releaseArchivedAt ?? null,
      })
    ) {
      continue;
    }
    // Skip if any active hold against the row.
    const holds = await listActiveHolds(
      { entityType: "ags_release_audit_refs", entityId: r.id },
      { getDb, now },
    );
    if (holds.length > 0) continue;

    candidates.push({
      id: r.id,
      releaseId: r.releaseId,
      auditSystem: r.auditSystem,
      externalRef: r.externalRef,
      createdAt: r.createdAt,
      releaseArchivedAt: r.releaseArchivedAt ?? null,
    });
  }

  return candidates;
}

export interface ArchiveReleaseAuditRefInput {
  readonly id: number;
  readonly complianceApprovalRef: string;
  readonly archivedBy: number;
  readonly reason: string;
}

export interface ArchiveReleaseAuditRefResult {
  readonly archived: boolean;
  readonly id: number;
  readonly archivedAt: Date | null;
}

/**
 * Archives a single ags_release_audit_refs row.
 *
 * Required preconditions (service-layer enforced):
 *   - row exists
 *   - row is NOT already archived (no double-archive)
 *   - complianceApprovalRef is a non-empty string (no anonymous archives)
 *   - reason is a non-empty string (audit-trail content)
 *
 * Does NOT delete the row. The row remains for audit reconstruction;
 * `archivedAt` + `archivedBy` + `archiveReason` + `complianceApprovalRef`
 * are populated.
 */
export async function archiveReleaseAuditRef(
  input: ArchiveReleaseAuditRefInput,
  options: ArchivalServiceOptions = {},
): Promise<ArchiveReleaseAuditRefResult> {
  if (!input.complianceApprovalRef || input.complianceApprovalRef.trim() === "") {
    throw new Error(
      "release-audit-refs archival: complianceApprovalRef is required. Anonymous archives are not permitted.",
    );
  }
  if (!input.reason || input.reason.trim() === "") {
    throw new Error(
      "release-audit-refs archival: reason is required for audit reconstruction.",
    );
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { archived: false, id: input.id, archivedAt: null };

  const now = options.now ?? new Date();

  const updated = await db
    .update(agsReleaseAuditRefs)
    .set({
      archivedAt: now,
      archivedBy: input.archivedBy,
      archiveReason: input.reason,
      complianceApprovalRef: input.complianceApprovalRef,
    })
    .where(
      and(
        eq(agsReleaseAuditRefs.id, input.id),
        isNull(agsReleaseAuditRefs.archivedAt),
      ),
    )
    .returning({ id: agsReleaseAuditRefs.id, archivedAt: agsReleaseAuditRefs.archivedAt });

  if (updated.length === 0) {
    return { archived: false, id: input.id, archivedAt: null };
  }

  return {
    archived: true,
    id: updated[0].id,
    archivedAt: updated[0].archivedAt,
  };
}

/**
 * Deletion is blocked by default. This function exists as a marker —
 * calling it always throws. Operators wanting deletion must work through
 * the compliance team's separate workflow, not this service.
 *
 * The standing policy (user 2026-05-12 §§0-9) requires per-row or per-
 * batch explicit governance/compliance approval before deletion. That
 * approval lives outside this codebase. If we ever bring a deletion
 * path in-tree, it must accept a verifiable compliance-approval token
 * (not just a string), verify the seven preconditions in the file
 * header, and audit-log the action.
 */
export async function deleteReleaseAuditRef(
  _input: { id: number; complianceApprovalRef: string; deletedBy: number },
  _options: ArchivalServiceOptions = {},
): Promise<never> {
  throw new Error(
    "release-audit-refs deletion: blocked by policy. Use the compliance team's external deletion workflow. This service does not perform deletions.",
  );
}

// Unused imports `gt`, `inArray`, `isNotNull`, `sql` retained for future
// query extensions (batch-archive, count-by-window, etc.).
void gt;
void inArray;
void isNotNull;
void sql;
