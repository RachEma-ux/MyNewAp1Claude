/**
 * Extension service manifest barrel — V1+ Phase 18-α.
 *
 * Public API surface other modules use to install / approve /
 * disable extensions. The invocation path goes through
 * `runtime.ts:invokeFromExtension()` (the ONLY public entry point
 * to the MCP dispatcher from extension code).
 */

import { and, desc, eq, inArray, max, sql } from "drizzle-orm";

import { getAsDb, getAsDbForWorkspace } from "../../db/connection.js";
import {
  agsExtensions,
  agsExtensionInvocations,
} from "../../../../drizzle/tables/agent-studio-extensions.js";
import {
  ExtensionNotFoundError,
  ExtensionStatusInvalidError,
  isExtensionGovernanceStatus,
  type ApproveExtensionInput,
  type ExtensionGovernanceStatus,
  type ExtensionRecord,
  type InstallExtensionInput,
} from "./contracts.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB unavailable for extension operation");
    this.name = "AsdbUnavailableError";
  }
}

function rowToExtension(r: Record<string, unknown>): ExtensionRecord {
  const status = isExtensionGovernanceStatus(r.governanceStatus)
    ? r.governanceStatus
    : "pending_approval";
  return {
    id: Number(r.id),
    workspaceId: Number(r.workspaceId),
    extensionKey: String(r.extensionKey),
    name: String(r.name),
    version: String(r.version),
    signingKeyId: (r.signingKeyId as string | null) ?? null,
    governanceStatus: status,
    capabilityLanes: Array.isArray(r.capabilityLanes)
      ? (r.capabilityLanes as ExtensionRecord["capabilityLanes"])
      : [],
    declaredToolNames: Array.isArray(r.declaredToolNames)
      ? (r.declaredToolNames as string[])
      : [],
    config: (r.config as Record<string, unknown> | null) ?? null,
    installedAt: r.installedAt as Date,
    approvedAt: (r.approvedAt as Date | null) ?? null,
    disabledAt: (r.disabledAt as Date | null) ?? null,
    installedByUserId: (r.installedByUserId as number | null) ?? null,
    approvedByUserId: (r.approvedByUserId as number | null) ?? null,
    disabledByUserId: (r.disabledByUserId as number | null) ?? null,
  };
}

export async function installExtension(
  input: InstallExtensionInput,
): Promise<ExtensionRecord> {
  // V1+ MR-3 caller migration: workspaceId is in scope, so this
  // call site is in inventory Category A. Phase-1 shim delegates
  // to getAsDb(); Phase-2 will route by region without caller
  // changes. See docs/implementation/agent-studio-mr-3-getasdb-inventory.md.
  const db = getAsDbForWorkspace(input.workspaceId);
  if (!db) throw new AsdbUnavailableError();
  const [inserted] = await db
    .insert(agsExtensions)
    .values({
      workspaceId: input.workspaceId,
      extensionKey: input.manifest.extensionKey,
      name: input.manifest.name,
      version: input.manifest.version,
      signingKeyId: input.manifest.signingKeyId ?? null,
      governanceStatus: "pending_approval",
      capabilityLanes: [...input.manifest.capabilityLanes],
      declaredToolNames: [...input.manifest.declaredToolNames],
      config: input.manifest.config ?? null,
      installedByUserId: input.installedByUserId ?? null,
    })
    .returning();
  if (!inserted) throw new Error("Failed to insert extension");
  return rowToExtension(inserted as Record<string, unknown>);
}

export async function approveExtension(
  input: ApproveExtensionInput,
): Promise<ExtensionRecord> {
  // V1+ MR-3 twenty-first batch (PR-V1-89): split-handle pattern.
  // SELECT-by-id (Cat C bootstrap) discovers workspaceId, then
  // UPDATE routes via getAsDbForWorkspace.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const lookup = await lookupDb
    .select({ workspaceId: agsExtensions.workspaceId })
    .from(agsExtensions)
    .where(eq(agsExtensions.id, input.extensionId))
    .limit(1);
  if (lookup.length === 0) throw new ExtensionNotFoundError(input.extensionId);
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) throw new AsdbUnavailableError();
  await db
    .update(agsExtensions)
    .set({
      governanceStatus: "approved",
      approvedAt: new Date(),
      approvedByUserId: input.approvedByUserId,
      updatedAt: new Date(),
    })
    .where(eq(agsExtensions.id, input.extensionId));
  const row = await getExtensionById(input.extensionId);
  if (!row) throw new ExtensionNotFoundError(input.extensionId);
  return row;
}

