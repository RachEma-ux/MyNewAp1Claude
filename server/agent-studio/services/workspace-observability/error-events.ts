/**
 * Workspace Observability — Error events service.
 *
 * Phase 22. Wires the dormant `ags_workspace_error_events` table.
 * Operators see a per-event audit of workspace-level errors —
 * promotion validation rejections, Neo4j projection sync failures,
 * Cypher template gate denials, retrieval safety-filter blocks.
 *
 * The recorder is a write-only surface for service code. Readers
 * surface the events in an admin diagnostics panel.
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace.md
 */

import { and, desc, eq, gte, inArray, like, lt } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsWorkspaceErrorEvents } from "../../../../drizzle/tables/agent-studio-graph-quality.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export interface RecordErrorEventInput {
  readonly sourceKind: string;
  readonly sourceId?: string | null;
  readonly userId?: number | null;
  readonly errorClass: string;
  readonly errorMessage: string;
  readonly metadata?: Record<string, unknown> | null;
}

export interface ErrorEventRow {
  readonly id: number;
  readonly sourceKind: string;
  readonly sourceId: string | null;
  readonly userId: number | null;
  readonly errorClass: string;
  readonly errorMessage: string;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export interface ServiceOptions {
  readonly getDb?: typeof getAsDb;
}

function rowToEvent(r: Record<string, unknown>): ErrorEventRow {
  return {
    id: Number(r.id),
    sourceKind: String(r.sourceKind),
    sourceId: r.sourceId == null ? null : String(r.sourceId),
    userId: r.userId == null ? null : Number(r.userId),
    errorClass: String(r.errorClass),
    errorMessage: String(r.errorMessage),
    metadata:
      (r.metadata as Record<string, unknown> | null | undefined) ?? null,
    createdAt: r.createdAt as Date,
  };
}

export async function recordErrorEvent(
  input: RecordErrorEventInput,
  options: ServiceOptions = {},
): Promise<ErrorEventRow | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  // Fail-soft on ASDB-null. Error event recording is observability,
  // not the operational hot path — losing an event row is preferable
  // to throwing inside an already-failing flow.
  if (!db) return null;

  const inserted = await db
    .insert(agsWorkspaceErrorEvents)
    .values({
      sourceKind: input.sourceKind,
      sourceId: input.sourceId ?? null,
      userId: input.userId ?? null,
      errorClass: input.errorClass,
      errorMessage: input.errorMessage,
      metadata: input.metadata ?? null,
    })
    .returning({
      id: agsWorkspaceErrorEvents.id,
      sourceKind: agsWorkspaceErrorEvents.sourceKind,
      sourceId: agsWorkspaceErrorEvents.sourceId,
      userId: agsWorkspaceErrorEvents.userId,
      errorClass: agsWorkspaceErrorEvents.errorClass,
      errorMessage: agsWorkspaceErrorEvents.errorMessage,
      metadata: agsWorkspaceErrorEvents.metadata,
      createdAt: agsWorkspaceErrorEvents.createdAt,
    });
  const row = inserted[0];
  if (!row) return null;
  return rowToEvent(row);
}

/**
 * Bulk write sibling — a fan-out controller that catches N
 * exceptions in one batch, or a log-backfill seeding historical
 * errors, can write all rows in a single INSERT instead of N round
 * trips. Sister of `pushNotificationToUsers` (#509-era) on the bulk
 * write pattern.
 *
 * Empty-array short-circuit BEFORE the ASDB probe (canonical Phase
 * 22 contract — observability writes for an empty batch must not
 * even probe the DB).
 *
 * Fail-soft on ASDB-null matches the singular `recordErrorEvent`
 * semantic: observability writes never throw into an
 * already-failing flow. Returns `[]` for the empty case AND for
 * ASDB-null with a non-empty batch — callers cannot distinguish
 * "DB was down" from "nothing to write," which is intentional;
 * loud failure would mask the original errors the caller was
 * trying to log.
 */
