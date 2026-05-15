/**
 * Workspace → Region pin service — V2 Phase MR-1 Phase-2 first slice.
 *
 * Reads + writes against `ags_workspace_region_pins` (PR-V1-148). The
 * service composes upstream of the MR-3 shim's eventual Phase-2 lookup:
 * given a workspaceId, return the pinned regionKey (or null when the
 * workspace has no pin and the shim should fall back to the primary
 * region).
 *
 * Out of scope for this PR:
 *   - Wiring the lookup into `getAsDbForWorkspace`. That requires a
 *     synchronous cache (the shim is sync; this service is async). A
 *     subsequent PR introduces the cache warmer.
 *   - Per-workspace failover orchestration. Recorded in the runbook
 *     at `docs/runbooks/agent-studio-multi-region-failover-runbook.md`.
 *
 * Hard-rule compliance:
 *   - Postgres = source of truth. The pin row IS the canonical record;
 *     any cache layer derives from this table.
 *   - No raw env reads. Region credentials bind via `agsRegions
 *     .credentialBindingId`, not via pin rows.
 *   - No `dispatchMcpToolCall` import — pin operations are data-plane
 *     metadata, not tool execution.
 *   - No `neo4j-driver` import — pin storage is Postgres-only.
 */

import { eq } from "drizzle-orm";

import { agsWorkspaceRegionPins } from "../../../../drizzle/tables/agent-studio-workspace-region-pins.js";
import { getAsDb } from "../../db/connection.js";
import { getRegionByKey, AsdbUnavailableError } from "./region-service.js";
import { RegionNotFoundError } from "./types.js";

export interface WorkspaceRegionPinRecord {
  readonly id: number;
  readonly workspaceId: number;
  readonly regionKey: string;
  readonly isReplicated: boolean;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SetWorkspaceRegionPinInput {
  readonly workspaceId: number;
  readonly regionKey: string;
  readonly isReplicated?: boolean;
  readonly notes?: string | null;
}

/**
 * Late-bound hook fired after every pin write. The routing bridge
 * (PR-V1-152) registers a callback that invalidates + re-warms the
 * in-process cache so pin changes are visible without a restart.
 *
 * Default is null — single-region operators without the routing
 * bridge installed see no effect. Tests register their own callbacks
 * to assert the fire path.
 */
let _onPinChanged: (() => void) | null = null;

export function setPinChangeHook(hook: (() => void) | null): void {
  _onPinChanged = hook;
}

function firePinChanged(): void {
  if (_onPinChanged) {
    try {
      _onPinChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ags-workspace-region-pin] change hook threw — ${msg}`);
    }
  }
}

function rowToPin(r: Record<string, unknown>): WorkspaceRegionPinRecord {
  return {
    id: Number(r.id),
    workspaceId: Number(r.workspaceId),
    regionKey: String(r.regionKey),
    isReplicated: Boolean(r.isReplicated),
    notes: (r.notes as string | null) ?? null,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  };
}

/**
 * Upsert a workspace's region pin. Validates that the regionKey
 * names an existing region row (active or inactive — operators
 * sometimes pre-pin a workspace to a region they're about to
 * activate). Throws `RegionNotFoundError` when the region row is
 * absent so callers don't insert a dangling pin.
 */
export async function setWorkspaceRegionPin(
  input: SetWorkspaceRegionPinInput,
): Promise<WorkspaceRegionPinRecord> {
  const db = getAsDb();
  if (!db) throw new AsdbUnavailableError();
  const region = await getRegionByKey(input.regionKey);
  if (!region) throw new RegionNotFoundError(input.regionKey);
  const existing = await db
    .select()
    .from(agsWorkspaceRegionPins)
    .where(eq(agsWorkspaceRegionPins.workspaceId, input.workspaceId))
    .limit(1);
  if (existing[0]) {
    const [updated] = await db
      .update(agsWorkspaceRegionPins)
      .set({
        regionKey: input.regionKey,
        isReplicated: input.isReplicated ?? false,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(agsWorkspaceRegionPins.workspaceId, input.workspaceId))
      .returning();
    if (!updated) throw new Error("Failed to update workspace region pin");
    firePinChanged();
    return rowToPin(updated as Record<string, unknown>);
  }
  const [inserted] = await db
    .insert(agsWorkspaceRegionPins)
    .values({
      workspaceId: input.workspaceId,
      regionKey: input.regionKey,
      isReplicated: input.isReplicated ?? false,
      notes: input.notes ?? null,
    })
    .returning();
  if (!inserted) throw new Error("Failed to insert workspace region pin");
  firePinChanged();
  return rowToPin(inserted as Record<string, unknown>);
}

/**
 * Look up a workspace's region pin. Returns null when no pin row
 * exists — the shim's Phase-2 lookup treats null as "fall back to
 * the primary region" (preserves single-region operational baseline).
 */
export async function getWorkspaceRegionPin(
  workspaceId: number,
): Promise<WorkspaceRegionPinRecord | null> {
  const db = getAsDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agsWorkspaceRegionPins)
    .where(eq(agsWorkspaceRegionPins.workspaceId, workspaceId))
    .limit(1);
  return rows[0] ? rowToPin(rows[0] as Record<string, unknown>) : null;
}

/**
 * Operator browser — every pin in the registry. Used by the
 * multi-region operator surface (not yet shipped).
 */
export async function listAllWorkspaceRegionPins(): Promise<
  ReadonlyArray<WorkspaceRegionPinRecord>
> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db.select().from(agsWorkspaceRegionPins);
  return rows.map((r) => rowToPin(r as Record<string, unknown>));
}

/**
 * Remove a workspace's pin. Returns true when a row was deleted,
 * false when no row matched (idempotent — no error on missing pin).
 */
export async function removeWorkspaceRegionPin(
  workspaceId: number,
): Promise<boolean> {
  const db = getAsDb();
  if (!db) return false;
  const lookup = await db
    .select()
    .from(agsWorkspaceRegionPins)
    .where(eq(agsWorkspaceRegionPins.workspaceId, workspaceId))
    .limit(1);
  if (!lookup[0]) return false;
  await db
    .delete(agsWorkspaceRegionPins)
    .where(eq(agsWorkspaceRegionPins.workspaceId, workspaceId));
  firePinChanged();
  return true;
}
