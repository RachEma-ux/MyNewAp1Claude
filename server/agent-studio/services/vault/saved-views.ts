/**
 * Vault — Saved Views service.
 *
 * Phase 16 §1-§4. Wires the dormant `ags_vault_saved_views` table.
 * Closes the four "Users can ..." acceptance criteria:
 *
 *   - Users can create saved note views.
 *   - Users can filter by tags/properties.
 *   - Users can sort by properties.
 *   - Users can choose visible columns.
 *
 * The remaining Phase 16 criteria (Entity Views, Runtime Asset
 * Views, Projection Status Views) are `viewKind` discriminators —
 * the generic CRUD shipped here supports any kind a caller passes,
 * and operator-blessed presets land as seed rows in a follow-on
 * PR (same pattern as Phase 15 §3-§11 blessed templates).
 *
 * Filters / sort / columns are stored as opaque JSON. The view-
 * rendering layer (UI) decodes them; the service is unopinionated
 * about shape so future view kinds can ship without DB churn.
 *
 * ADR: docs/architecture/agent-studio-markdown-profile.md
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsVaultSavedViews } from "../../../../drizzle/tables/agent-studio-vault.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class SavedViewNotFoundError extends Error {
  constructor(public readonly viewId: number) {
    super(`Saved view ${viewId} not found`);
    this.name = "SavedViewNotFoundError";
  }
}

export interface CreateSavedViewInput {
  readonly vaultId: number;
  readonly ownerUserId?: number | null;
  readonly name: string;
  /**
   * Free-form discriminator. Canonical kinds: "note_list",
   * "entity_list", "runtime_asset_list", "graph_quality",
   * "projection_status". The service does not gate on this value
   * so future kinds ship without DB churn.
   */
  readonly viewKind: string;
  readonly filters?: Record<string, unknown> | null;
  readonly sort?: Record<string, unknown> | null;
  readonly columns?: string[] | null;
  /** V1+ Phase 16-α — sharing model. `"personal"` (default) or
   *  `"workspace_shared"`. See `saved-views-visibility.ts`. */
  readonly visibility?: "personal" | "workspace_shared";
  /** When forking a shared view into a personal copy. */
  readonly parentSavedViewId?: number | null;
}

export interface SavedViewRow {
  readonly id: number;
  readonly vaultId: number;
  readonly ownerUserId: number | null;
  readonly name: string;
  readonly viewKind: string;
  readonly filters: Record<string, unknown> | null;
  readonly sort: Record<string, unknown> | null;
  readonly columns: string[] | null;
  readonly visibility: "personal" | "workspace_shared";
  readonly version: number;
  readonly parentSavedViewId: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpdateSavedViewInput {
  readonly id: number;
  readonly name?: string;
  readonly filters?: Record<string, unknown> | null;
  readonly sort?: Record<string, unknown> | null;
  readonly columns?: string[] | null;
  /** V1+ Phase 16-α — operators can flip visibility. */
  readonly visibility?: "personal" | "workspace_shared";
}

export interface ListSavedViewsInput {
  readonly vaultId: number;
  readonly ownerUserId?: number | null;
  readonly viewKind?: string;
  readonly limit?: number;
}

export interface SavedViewServiceOptions {
  readonly getDb?: typeof getAsDb;
}

function rowToSavedView(r: Record<string, unknown>): SavedViewRow {
  const visibility =
    r.visibility === "workspace_shared" ? "workspace_shared" : "personal";
  return {
    id: Number(r.id),
    vaultId: Number(r.vaultId),
    ownerUserId: r.ownerUserId == null ? null : Number(r.ownerUserId),
    name: String(r.name),
    viewKind: String(r.viewKind),
    filters:
      (r.filters as Record<string, unknown> | null | undefined) ?? null,
    sort: (r.sort as Record<string, unknown> | null | undefined) ?? null,
    columns: (r.columns as string[] | null | undefined) ?? null,
    visibility,
    version: r.version == null ? 1 : Number(r.version),
    parentSavedViewId:
      r.parentSavedViewId == null ? null : Number(r.parentSavedViewId),
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  };
}

export async function createSavedView(
  input: CreateSavedViewInput,
  options: SavedViewServiceOptions = {},
): Promise<SavedViewRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const inserted = await db
    .insert(agsVaultSavedViews)
    .values({
      vaultId: input.vaultId,
      ownerUserId: input.ownerUserId ?? null,
      name: input.name,
      viewKind: input.viewKind,
      filters: input.filters ?? null,
      sort: input.sort ?? null,
      columns: input.columns ?? null,
      visibility: input.visibility ?? "personal",
      version: 1,
      parentSavedViewId: input.parentSavedViewId ?? null,
    })
    .returning({
      id: agsVaultSavedViews.id,
      vaultId: agsVaultSavedViews.vaultId,
      ownerUserId: agsVaultSavedViews.ownerUserId,
      name: agsVaultSavedViews.name,
      viewKind: agsVaultSavedViews.viewKind,
      filters: agsVaultSavedViews.filters,
      sort: agsVaultSavedViews.sort,
      columns: agsVaultSavedViews.columns,
      visibility: agsVaultSavedViews.visibility,
      version: agsVaultSavedViews.version,
      parentSavedViewId: agsVaultSavedViews.parentSavedViewId,
      createdAt: agsVaultSavedViews.createdAt,
      updatedAt: agsVaultSavedViews.updatedAt,
    });
  const row = inserted[0];
  if (!row) throw new Error("Failed to insert saved view");
  return rowToSavedView(row);
}

