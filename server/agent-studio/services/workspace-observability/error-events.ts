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

export interface ListErrorEventsInput {
  readonly sourceKind?: string;
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
}

export async function listErrorEvents(
  input: ListErrorEventsInput = {},
  options: ServiceOptions = {},
): Promise<ErrorEventRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const filters = [];
  if (input.sourceKind !== undefined) {
    filters.push(eq(agsWorkspaceErrorEvents.sourceKind, input.sourceKind));
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
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { deletedCount: 0 };

  const deleted = await db
    .delete(agsWorkspaceErrorEvents)
    .where(lt(agsWorkspaceErrorEvents.createdAt, input.olderThan))
    .returning({ id: agsWorkspaceErrorEvents.id });

  return { deletedCount: deleted.length };
}
