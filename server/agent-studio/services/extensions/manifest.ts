/**
 * Extension service manifest barrel — V1+ Phase 18-α.
 *
 * Public API surface other modules use to install / approve /
 * disable extensions. The invocation path goes through
 * `runtime.ts:invokeFromExtension()` (the ONLY public entry point
 * to the MCP dispatcher from extension code).
 */

import { and, eq } from "drizzle-orm";

import { getAsDb, getAsDbForWorkspace } from "../../db/connection.js";
import { agsExtensions } from "../../../../drizzle/tables/agent-studio-extensions.js";
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
  const db = getAsDb();
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
  const db = getAsDb();
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
  const db = getAsDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agsExtensions)
    .where(eq(agsExtensions.id, extensionId))
    .limit(1);
  return rows[0] ? rowToExtension(rows[0] as Record<string, unknown>) : null;
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