export async function getSavedViewById(
  viewId: number,
  options: SavedViewServiceOptions = {},
): Promise<SavedViewRow | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: agsVaultSavedViews.id,
      vaultId: agsVaultSavedViews.vaultId,
      ownerUserId: agsVaultSavedViews.ownerUserId,
      name: agsVaultSavedViews.name,
      viewKind: agsVaultSavedViews.viewKind,
      filters: agsVaultSavedViews.filters,
      sort: agsVaultSavedViews.sort,
      columns: agsVaultSavedViews.columns,
      visibility: agsVaultSavedViews.visibility,
      version: agsVaultSavedViews.version,
      parentSavedViewId: agsVaultSavedViews.parentSavedViewId,
      createdAt: agsVaultSavedViews.createdAt,
      updatedAt: agsVaultSavedViews.updatedAt,
    })
    .from(agsVaultSavedViews)
    .where(eq(agsVaultSavedViews.id, viewId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToSavedView(rows[0]);
}

export async function listSavedViews(
  input: ListSavedViewsInput,
  options: SavedViewServiceOptions = {},
): Promise<SavedViewRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const filters = [eq(agsVaultSavedViews.vaultId, input.vaultId)];
  if (input.ownerUserId !== undefined && input.ownerUserId !== null) {
    filters.push(eq(agsVaultSavedViews.ownerUserId, input.ownerUserId));
  }
  if (input.viewKind !== undefined) {
    filters.push(eq(agsVaultSavedViews.viewKind, input.viewKind));
  }

  const rows = await db
    .select({
      id: agsVaultSavedViews.id,
      vaultId: agsVaultSavedViews.vaultId,
      ownerUserId: agsVaultSavedViews.ownerUserId,
      name: agsVaultSavedViews.name,
      viewKind: agsVaultSavedViews.viewKind,
      filters: agsVaultSavedViews.filters,
      sort: agsVaultSavedViews.sort,
      columns: agsVaultSavedViews.columns,
      visibility: agsVaultSavedViews.visibility,
      version: agsVaultSavedViews.version,
      parentSavedViewId: agsVaultSavedViews.parentSavedViewId,
      createdAt: agsVaultSavedViews.createdAt,
      updatedAt: agsVaultSavedViews.updatedAt,
    })
    .from(agsVaultSavedViews)
    .where(filters.length === 1 ? filters[0] : and(...filters))
    .orderBy(desc(agsVaultSavedViews.updatedAt))
    .limit(input.limit ?? 100);

  return rows.map(rowToSavedView);
}

