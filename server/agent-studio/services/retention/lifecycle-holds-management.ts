/**
 * Lifecycle-holds management — write-side helpers.
 *
 * Pairs with `lifecycle-holds-query.ts` (read-side `listActiveHolds`).
 * The retention sweep treats any active hold as a blocker; this module
 * gives operators a programmatic way to place + release holds without
 * raw SQL.
 *
 * Established holdType vocabulary (open-set):
 *   - legal_hold
 *   - audit_hold
 *   - governance_hold
 *   - governance_review     (open governance review against the entity)
 *   - audit_investigation   (unresolved audit investigation)
 *
 * Unknown holdTypes are permitted at write time but classified
 * conservatively in the eligibility deriver (surface as
 * GOVERNANCE_HOLD). Avoid inventing new types ad hoc — extend the
 * vocab module instead.
 *
 * Fail-soft contract on ASDB-null: setLifecycleHold returns
 * `{set: false}`; releaseLifecycleHold returns `{released: false}`.
 * listLifecycleHoldsForEntity returns [] (includes released holds for
 * audit-trail visibility, unlike the active-only listActiveHolds).
 */

import { and, desc, eq, isNull } from "drizzle-orm";

import { getAsDb } from "../../db/connection";
import { agsLifecycleHolds } from "../../../../drizzle/tables/agent-studio";

export interface HoldManagementOptions {
  readonly getDb?: typeof getAsDb;
  readonly now?: Date;
}

export interface SetLifecycleHoldInput {
  readonly entityType: string;
  readonly entityId: number;
  readonly holdType: string;
  readonly reason: string;
  readonly setBy: number;
  /** Optional auto-expiry. Null = indefinite until released. */
  readonly holdUntil?: Date | null;
  readonly metadata?: Record<string, unknown>;
}

export interface SetLifecycleHoldResult {
  readonly set: boolean;
  readonly holdId: number | null;
}

/**
 * Places a new active hold. Does NOT deduplicate against existing
 * active holds — multiple holds of the same type may co-exist (each
 * with its own setBy / reason / lifetime). The retention predicate
 * treats *any* active hold of any type as a blocker, so duplicate
 * holds don't change the outcome.
 *
 * Service-layer validation:
 *   - entityType is non-empty
 *   - holdType is non-empty
 *   - reason is non-empty (audit-trail content; no anonymous holds)
 *   - holdUntil, if present, must be in the future relative to `now`
 */
export async function setLifecycleHold(
  input: SetLifecycleHoldInput,
  options: HoldManagementOptions = {},
): Promise<SetLifecycleHoldResult> {
  if (!input.entityType || input.entityType.trim() === "") {
    throw new Error("setLifecycleHold: entityType is required");
  }
  if (!input.holdType || input.holdType.trim() === "") {
    throw new Error("setLifecycleHold: holdType is required");
  }
  if (!input.reason || input.reason.trim() === "") {
    throw new Error("setLifecycleHold: reason is required for audit-trail");
  }
  const now = options.now ?? new Date();
  if (input.holdUntil !== undefined && input.holdUntil !== null) {
    if (input.holdUntil.getTime() <= now.getTime()) {
      throw new Error(
        `setLifecycleHold: holdUntil ${input.holdUntil.toISOString()} must be in the future (now=${now.toISOString()})`,
      );
    }
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { set: false, holdId: null };

  const inserted = await db
    .insert(agsLifecycleHolds)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      holdType: input.holdType,
      reason: input.reason,
      setBy: input.setBy,
      setAt: now,
      holdUntil: input.holdUntil ?? null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: agsLifecycleHolds.id });

  if (inserted.length === 0) return { set: false, holdId: null };
  return { set: true, holdId: inserted[0].id };
}

export interface ReleaseLifecycleHoldInput {
  readonly holdId: number;
  readonly releasedBy: number;
  readonly releaseNote: string;
}

export interface ReleaseLifecycleHoldResult {
  readonly released: boolean;
  readonly holdId: number;
  readonly releasedAt: Date | null;
}

/**
 * Releases an active hold. Does not delete the row — `releasedAt` +
 * `releasedBy` + `releaseNote` are populated; the row remains for
 * audit reconstruction.
 *
 * Service-layer validation:
 *   - releaseNote is non-empty (no anonymous releases)
 *
 * Returns `released: false` if the hold doesn't exist or is already
 * released.
 */
export async function releaseLifecycleHold(
  input: ReleaseLifecycleHoldInput,
  options: HoldManagementOptions = {},
): Promise<ReleaseLifecycleHoldResult> {
  if (!input.releaseNote || input.releaseNote.trim() === "") {
    throw new Error(
      "releaseLifecycleHold: releaseNote is required for audit-trail",
    );
  }
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { released: false, holdId: input.holdId, releasedAt: null };

  const now = options.now ?? new Date();

  const updated = await db
    .update(agsLifecycleHolds)
    .set({
      releasedAt: now,
      releasedBy: input.releasedBy,
      releaseNote: input.releaseNote,
      updatedAt: now,
    })
    .where(
      and(
        eq(agsLifecycleHolds.id, input.holdId),
        isNull(agsLifecycleHolds.releasedAt),
      ),
    )
    .returning({
      id: agsLifecycleHolds.id,
      releasedAt: agsLifecycleHolds.releasedAt,
    });

  if (updated.length === 0) {
    return { released: false, holdId: input.holdId, releasedAt: null };
  }
  return {
    released: true,
    holdId: updated[0].id,
    releasedAt: updated[0].releasedAt,
  };
}

export interface LifecycleHoldRow {
  readonly id: number;
  readonly entityType: string;
  readonly entityId: number;
  readonly holdType: string;
  readonly reason: string | null;
  readonly setBy: number | null;
  readonly setAt: Date;
  readonly holdUntil: Date | null;
  readonly releasedAt: Date | null;
  readonly releasedBy: number | null;
  readonly releaseNote: string | null;
}

/**
 * Returns ALL holds (active + released) for the given entity, newest
 * first. Used by the operator UI to show the full hold history of a
 * row, not just what's currently active.
 *
 * For the retention-predicate's active-only view, use `listActiveHolds`
 * in `lifecycle-holds-query.ts`.
 */
export async function listLifecycleHoldsForEntity(
  input: { entityType: string; entityId: number },
  options: HoldManagementOptions = {},
): Promise<LifecycleHoldRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  try {
    const rows = await db
      .select({
        id: agsLifecycleHolds.id,
        entityType: agsLifecycleHolds.entityType,
        entityId: agsLifecycleHolds.entityId,
        holdType: agsLifecycleHolds.holdType,
        reason: agsLifecycleHolds.reason,
        setBy: agsLifecycleHolds.setBy,
        setAt: agsLifecycleHolds.setAt,
        holdUntil: agsLifecycleHolds.holdUntil,
        releasedAt: agsLifecycleHolds.releasedAt,
        releasedBy: agsLifecycleHolds.releasedBy,
        releaseNote: agsLifecycleHolds.releaseNote,
      })
      .from(agsLifecycleHolds)
      .where(
        and(
          eq(agsLifecycleHolds.entityType, input.entityType),
          eq(agsLifecycleHolds.entityId, input.entityId),
        ),
      )
      .orderBy(desc(agsLifecycleHolds.setAt));
    return rows;
  } catch {
    return [];
  }
}