export async function recordErrorEvents(
  inputs: readonly RecordErrorEventInput[],
  options: ServiceOptions = {},
): Promise<readonly ErrorEventRow[]> {
  if (inputs.length === 0) return [];

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const inserted = await db
    .insert(agsWorkspaceErrorEvents)
    .values(
      inputs.map((input) => ({
        sourceKind: input.sourceKind,
        sourceId: input.sourceId ?? null,
        userId: input.userId ?? null,
        errorClass: input.errorClass,
        errorMessage: input.errorMessage,
        metadata: input.metadata ?? null,
      })),
    )
    .returning({
      id: agsWorkspaceErrorEvents.id,
      sourceKind: agsWorkspaceErrorEvents.sourceKind,
      sourceId: agsWorkspaceErrorEvents.sourceId,
      userId: agsWorkspaceErrorEvents.userId,
      errorClass: agsWorkspaceErrorEvents.errorClass,
      errorMessage: agsWorkspaceErrorEvents.errorMessage,
      metadata: agsWorkspaceErrorEvents.metadata,
      createdAt: agsWorkspaceErrorEvents.createdAt,
    });

  return inserted.map((row) => rowToEvent(row));
}

/**
 * Singleton getter — completes the per-table getById symmetry across
 * the three Phase 22 tables. `getJobById` (#511-era) and
 * `getNotificationById` (#557) already existed; this is the matching
 * lookup for error_events.
 *
 * Returns `null` on ASDB-null (fail-soft, matches the rest of the
 * surface) and on not-found. Used by drilldown UIs that deeplink to
 * a specific captured error — typing the id into a URL or following
 * a link from a related notification's metadata. Operator-facing,
 * not user-scoped (errors don't have an owning userId in the
 * dashboard-triage flow).
 */
export async function getErrorEventById(
  errorEventId: number,
  options: ServiceOptions = {},
): Promise<ErrorEventRow | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: agsWorkspaceErrorEvents.id,
      sourceKind: agsWorkspaceErrorEvents.sourceKind,
      sourceId: agsWorkspaceErrorEvents.sourceId,
      userId: agsWorkspaceErrorEvents.userId,
      errorClass: agsWorkspaceErrorEvents.errorClass,
      errorMessage: agsWorkspaceErrorEvents.errorMessage,
      metadata: agsWorkspaceErrorEvents.metadata,
      createdAt: agsWorkspaceErrorEvents.createdAt,
    })
    .from(agsWorkspaceErrorEvents)
    .where(eq(agsWorkspaceErrorEvents.id, errorEventId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToEvent(rows[0]);
}

/**
 * Bulk reader sibling of getErrorEventById (#558). Completes the
 * bulk-getById symmetry across all 3 Phase 22 tables (matches
 * getJobsByIds #559 and getNotificationsByIds #560). Used by
 * incident-triage UIs to fetch multiple selected errors in one
 * round-trip — typical workflow: list shows 20 recent errors,
 * operator picks 5, "show full payload" drilldown hits this.
 *
 * Empty input short-circuits to [] with no DB call. NOT user-scoped
 * (error events don't have an owning userId in the dashboard-triage
 * flow — same shape as the singleton getter).
 */
export async function getErrorEventsByIds(
  errorEventIds: readonly number[],
  options: ServiceOptions = {},
): Promise<ErrorEventRow[]> {
  if (errorEventIds.length === 0) return [];
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: agsWorkspaceErrorEvents.id,
      sourceKind: agsWorkspaceErrorEvents.sourceKind,
      sourceId: agsWorkspaceErrorEvents.sourceId,
      userId: agsWorkspaceErrorEvents.userId,
      errorClass: agsWorkspaceErrorEvents.errorClass,
      errorMessage: agsWorkspaceErrorEvents.errorMessage,
      metadata: agsWorkspaceErrorEvents.metadata,
      createdAt: agsWorkspaceErrorEvents.createdAt,
    })
    .from(agsWorkspaceErrorEvents)
    .where(inArray(agsWorkspaceErrorEvents.id, errorEventIds as number[]));
  return rows.map(rowToEvent);
}