export async function setExtensionStatus(
  extensionId: number,
  status: ExtensionGovernanceStatus,
  actorUserId?: number,
): Promise<ExtensionRecord> {
  if (!isExtensionGovernanceStatus(status)) {
    throw new ExtensionStatusInvalidError(status);
  }
  // V1+ MR-3 twenty-first batch (PR-V1-89): split-handle pattern
  // (same shape as approveExtension above).
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const lookup = await lookupDb
    .select({ workspaceId: agsExtensions.workspaceId })
    .from(agsExtensions)
    .where(eq(agsExtensions.id, extensionId))
    .limit(1);
  if (lookup.length === 0) throw new ExtensionNotFoundError(extensionId);
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) throw new AsdbUnavailableError();
  const patch: Record<string, unknown> = {
    governanceStatus: status,
    updatedAt: new Date(),
  };
  if (status === "disabled" || status === "revoked") {
    patch.disabledAt = new Date();
    patch.disabledByUserId = actorUserId ?? null;
  }
  await db
    .update(agsExtensions)
    .set(patch)
    .where(eq(agsExtensions.id, extensionId));
  const row = await getExtensionById(extensionId);
  if (!row) throw new ExtensionNotFoundError(extensionId);
  return row;
}

export async function getExtensionById(
  extensionId: number,
): Promise<ExtensionRecord | null> {
  // V1+ MR-3 seventy-third batch (PR-V1-143): Path-A read consumer.
  // agsExtensions.workspaceId is non-null FK; pre-projection pulls
  // it up, then the full-row SELECT routes via getAsDbForWorkspace.
  const lookupDb = getAsDb();
  if (!lookupDb) return null;
  const wsRows = await lookupDb
    .select({ workspaceId: agsExtensions.workspaceId })
    .from(agsExtensions)
    .where(eq(agsExtensions.id, extensionId))
    .limit(1);
  if (wsRows.length === 0) return null;
  const db = getAsDbForWorkspace(wsRows[0].workspaceId) ?? lookupDb;
  const rows = await db
    .select()
    .from(agsExtensions)
    .where(eq(agsExtensions.id, extensionId))
    .limit(1);
  return rows[0] ? rowToExtension(rows[0] as Record<string, unknown>) : null;
}

/**
 * PR-V1-179: hard uninstall an extension row.
 *
 * Distinct from `setExtensionStatus(..., "revoked")` which preserves
 * the row for audit; `uninstallExtension` actually deletes the row.
 * Idempotent — returns `false` when no row matched, `true` on
 * delete. Routes via the same split-handle as setExtensionStatus.
 *
 * PR-V1-180: cascade-delete `ags_extension_invocations` rows that FK
 * to this extension first, then delete the parent row. Without this
 * step, ANY extension with telemetry history (i.e. every extension
 * that has ever been invoked) fails the parent DELETE with a foreign
 * key violation, defeating the uninstall path entirely. The cascade
 * is intentional: invocation telemetry is per-extension, not part
 * of the audit-of-record (that lives in `ags_approval_steps` /
 * `ags_pending_permission_requests`), so deleting it with the
 * parent is correct. Operators wanting to preserve the telemetry
 * should `setStatus(..., "revoked")` instead.
 *
 * Operator-only — invocations from the extension framework itself
 * are not allowed (extensions can't unilaterally uninstall
 * themselves). Caller is responsible for ensuring the extension is
 * not currently running.
 */
export async function uninstallExtension(
  extensionId: number,
): Promise<boolean> {
  const lookupDb = getAsDb();
  if (!lookupDb) return false;
  const lookup = await lookupDb
    .select({ workspaceId: agsExtensions.workspaceId })
    .from(agsExtensions)
    .where(eq(agsExtensions.id, extensionId))
    .limit(1);
  if (lookup.length === 0) return false;
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) return false;
  await db
    .delete(agsExtensionInvocations)
    .where(eq(agsExtensionInvocations.extensionId, extensionId));
  await db.delete(agsExtensions).where(eq(agsExtensions.id, extensionId));
  return true;
}

