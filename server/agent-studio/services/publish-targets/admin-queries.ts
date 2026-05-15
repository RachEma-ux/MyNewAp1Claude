/**
 * Publish-targets admin queries — PR-V1-186.
 *
 * Read-only operator surface for the publish-targets registry +
 * executions ledger. Pattern mirrors
 * `services/extensions/manifest.ts:listExtensionsByWorkspace` /
 * `listRecentInvocationsByWorkspace` — workspace-style scoping is
 * not applicable here (publish targets are cross-tenant operator
 * config), so these are global reads gated by `adminProcedure` at
 * the router layer.
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` /
 *     `neo4j-driver` imports.
 */

import { and, desc, eq, inArray, max, sql } from "drizzle-orm";

import {
  agsPublishTargets,
  agsPublishTargetExecutions,
} from "../../../../drizzle/tables/agent-studio-publish-targets.js";
import { getAsDb } from "../../db/connection.js";
import type { PublishExecutionStatus } from "./types.js";

export interface PublishTargetSummary {
  readonly id: number;
  readonly targetKey: string;
  readonly targetType: string;
  readonly endpoint: string;
  readonly providerConnectionId: number | null;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * PR-V1-193: full registry row with `config` JSON. Same on-demand
 * pattern as `getPublishExecutionById` (#940) — config can hold
 * per-target operator metadata (signing key id, max payload size,
 * dry-run flag) and isn't part of the registry list to keep the
 * payload small. UI fetches when an operator clicks "view config"
 * on a row.
 */
export interface PublishTargetWithConfig extends PublishTargetSummary {
  readonly config: Record<string, unknown> | null;
}

export interface PublishExecutionRow {
  readonly id: number;
  readonly targetId: number;
  readonly sourcePromotionId: number;
  readonly sourceVersionId: string | null;
  readonly attempt: number;
  readonly status: string;
  readonly payloadDigest: string | null;
  readonly upstreamArtifactId: string | null;
  readonly errorMessage: string | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * PR-V1-189: full execution-row detail including the `details`
 * JSON blob. Kept off `listRecentPublishExecutions` because the
 * blob can be large (per-pusher response body, http headers,
 * etc.) — operators fetch on-demand by clicking a row.
 */
export interface PublishExecutionDetail extends PublishExecutionRow {
  readonly details: Record<string, unknown> | null;
}

/**
 * List every publish target row in the registry. Operator dashboard
 * primary read. No filters — registries are O(targets) typically
 * dozens, not thousands.
 */
export async function listPublishTargets(): Promise<
  ReadonlyArray<PublishTargetSummary>
> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(agsPublishTargets)
    .orderBy(agsPublishTargets.targetKey);
  return rows.map((r) => ({
    id: Number(r.id),
    targetKey: String(r.targetKey),
    targetType: String(r.targetType),
    endpoint: String(r.endpoint),
    providerConnectionId: (r.providerConnectionId as number | null) ?? null,
    enabled: Boolean(r.enabled),
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  }));
}

/**
 * Recent publish-target executions. Default `limit=50`, capped at
 * `500`. Optional filters by `targetId` + `status`. ORDER BY
 * `createdAt DESC` so operators see latest pushes first.
 */
export async function listRecentPublishExecutions(args: {
  targetId?: number;
  status?: PublishExecutionStatus;
  limit?: number;
}): Promise<ReadonlyArray<PublishExecutionRow>> {
  const db = getAsDb();
  if (!db) return [];
  const limit = Math.max(1, Math.min(500, args.limit ?? 50));
  const filters = [] as ReturnType<typeof eq>[];
  if (args.targetId !== undefined) {
    filters.push(eq(agsPublishTargetExecutions.targetId, args.targetId));
  }
  if (args.status !== undefined) {
    filters.push(eq(agsPublishTargetExecutions.status, args.status));
  }
  const baseQuery = db
    .select({
      id: agsPublishTargetExecutions.id,
      targetId: agsPublishTargetExecutions.targetId,
      sourcePromotionId: agsPublishTargetExecutions.sourcePromotionId,
      sourceVersionId: agsPublishTargetExecutions.sourceVersionId,
      attempt: agsPublishTargetExecutions.attempt,
      status: agsPublishTargetExecutions.status,
      payloadDigest: agsPublishTargetExecutions.payloadDigest,
      upstreamArtifactId: agsPublishTargetExecutions.upstreamArtifactId,
      errorMessage: agsPublishTargetExecutions.errorMessage,
      startedAt: agsPublishTargetExecutions.startedAt,
      completedAt: agsPublishTargetExecutions.completedAt,
      createdAt: agsPublishTargetExecutions.createdAt,
    })
    .from(agsPublishTargetExecutions);
  const rows = await (filters.length === 0
    ? baseQuery
    : baseQuery.where(
        filters.length === 1 ? filters[0] : and(...filters),
      ))
    .orderBy(desc(agsPublishTargetExecutions.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: Number(r.id),
    targetId: Number(r.targetId),
    sourcePromotionId: Number(r.sourcePromotionId),
    sourceVersionId: (r.sourceVersionId as string | null) ?? null,
    attempt: Number(r.attempt),
    status: String(r.status),
    payloadDigest: (r.payloadDigest as string | null) ?? null,
    upstreamArtifactId: (r.upstreamArtifactId as string | null) ?? null,
    errorMessage: (r.errorMessage as string | null) ?? null,
    startedAt: (r.startedAt as Date | null) ?? null,
    completedAt: (r.completedAt as Date | null) ?? null,
    createdAt: r.createdAt as Date,
  }));
}

/**
 * PR-V1-187: operator-toggle for the `enabled` boolean on a
 * publish target. Disabling a target is the standard
 * incident-response action when an upstream system is unhealthy —
 * `executePublish` already refuses to dispatch through a disabled
 * target (`PublishTargetDisabledError`), so flipping this bit is
 * sufficient to quiesce a target without touching the registry
 * row itself.
 *
 * Returns the updated row (post-update SELECT shape, same as the
 * registry list). Throws `PublishTargetNotFoundError` when no row
 * matches.
 */
export class PublishTargetNotFoundForToggleError extends Error {
  constructor(targetId: number) {
    super(`Publish target ${targetId} not found`);
    this.name = "PublishTargetNotFoundForToggleError";
  }
}

/**
 * PR-V1-193: fetch a single publish-target row including the
 * `config` JSON blob. Returns null when not found.
 */
export async function getPublishTargetById(
  targetId: number,
): Promise<PublishTargetWithConfig | null> {
  const db = getAsDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agsPublishTargets)
    .where(eq(agsPublishTargets.id, targetId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    targetKey: String(r.targetKey),
    targetType: String(r.targetType),
    endpoint: String(r.endpoint),
    providerConnectionId: (r.providerConnectionId as number | null) ?? null,
    enabled: Boolean(r.enabled),
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
    config: (r.config as Record<string, unknown> | null) ?? null,
  };
}

/**
 * PR-V1-189: fetch a single execution by id, including the
 * `details` JSON blob. Returns null when not found — the UI
 * surfaces this as a friendly "not found" rather than throwing.
 */
export async function getPublishExecutionById(
  executionId: number,
): Promise<PublishExecutionDetail | null> {
  const db = getAsDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agsPublishTargetExecutions)
    .where(eq(agsPublishTargetExecutions.id, executionId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    targetId: Number(r.targetId),
    sourcePromotionId: Number(r.sourcePromotionId),
    sourceVersionId: (r.sourceVersionId as string | null) ?? null,
    attempt: Number(r.attempt),
    status: String(r.status),
    payloadDigest: (r.payloadDigest as string | null) ?? null,
    upstreamArtifactId: (r.upstreamArtifactId as string | null) ?? null,
    errorMessage: (r.errorMessage as string | null) ?? null,
    startedAt: (r.startedAt as Date | null) ?? null,
    completedAt: (r.completedAt as Date | null) ?? null,
    createdAt: r.createdAt as Date,
    details: (r.details as Record<string, unknown> | null) ?? null,
  };
}

/**
 * PR-V1-188: per-target execution summary. Symmetric with the
 * extensions invocation-summary surface (#932). Aggregates
 * `ags_publish_target_executions` per target into
 * `{ totalExecutions, succeededCount, pendingCount, failedCount,
 * lastExecutedAt }` so the operator can see at a glance whether
 * a target is healthy without clicking through the recent log.
 * Zero-fills targets with no executions yet so the UI doesn't
 * client-side-merge.
 */
export interface PublishTargetExecutionSummary {
  readonly targetId: number;
  readonly totalExecutions: number;
  readonly succeededCount: number;
  readonly pendingCount: number;
  readonly failedCount: number;
  readonly lastExecutedAt: Date | null;
}

export async function getPublishTargetExecutionSummaries(): Promise<
  ReadonlyArray<PublishTargetExecutionSummary>
> {
  const db = getAsDb();
  if (!db) return [];
  const targetRows = await db
    .select({ id: agsPublishTargets.id })
    .from(agsPublishTargets);
  if (targetRows.length === 0) return [];
  const targetIds = targetRows.map((r) => Number(r.id));
  const summary = await db
    .select({
      targetId: agsPublishTargetExecutions.targetId,
      total: sql<number>`count(*)::int`,
      succeeded:
        sql<number>`count(*) filter (where ${agsPublishTargetExecutions.status} = 'succeeded')::int`,
      pending:
        sql<number>`count(*) filter (where ${agsPublishTargetExecutions.status} = 'pending')::int`,
      failed:
        sql<number>`count(*) filter (where ${agsPublishTargetExecutions.status} = 'failed')::int`,
      lastExecutedAt: max(agsPublishTargetExecutions.createdAt),
    })
    .from(agsPublishTargetExecutions)
    .where(inArray(agsPublishTargetExecutions.targetId, targetIds))
    .groupBy(agsPublishTargetExecutions.targetId);
  const byTargetId = new Map<number, PublishTargetExecutionSummary>();
  for (const r of summary) {
    byTargetId.set(Number(r.targetId), {
      targetId: Number(r.targetId),
      totalExecutions: Number(r.total ?? 0),
      succeededCount: Number(r.succeeded ?? 0),
      pendingCount: Number(r.pending ?? 0),
      failedCount: Number(r.failed ?? 0),
      lastExecutedAt: (r.lastExecutedAt as Date | null) ?? null,
    });
  }
  return targetIds.map(
    (id) =>
      byTargetId.get(id) ?? {
        targetId: id,
        totalExecutions: 0,
        succeededCount: 0,
        pendingCount: 0,
        failedCount: 0,
        lastExecutedAt: null,
      },
  );
}

export async function setPublishTargetEnabled(
  targetId: number,
  enabled: boolean,
): Promise<PublishTargetSummary> {
  const db = getAsDb();
  if (!db) throw new PublishTargetNotFoundForToggleError(targetId);
  const existing = await db
    .select({ id: agsPublishTargets.id })
    .from(agsPublishTargets)
    .where(eq(agsPublishTargets.id, targetId))
    .limit(1);
  if (existing.length === 0) {
    throw new PublishTargetNotFoundForToggleError(targetId);
  }
  await db
    .update(agsPublishTargets)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(agsPublishTargets.id, targetId));
  const rows = await db
    .select()
    .from(agsPublishTargets)
    .where(eq(agsPublishTargets.id, targetId))
    .limit(1);
  const r = rows[0];
  if (!r) throw new PublishTargetNotFoundForToggleError(targetId);
  return {
    id: Number(r.id),
    targetKey: String(r.targetKey),
    targetType: String(r.targetType),
    endpoint: String(r.endpoint),
    providerConnectionId: (r.providerConnectionId as number | null) ?? null,
    enabled: Boolean(r.enabled),
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  };
}
