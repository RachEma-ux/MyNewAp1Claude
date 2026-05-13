/**
 * Helpers for reading active holds out of `agsLifecycleHolds`.
 *
 * Active hold predicate:
 *   `releasedAt IS NULL AND (holdUntil IS NULL OR holdUntil > now())`
 *
 * Fail-soft: returns an empty array on ASDB-null or query error so the
 * caller treats "couldn't check holds" as if no hold exists. Eligibility
 * derivation MUST also short-circuit on other blockers before reaching
 * here; the empty-on-error contract is for graceful degradation, not for
 * unsafe deletion (a real query failure should never reach the prune
 * step because every other predicate in the eligibility chain also
 * fail-soft-blocks).
 */

import { and, eq, gt, isNull, or } from "drizzle-orm";

import { getAsDb } from "../../db/connection";
import { agsLifecycleHolds } from "../../../../drizzle/tables/agent-studio";

export interface ActiveHold {
  readonly id: number;
  readonly holdType: string;
  readonly reason: string | null;
  readonly setBy: number | null;
  readonly setAt: Date;
  readonly holdUntil: Date | null;
}

export interface HoldQueryOptions {
  readonly getDb?: () => ReturnType<typeof getAsDb>;
  readonly now?: Date;
}

/**
 * Returns the active holds for (entityType, entityId) at the given
 * point in time. Empty array if no holds, ASDB unavailable, or query
 * error. Order is undefined.
 */
export async function listActiveHolds(
  input: { entityType: string; entityId: number },
  options: HoldQueryOptions = {},
): Promise<ActiveHold[]> {
  const db = options.getDb ? options.getDb() : getAsDb();
  if (!db) return [];

  const now = options.now ?? new Date();

  try {
    const rows = await db
      .select({
        id: agsLifecycleHolds.id,
        holdType: agsLifecycleHolds.holdType,
        reason: agsLifecycleHolds.reason,
        setBy: agsLifecycleHolds.setBy,
        setAt: agsLifecycleHolds.setAt,
        holdUntil: agsLifecycleHolds.holdUntil,
      })
      .from(agsLifecycleHolds)
      .where(
        and(
          eq(agsLifecycleHolds.entityType, input.entityType),
          eq(agsLifecycleHolds.entityId, input.entityId),
          isNull(agsLifecycleHolds.releasedAt),
          or(isNull(agsLifecycleHolds.holdUntil), gt(agsLifecycleHolds.holdUntil, now)),
        ),
      );
    return rows;
  } catch {
    return [];
  }
}