export interface ListErrorEventsInput {
  /**
   * Single sourceKind to filter by (exact `eq`), or an array (`IN`
   * — OR semantics). Operators triaging an incident often want to
   * look at several related procedures at once — e.g.
   * `["trpc.chat.send", "trpc.chat.list"]` for the chat slice — and
   * the array form removes the need for two separate calls + a
   * client-side merge.
   *
   * Empty array short-circuits to `[]` (vacuous IN). Mutually exclusive
   * with `sourceKindLike` (this takes precedence when both are set —
   * exact match is narrower).
   */
  readonly sourceKind?: string | readonly string[];
  /**
   * SQL LIKE-style prefix match on `sourceKind` (caller supplies the
   * trailing `%`). Useful with the auto-capture middleware (#513) that
   * emits sourceKinds like `trpc.chat.send`, `trpc.providers.list`,
   * etc. — operators can group by `trpc.chat.%` or `trpc.providers.%`
   * to triage by lane. Mutually compatible with `sourceKind` (exact
   * match wins if both are set, since it's narrower).
   */
  readonly sourceKindLike?: string;
  /**
   * Single errorClass to filter by, or an array (OR semantics via
   * SQL IN). Operators triaging an incident often want to look at
   * multiple related classes at once — e.g. ["TRPCError:UNAUTHORIZED",
   * "TRPCError:FORBIDDEN"] for an auth incident, or
   * ["BackgroundJobFailed", "ZodError"] for a worker-tier sweep.
   * Empty array short-circuits to [] (vacuous IN).
   */
  readonly errorClass?: string | readonly string[];
  readonly userId?: number;
  readonly limit?: number;
  /**
   * Restrict to events whose `createdAt` is at-or-after this
   * timestamp. Symmetric with `listJobs.createdSince` (#536) — lets
   * operators query "what error events have we captured since the
   * last incident report" without computing the cutoff client-side.
   */
  readonly createdSince?: Date;
  /**
   * SQL LIKE-style search on `errorMessage` (caller supplies the
   * wildcards — typically `%foo%` for substring). Operator gesture
   * for grep-style incident search — "find all events whose
   * message mentions 'connection refused'" without dragging the
   * whole table client-side and filtering. Mutually compatible
   * with the other filters; ANDed in the WHERE clause.
   */
  readonly errorMessageLike?: string;
}

export async function listErrorEvents(
  input: ListErrorEventsInput = {},
  options: ServiceOptions = {},
): Promise<ErrorEventRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  // Empty sourceKind array → vacuous IN; short-circuit (matches the
  // errorClass empty-array contract).
  if (Array.isArray(input.sourceKind) && input.sourceKind.length === 0) {
    return [];
  }

  const filters = [];
  const sourceKindInput = input.sourceKind;
  if (sourceKindInput !== undefined) {
    if (Array.isArray(sourceKindInput)) {
      filters.push(
        inArray(
          agsWorkspaceErrorEvents.sourceKind,
          sourceKindInput as string[],
        ),
      );
    } else {
      filters.push(
        eq(agsWorkspaceErrorEvents.sourceKind, sourceKindInput as string),
      );
    }
  } else if (input.sourceKindLike !== undefined) {
    filters.push(like(agsWorkspaceErrorEvents.sourceKind, input.sourceKindLike));
  }
  const errorClassInput = input.errorClass;
  if (errorClassInput !== undefined) {
    if (Array.isArray(errorClassInput)) {
      if (errorClassInput.length === 0) return [];
      filters.push(
        inArray(agsWorkspaceErrorEvents.errorClass, errorClassInput as string[]),
      );
    } else {
      filters.push(
        eq(agsWorkspaceErrorEvents.errorClass, errorClassInput as string),
      );
    }
  }
  if (input.userId !== undefined) {
    filters.push(eq(agsWorkspaceErrorEvents.userId, input.userId));
  }
  if (input.createdSince !== undefined) {
    filters.push(gte(agsWorkspaceErrorEvents.createdAt, input.createdSince));
  }
  if (input.errorMessageLike !== undefined) {
    filters.push(
      like(agsWorkspaceErrorEvents.errorMessage, input.errorMessageLike),
    );
  }

  const rows = await db
    .select({
      id: agsWorkspaceErrorEvents.id,
      sourceKind: agsWorkspaceErrorEvents.sourceKind,
      sourceId: agsWorkspaceErrorEvents.sourceId,
      userId: agsWorkspaceErrorEvents.userId,
      errorClass: agsWorkspaceErrorEvents.errorClass,
      errorMessage: agsWorkspaceErrorEvents.errorMessage,
      metadata: agsWorkspaceErrorEvents.metadata,
      createdAt: agsWorkspaceErrorEvents.createdAt,
    })
    .from(agsWorkspaceErrorEvents)
    .where(
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters),
    )
    .orderBy(desc(agsWorkspaceErrorEvents.createdAt))
    .limit(input.limit ?? 100);
  return rows.map(rowToEvent);
}

