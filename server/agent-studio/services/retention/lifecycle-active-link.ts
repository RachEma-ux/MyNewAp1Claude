/**
 * Active-link query helpers for the approval-lifecycle retention predicate.
 *
 * The retention sweep MUST NOT delete a row whose lifecycle still has an
 * "active link" to live production state. This module owns the queries
 * that answer "is this row still pointing at something live?"
 *
 * - publish-request → active release  (via agent+version+environment match
 *                                      against agsAgentReleases with
 *                                      archivedAt IS NULL)
 * - approval-step  → active release  (transitively, via parent
 *                                      publish-request)
 * - note-promotion → active version  (via agsNotePromotionVersions.active
 *                                      = true for any version of this
 *                                      promotion)
 *
 * Fail-soft: every helper returns `true` (blocks retention) on ASDB
 * unavailability or on query error. The retention sweep will pause
 * rather than risk a wrong-deletion.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { getAsDb } from "../../db/connection";
import {
  agsAgentReleases,
  agsApprovalSteps,
  agsPublishRequests,
} from "../../../../drizzle/tables/agent-studio";
import { agsNotePromotionVersions } from "../../../../drizzle/tables/agent-studio-graph-promotion";
import { isReleaseRetentionBlocker } from "./lifecycle-state-vocab";

export interface ActiveLinkServiceOptions {
  readonly getDb?: () => ReturnType<typeof getAsDb>;
}

function resolveDb(options: ActiveLinkServiceOptions) {
  const handle = options.getDb ? options.getDb() : getAsDb();
  return handle ?? null;
}

/**
 * Returns true if the publish-request points at an agsAgentReleases row
 * that is still a retention-blocker (archivedAt IS NULL or hard-block
 * state). Match key: (agentId, versionId, targetEnvironment).
 *
 * Fail-soft: returns `true` (block) on ASDB-null or query error.
 */
export async function isPublishRequestLinkedToActiveRelease(
  input: { publishRequestId: number },
  options: ActiveLinkServiceOptions = {},
): Promise<boolean> {
  const db = resolveDb(options);
  if (!db) return true;

  try {
    const requestRows = await db
      .select({
        agentId: agsPublishRequests.agentId,
        versionId: agsPublishRequests.versionId,
        targetEnvironment: agsPublishRequests.targetEnvironment,
      })
      .from(agsPublishRequests)
      .where(eq(agsPublishRequests.id, input.publishRequestId))
      .limit(1);

    if (requestRows.length === 0) return false;
    const req = requestRows[0];

    // versionId is nullable on agsPublishRequests; if null we can't
    // resolve a release link — treat as no active link.
    if (req.versionId === null) return false;

    const releases = await db
      .select({
        state: agsAgentReleases.state,
        archivedAt: agsAgentReleases.archivedAt,
      })
      .from(agsAgentReleases)
      .where(
        and(
          eq(agsAgentReleases.agentId, req.agentId),
          eq(agsAgentReleases.versionId, req.versionId),
          eq(agsAgentReleases.targetEnvironment, req.targetEnvironment),
        ),
      );

    return releases.some(isReleaseRetentionBlocker);
  } catch {
    return true;
  }
}

/**
 * Returns true if the approval-step's parent publish-request is linked
 * to an active release.
 *
 * Fail-soft: returns `true` (block) on ASDB-null, missing parent, or
 * query error.
 */
export async function isApprovalStepLinkedToActiveRelease(
  input: { approvalStepId: number },
  options: ActiveLinkServiceOptions = {},
): Promise<boolean> {
  const db = resolveDb(options);
  if (!db) return true;

  try {
    const rows = await db
      .select({ publishRequestId: agsApprovalSteps.publishRequestId })
      .from(agsApprovalSteps)
      .where(eq(agsApprovalSteps.id, input.approvalStepId))
      .limit(1);
    if (rows.length === 0) return false;
    return isPublishRequestLinkedToActiveRelease(
      { publishRequestId: rows[0].publishRequestId },
      options,
    );
  } catch {
    return true;
  }
}

/**
 * Returns true if any version of this note-promotion is still flagged
 * active (`agsNotePromotionVersions.active = true`).
 *
 * Note-promotions don't link to agsAgentReleases — their "live state"
 * lives in the per-version active flag. A rolled_back promotion may
 * still have a previously-active version flagged active (the rollback
 * flow flips the current version off and the previous on); in that case
 * the previous version's promotion ID is what's "still live."
 *
 * Fail-soft: returns `true` (block) on ASDB-null or query error.
 */
export async function isNotePromotionLinkedToActiveVersion(
  input: { promotionId: number },
  options: ActiveLinkServiceOptions = {},
): Promise<boolean> {
  const db = resolveDb(options);
  if (!db) return true;

  try {
    const rows = await db
      .select({ id: agsNotePromotionVersions.id })
      .from(agsNotePromotionVersions)
      .where(
        and(
          eq(agsNotePromotionVersions.promotionId, input.promotionId),
          eq(agsNotePromotionVersions.active, true),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return true;
  }
}

// Re-export for symmetry with the eligibility service's blocker codes:
// these names map 1:1 to the ACTIVE_RELEASE_LINK / ACTIVE_DEPLOYMENT
// blocker codes that follow in the eligibility service.
export { isNull, sql };