/**
 * PR-V1-181: per-extension invocation summary.
 *
 * Returns `{ totalInvocations, allowedCount, deniedCount,
 * lastInvokedAt }` aggregated from `ags_extension_invocations`.
 * Operator-facing telemetry shown inline in the Extensions admin
 * panel so operators can see at-a-glance whether an extension is
 * actually being used / being denied. Read-only; this never
 * mutates telemetry. Used by the new
 * `agentStudio.extensions.workspaceInvocationSummaries` query
 * which calls it for every extension in a workspace in one shot.
 *
 * The `capabilityCheck` column is the closed taxonomy `allowed` |
 * `denied_undeclared` | `denied_revoked` | `denied_disabled`;
 * everything not literally "allowed" counts as denied for the
 * summary.
 */
export interface ExtensionInvocationSummary {
  readonly extensionId: number;
  readonly totalInvocations: number;
  readonly allowedCount: number;
  readonly deniedCount: number;
  readonly lastInvokedAt: Date | null;
}

export async function getInvocationSummariesByWorkspace(
  workspaceId: number,
): Promise<ReadonlyArray<ExtensionInvocationSummary>> {
  const db = getAsDbForWorkspace(workspaceId);
  if (!db) return [];
  const extensionRows = await db
    .select({ id: agsExtensions.id })
    .from(agsExtensions)
    .where(eq(agsExtensions.workspaceId, workspaceId));
  if (extensionRows.length === 0) return [];
  const extensionIds = extensionRows.map((r) => Number(r.id));
  const summary = await db
    .select({
      extensionId: agsExtensionInvocations.extensionId,
      total: sql<number>`count(*)::int`,
      allowed:
        sql<number>`count(*) filter (where ${agsExtensionInvocations.capabilityCheck} = 'allowed')::int`,
      denied:
        sql<number>`count(*) filter (where ${agsExtensionInvocations.capabilityCheck} <> 'allowed')::int`,
      lastInvokedAt: max(agsExtensionInvocations.invokedAt),
    })
    .from(agsExtensionInvocations)
    .where(inArray(agsExtensionInvocations.extensionId, extensionIds))
    .groupBy(agsExtensionInvocations.extensionId);
  const byId = new Map<number, ExtensionInvocationSummary>();
  for (const r of summary) {
    byId.set(Number(r.extensionId), {
      extensionId: Number(r.extensionId),
      totalInvocations: Number(r.total ?? 0),
      allowedCount: Number(r.allowed ?? 0),
      deniedCount: Number(r.denied ?? 0),
      lastInvokedAt: (r.lastInvokedAt as Date | null) ?? null,
    });
  }
  // Zero-fill extensions with no telemetry so the UI doesn't need
  // to do its own merge to render "0 invocations" rows.
  return extensionIds.map(
    (id) =>
      byId.get(id) ?? {
        extensionId: id,
        totalInvocations: 0,
        allowedCount: 0,
        deniedCount: 0,
        lastInvokedAt: null,
      },
  );
}

/**
 * PR-V1-182: workspace-scoped recent invocation log.
 *
 * Returns the N most recent rows from `ags_extension_invocations`
 * for extensions belonging to `workspaceId`, sorted by
 * `invokedAt DESC`. Used by `ExtensionsAdminPanel` to render an
 * operator-facing recent-activity feed below the table so the
 * "denied" / "succeeded=false" cases are visible without writing
 * SQL by hand.
 *
 * Optional `extensionId` filter when an operator wants only one
 * extension's recent activity. Default `limit = 50`, clamped to
 * `[1, 500]`.
 */
export interface ExtensionInvocationLogRow {
  readonly id: number;
  readonly extensionId: number;
  readonly lane: string;
  readonly invokedToolName: string | null;
  readonly capabilityCheck: string;
  readonly succeeded: boolean | null;
  readonly errorMessage: string | null;
  readonly invokedAt: Date;
}