// ---------- retention prune ----------

export interface PruneOldErrorEventsInput {
  /**
   * Delete events whose createdAt is strictly older than this cutoff.
   * Caller controls the policy (e.g. 30 days for normal retention,
   * 7 days for noisy-environment cleanup, 0 for "delete everything").
   */
  readonly olderThan: Date;
  /**
   * Optional errorClass filter — single string (`eq`) or array (`IN`).
   * Lets a cron/operator prune only one error class's history (e.g.
   * shed `ValidationError` aggressively while preserving rare
   * `OutOfMemoryError` rows). Mirrors the same filter pattern on
   * `pruneOldBackgroundJobs.jobKind` (#549).
   *
   * Empty array short-circuits to `{deletedCount: 0}` (vacuous IN),
   * with no DB call.
   */
  readonly errorClass?: string | readonly string[];
}

export interface PruneOldErrorEventsResult {
  readonly deletedCount: number;
}

/**
 * Bulk-delete error events older than the given cutoff. Intended to be
 * called from a periodic background job (or by an operator action) so
 * the auto-capture middleware (#513) doesn't accumulate unbounded rows
 * in `ags_workspace_error_events`.
 *
 * Returns `{deletedCount: 0}` on ASDB-null instead of throwing — same
 * fail-soft contract as `recordErrorEvent`. The caller can log the
 * zero-count and move on.
 */
export async function pruneOldErrorEvents(
  input: PruneOldErrorEventsInput,
  options: ServiceOptions = {},
): Promise<PruneOldErrorEventsResult> {
  // Empty errorClass array → vacuous IN; short-circuit BEFORE the
  // ASDB probe (matches pruneOldBackgroundJobs #549 contract).
  if (Array.isArray(input.errorClass) && input.errorClass.length === 0) {
    return { deletedCount: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { deletedCount: 0 };

  const filters = [lt(agsWorkspaceErrorEvents.createdAt, input.olderThan)];
  const errorClassInput = input.errorClass;
  if (errorClassInput !== undefined) {
    if (Array.isArray(errorClassInput)) {
      filters.push(
        inArray(agsWorkspaceErrorEvents.errorClass, errorClassInput as string[]),
      );
    } else {
      filters.push(
        eq(agsWorkspaceErrorEvents.errorClass, errorClassInput as string),
      );
    }
  }

  const deleted = await db
    .delete(agsWorkspaceErrorEvents)
    .where(filters.length === 1 ? filters[0] : and(...filters))
    .returning({ id: agsWorkspaceErrorEvents.id });

  return { deletedCount: deleted.length };
}
