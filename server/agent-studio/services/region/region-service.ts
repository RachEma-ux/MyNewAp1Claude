/**
 * Region service — V2 Phase MR-1 first slice.
 *
 * Composes:
 *   - `registerRegion` — operator-controlled region row insert.
 *   - `getRegionByKey` / `getRegionById` — lookup helpers.
 *   - `listActiveRegions` — operator browser.
 *   - `getPrimaryRegion` — returns the single primary row
 *     (single-region MVP always returns the `default` row).
 *
 * Hard-rule compliance:
 *   - No graph mutation.
 *   - Postgres = source of truth (region registry lives in ASDB).
 *   - No raw env reads — `postgresUri` / `neo4jUri` are stored on
 *     the row; secrets are bound via `credentialBindingId` and
 *     resolved out-of-band when a region-routed connection is
 *     established.
 *   - No `dispatchMcpToolCall` import — region routing is a data-
 *     plane concern, not a tool-execution path.
 */

import { and, eq } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";
import { agsRegions } from "../../../../drizzle/tables/agent-studio-regions.js";
import {
  RegionNotFoundError,
  type RegionRecord,
  type RegisterRegionInput,
} from "./types.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB unavailable for region operation");
    this.name = "AsdbUnavailableError";
  }
}

function rowToRegion(r: Record<string, unknown>): RegionRecord {
  return {
    id: Number(r.id),
    regionKey: String(r.regionKey),
    name: String(r.name),
    postgresUri: String(r.postgresUri),
    neo4jUri: (r.neo4jUri as string | null) ?? null,
    credentialBindingId: (r.credentialBindingId as string | null) ?? null,
    isPrimary: Boolean(r.isPrimary),
    isActive: Boolean(r.isActive),
    settings: (r.settings as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  };
}

export async function registerRegion(
  input: RegisterRegionInput,
): Promise<RegionRecord> {
  const db = getAsDb();
  if (!db) throw new AsdbUnavailableError();
  const [inserted] = await db
    .insert(agsRegions)
    .values({
      regionKey: input.regionKey,
      name: input.name,
      postgresUri: input.postgresUri,
      neo4jUri: input.neo4jUri ?? null,
      credentialBindingId: input.credentialBindingId ?? null,
      isPrimary: input.isPrimary ?? false,
      settings: input.settings ?? null,
    })
    .returning();
  if (!inserted) throw new Error("Failed to insert region");
  return rowToRegion(inserted as Record<string, unknown>);
}

export async function getRegionByKey(
  regionKey: string,
): Promise<RegionRecord | null> {
  const db = getAsDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agsRegions)
    .where(eq(agsRegions.regionKey, regionKey))
    .limit(1);
  return rows[0] ? rowToRegion(rows[0] as Record<string, unknown>) : null;
}

export async function getRegionById(
  id: number,
): Promise<RegionRecord | null> {
  const db = getAsDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agsRegions)
    .where(eq(agsRegions.id, id))
    .limit(1);
  return rows[0] ? rowToRegion(rows[0] as Record<string, unknown>) : null;
}

export async function listActiveRegions(): Promise<ReadonlyArray<RegionRecord>> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(agsRegions)
    .where(eq(agsRegions.isActive, true));
  return rows.map((r) => rowToRegion(r as Record<string, unknown>));
}

export async function getPrimaryRegion(): Promise<RegionRecord | null> {
  const db = getAsDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agsRegions)
    .where(and(eq(agsRegions.isPrimary, true), eq(agsRegions.isActive, true)))
    .limit(1);
  return rows[0] ? rowToRegion(rows[0] as Record<string, unknown>) : null;
}

/**
 * Throws if the named region exists but is inactive — surfaces the
 * "operator disabled this region; pick another" case at the call
 * site rather than returning null.
 */
export async function requireActiveRegion(
  regionKey: string,
): Promise<RegionRecord> {
  const region = await getRegionByKey(regionKey);
  if (!region) throw new RegionNotFoundError(regionKey);
  if (!region.isActive) {
    throw new RegionNotFoundError(`${regionKey} (inactive)`);
  }
  return region;
}