/**
 * PR-V1-204: fetch a single extension invocation by id, including
 * the `details` JSON blob. On-demand because the blob can be large
 * (forwarder response payloads, capability-check context, etc.) —
 * UI fetches when an operator clicks "view details" on a row.
 * Symmetric with `getPublishExecutionById` (#940). Returns null on
 * no-match. No workspace-bound check here — caller is admin, but if
 * we ever expose this to a tenant-scoped surface the lookup should
 * intersect with the workspace's installed extension ids first.
 */
export interface ExtensionInvocationDetail extends ExtensionInvocationLogRow {
  readonly details: Record<string, unknown> | null;
}

export async function getExtensionInvocationById(
  invocationId: number,
): Promise<ExtensionInvocationDetail | null> {
  const lookupDb = getAsDb();
  if (!lookupDb) return null;
  const rows = await lookupDb
    .select()
    .from(agsExtensionInvocations)
    .where(eq(agsExtensionInvocations.id, invocationId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    extensionId: Number(r.extensionId),
    lane: String(r.lane),
    invokedToolName: (r.invokedToolName as string | null) ?? null,
    capabilityCheck: String(r.capabilityCheck),
    succeeded: (r.succeeded as boolean | null) ?? null,
    errorMessage: (r.errorMessage as string | null) ?? null,
    invokedAt: r.invokedAt as Date,
    details: (r.details as Record<string, unknown> | null) ?? null,
  };
}

export async function listRecentInvocationsByWorkspace(args: {
  workspaceId: number;
  extensionId?: number;
  limit?: number;
}): Promise<ReadonlyArray<ExtensionInvocationLogRow>> {
  const db = getAsDbForWorkspace(args.workspaceId);
  if (!db) return [];
  const limit = Math.max(1, Math.min(500, args.limit ?? 50));
  const extensionRows = await db
    .select({ id: agsExtensions.id })
    .from(agsExtensions)
    .where(eq(agsExtensions.workspaceId, args.workspaceId));
  if (extensionRows.length === 0) return [];
  const workspaceExtensionIds = extensionRows.map((r) => Number(r.id));
  const filters = [
    inArray(agsExtensionInvocations.extensionId, workspaceExtensionIds),
  ];
  if (args.extensionId !== undefined) {
    // Restrict to a single extension. The intersection with
    // workspaceExtensionIds also keeps cross-workspace ids from
    // leaking through the operator panel.
    filters.push(eq(agsExtensionInvocations.extensionId, args.extensionId));
  }
  const rows = await db
    .select({
      id: agsExtensionInvocations.id,
      extensionId: agsExtensionInvocations.extensionId,
      lane: agsExtensionInvocations.lane,
      invokedToolName: agsExtensionInvocations.invokedToolName,
      capabilityCheck: agsExtensionInvocations.capabilityCheck,
      succeeded: agsExtensionInvocations.succeeded,
      errorMessage: agsExtensionInvocations.errorMessage,
      invokedAt: agsExtensionInvocations.invokedAt,
    })
    .from(agsExtensionInvocations)
    .where(filters.length === 1 ? filters[0] : and(...filters))
    .orderBy(desc(agsExtensionInvocations.invokedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: Number(r.id),
    extensionId: Number(r.extensionId),
    lane: String(r.lane),
    invokedToolName: (r.invokedToolName as string | null) ?? null,
    capabilityCheck: String(r.capabilityCheck),
    succeeded: (r.succeeded as boolean | null) ?? null,
    errorMessage: (r.errorMessage as string | null) ?? null,
    invokedAt: r.invokedAt as Date,
  }));
}

export async function listExtensionsByWorkspace(
  workspaceId: number,
  filterStatus?: ExtensionGovernanceStatus,
): Promise<ReadonlyArray<ExtensionRecord>> {
  // V1+ MR-3 caller migration: workspaceId is the first parameter.
  // Phase-1 shim delegates to getAsDb(); Phase-2 routes by region.
  const db = getAsDbForWorkspace(workspaceId);
  if (!db) return [];
  const filters = [eq(agsExtensions.workspaceId, workspaceId)];
  if (filterStatus !== undefined) {
    filters.push(eq(agsExtensions.governanceStatus, filterStatus));
  }
  const rows = await db
    .select()
    .from(agsExtensions)
    .where(filters.length === 1 ? filters[0] : and(...filters));
  return rows.map((r) => rowToExtension(r as Record<string, unknown>));
}