export async function updateSavedView(
  input: UpdateSavedViewInput,
  options: SavedViewServiceOptions = {},
): Promise<SavedViewRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  // V1+ Phase 16-α: bump `version` on every content edit so callers
  // can detect drift against a snapshot they read earlier. Visibility
  // flips also bump (the "shape" the row presents is part of the
  // version contract for shared consumers).
  const patch: Record<string, unknown> = {
    updatedAt: new Date(),
    version: sql`${agsVaultSavedViews.version} + 1`,
  };
  if (input.name !== undefined) patch.name = input.name;
  if (input.filters !== undefined) patch.filters = input.filters;
  if (input.sort !== undefined) patch.sort = input.sort;
  if (input.columns !== undefined) patch.columns = input.columns;
  if (input.visibility !== undefined) patch.visibility = input.visibility;

  await db
    .update(agsVaultSavedViews)
    .set(patch)
    .where(eq(agsVaultSavedViews.id, input.id));

  const updated = await getSavedViewById(input.id, options);
  if (!updated) throw new SavedViewNotFoundError(input.id);
  return updated;
}

export async function deleteSavedView(
  viewId: number,
  options: SavedViewServiceOptions = {},
): Promise<{ deleted: boolean }> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  await db
    .delete(agsVaultSavedViews)
    .where(eq(agsVaultSavedViews.id, viewId));

  return { deleted: true };
}

// ============================================================================
// Viewer-scoped listing (V1+ Phase 16-β)
//
// The base `listSavedViews()` is the operator/admin path: it returns
// every row matching the (vaultId, ownerUserId, viewKind) filter
// without consulting visibility. Phase 16-α (#751) shipped the
// visibility helper (`saved-views-visibility.ts`) but the list path
// was never wired to it.
//
// This β slice composes listSavedViews + filterVisibleSavedViews so
// the caller can get a viewer-safe list in one call. Existing
// callers of listSavedViews keep their operator-scoped semantics.
// ============================================================================

import { filterVisibleSavedViews } from "./saved-views-visibility.js";

export interface ListVisibleSavedViewsForUserInput
  extends ListSavedViewsInput {
  readonly viewerUserId: number | null;
}

export interface ListVisibleSavedViewsForUserOptions
  extends SavedViewServiceOptions {
  /** Test seam — substitute the underlying list implementation. */
  readonly listImpl?: (
    input: ListSavedViewsInput,
    options: SavedViewServiceOptions,
  ) => Promise<SavedViewRow[]>;
}

/**
 * Returns the subset of saved views in `vaultId` that the supplied
 * viewer is allowed to see. Composes `listSavedViews` + the pure
 * `filterVisibleSavedViews` predicate from `saved-views-visibility.ts`.
 *
 * Visibility semantics (from CRDT-α / 16-α):
 *   - `workspace_shared` views are visible to any viewer.
 *   - `personal` views are visible only to their owner. A null
 *     ownerUserId on a `personal` row is treated as "owned by no
 *     one" — not visible to anyone (defensive against legacy NULLs).
 *
 * The intrinsic vaultId/ownerUserId/viewKind filters from
 * `ListSavedViewsInput` still apply (they bound the result *before*
 * the visibility filter).
 */
export async function listVisibleSavedViewsForUser(
  input: ListVisibleSavedViewsForUserInput,
  options: ListVisibleSavedViewsForUserOptions = {},
): Promise<SavedViewRow[]> {
  const list = options.listImpl ?? listSavedViews;
  const all = await list(input, options);
  return filterVisibleSavedViews({
    views: all,
    viewerUserId: input.viewerUserId,
  });
}
