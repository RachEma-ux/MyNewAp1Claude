/**
 * Module Registry — Central module binding management
 *
 * Provides workspace-scoped module enablement, preset application,
 * and module guard checks for route protection.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  workspaceModules,
  workspaceActivityLog,
  MODULE_KEYS,
  type ModuleKey,
  type WorkspaceModule,
} from "../../drizzle/schema";

// ============================================================================
// Module Presets — applied when creating a workspace
// ============================================================================

export const MODULE_PRESETS: Record<string, ModuleKey[]> = {
  personal: ["pmt", "knowledge", "reporting"],
  team: ["pmt", "knowledge", "agents", "collaboration", "reporting"],
  enterprise: ["pmt", "knowledge", "agents", "collaboration", "reporting"],
  sandbox: ["pmt", "knowledge", "agents"],
  readonly: ["reporting"],
};

// ============================================================================
// Module Operations
// ============================================================================

/**
 * Seed default modules for a workspace based on workspace type.
 */
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

/**
 * Get all module bindings for a workspace.
 */
export async function getWorkspaceModules(workspaceId: number): Promise<WorkspaceModule[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(workspaceModules).where(eq(workspaceModules.workspaceId, workspaceId));
}

/**
 * Check if a module is enabled for a workspace.
 */
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

/**
 * Enable or disable a module for a workspace.
 */
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

// ============================================================================
// Activity Logging
// ============================================================================

/**
 * Log a workspace activity event.
 */
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

/**
 * Guard: throws if module is not enabled for workspace.
 */
export async function requireModule(workspaceId: number, moduleKey: ModuleKey): Promise<void> {
  const enabled = await isModuleEnabled(workspaceId, moduleKey);
  if (!enabled) {
    throw new Error(`Module "${moduleKey}" is not enabled for workspace ${workspaceId}`);
  }
}
