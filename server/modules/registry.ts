/**
 * Module Registry — Central module binding management
 *
 * Provides workspace-scoped module enablement, preset application,
 * and module guard checks for route protection.
 */

import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db/connection";
import {
  workspaceModules,
  workspaceActivityLog,
  workspaces,
  MODULE_KEYS,
  type ModuleKey,
  type WorkspaceModule,
} from "../../drizzle/schema";
import { createAppBlockerError } from "../_core/blockers";

export const MODULE_PRESETS: Record<string, ModuleKey[]> = {
  personal: ["pmt", "knowledge", "reporting"],
  team: ["pmt", "knowledge", "agents", "collaboration", "reporting"],
  project: ["pmt", "knowledge", "agents", "collaboration", "reporting"],
  research: ["knowledge", "reporting"],
  enterprise: ["pmt", "knowledge", "agents", "collaboration", "reporting"],
  sandbox: ["pmt", "knowledge", "agents"],
  readonly: ["reporting"],
};

export async function seedWorkspaceModules(
  workspaceId: number,
  workspaceType: string = "team"
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const enabledModules = MODULE_PRESETS[workspaceType] ?? MODULE_PRESETS.team;

  for (const key of MODULE_KEYS) {
    await db
      .insert(workspaceModules)
      .values({
        workspaceId,
        moduleKey: key,
        enabled: enabledModules.includes(key),
      })
      .onConflictDoNothing();
  }
}

export async function getWorkspaceModules(workspaceId: number): Promise<WorkspaceModule[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(workspaceModules).where(eq(workspaceModules.workspaceId, workspaceId));
}

export async function isModuleEnabled(workspaceId: number, moduleKey: ModuleKey): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const rows = await db
    .select()
    .from(workspaceModules)
    .where(
      and(
        eq(workspaceModules.workspaceId, workspaceId),
        eq(workspaceModules.moduleKey, moduleKey),
        eq(workspaceModules.enabled, true)
      )
    )
    .limit(1);

  return rows.length > 0;
}

export async function setModuleEnabled(
  workspaceId: number,
  moduleKey: ModuleKey,
  enabled: boolean
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const existing = await db
    .select()
    .from(workspaceModules)
    .where(
      and(
        eq(workspaceModules.workspaceId, workspaceId),
        eq(workspaceModules.moduleKey, moduleKey)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(workspaceModules)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(workspaceModules.id, existing[0].id));
  } else {
    await db
      .insert(workspaceModules)
      .values({ workspaceId, moduleKey, enabled });
  }
}

export async function logActivity(params: {
  workspaceId: number;
  moduleKey?: string;
  actorId?: number;
  action: string;
  targetType?: string;
  targetId?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(workspaceActivityLog).values(params);
  } catch (err) {
    console.warn(`[ActivityLog] Failed to log: ${(err as Error).message}`);
  }
}

export async function requireModule(workspaceId: number, moduleKey: ModuleKey): Promise<void> {
  const enabled = await isModuleEnabled(workspaceId, moduleKey);
  if (!enabled) {
    throw createAppBlockerError({
      code: "workspace_module_disabled",
      category: "dependency_block",
      title: "A required workspace feature is turned off",
      summary: `This action cannot continue because the ${moduleKey} module is not enabled for this workspace.`,
      recommendedActions: [
        "Enable the required module for this workspace, or switch to a workspace where it is available.",
      ],
      context: { workspaceId, moduleKey },
      technicalDetails: `Module \"${moduleKey}\" is not enabled for workspace ${workspaceId}`,
    }, "CONFLICT");
  }
  // WS-04: Workspace lifecycle check — block deleted workspaces on all module routes
  await requireWorkspaceNotDeleted(workspaceId);
}

/**
 * Block access to deleted workspaces from module routes.
 * Called within requireModule to provide lifecycle enforcement
 * across all 220+ module procedures with zero sub-router changes.
 */
async function requireWorkspaceNotDeleted(workspaceId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  const [ws] = await db
    .select({ status: workspaces.status })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!ws) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
  }
  if (ws.status === "deleted") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Workspace is deleted" });
  }
}
