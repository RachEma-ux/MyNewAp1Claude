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

import { and, desc, eq } from "drizzle-orm";

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
