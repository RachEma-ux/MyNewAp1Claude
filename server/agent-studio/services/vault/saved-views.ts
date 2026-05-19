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

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsVaultSavedViews,
  agsVaultSavedViewVersions,
} from "../../../../drizzle/tables/agent-studio-vault.js";

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

/**
 * Closed-taxonomy saved-view visibility values. Promoted to a
 * tuple-derived constant at T-B.7 so the aggregator + downstream UI
 * can iterate.
 */
export const SAVED_VIEW_VISIBILITIES = [
  "personal",
  "workspace_shared",
] as const;
export type SavedViewVisibility =
  (typeof SAVED_VIEW_VISIBILITIES)[number];

export interface SavedViewRow {
  readonly id: number;
  readonly vaultId: number;
  readonly ownerUserId: number | null;
  readonly name: string;
  readonly viewKind: string;
  readonly filters: Record<string, unknown> | null;
  readonly sort: Record<string, unknown> | null;
  readonly columns: string[] | null;
  readonly visibility: SavedViewVisibility;
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

export interface UpdateSavedViewOptions extends SavedViewServiceOptions {
  /** V1+ Phase 16-γ — operator user id captured on the version
   *  snapshot row so `listSavedViewVersions` can render audit trail. */
  readonly capturedByUserId?: number;
}

export async function updateSavedView(
  input: UpdateSavedViewInput,
  options: UpdateSavedViewOptions = {},
): Promise<SavedViewRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  // V1+ Phase 16-γ — snapshot the prior row state to
  // `ags_vault_saved_view_versions` BEFORE applying the update.
  // The snapshot carries the row at its current `version` number;
  // the post-update row carries the bumped counter.
  const prior = await getSavedViewById(input.id, options);
  if (!prior) throw new SavedViewNotFoundError(input.id);
  await db.insert(agsVaultSavedViewVersions).values({
    savedViewId: prior.id,
    version: prior.version,
    name: prior.name,
    viewKind: prior.viewKind,
    filters: (prior.filters as Record<string, unknown> | null) ?? null,
    sort: (prior.sort as Record<string, unknown> | null) ?? null,
    columns: (prior.columns as string[] | null) ?? null,
    visibility: prior.visibility,
    capturedByUserId: options.capturedByUserId ?? null,
  });

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

/**
 * Bulk-delete saved views by id (T-F.118 / T-F.2-ζ.2).
 *
 * Single DB round-trip via `inArray`. Empty input short-circuits
 * with `{ deletedCount: 0 }` and no DB call (matches the
 * `dismissNotifications` / `bulkDismissFindings` empty-array
 * contract). Returns the actual `deletedCount` from `.returning()`
 * so the UI can render "N deleted" (operator sees the real
 * server-side count, distinct from the input length when some IDs
 * didn't exist).
 */
export async function deleteSavedViews(
  viewIds: readonly number[],
  options: SavedViewServiceOptions = {},
): Promise<{ deletedCount: number }> {
  if (viewIds.length === 0) return { deletedCount: 0 };

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const deleted = await db
    .delete(agsVaultSavedViews)
    .where(inArray(agsVaultSavedViews.id, viewIds as number[]))
    .returning({ id: agsVaultSavedViews.id });

  return { deletedCount: deleted.length };
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

// ============================================================================
// V1+ Phase 16-γ — immutable version history
// ============================================================================

export interface SavedViewVersionRow {
  readonly id: number;
  readonly savedViewId: number;
  readonly version: number;
  readonly name: string;
  readonly viewKind: string;
  readonly filters: Record<string, unknown> | null;
  readonly sort: Record<string, unknown> | null;
  readonly columns: string[] | null;
  readonly visibility: string;
  readonly capturedByUserId: number | null;
  readonly capturedAt: Date;
}

function rowToSavedViewVersion(r: Record<string, unknown>): SavedViewVersionRow {
  return {
    id: Number(r.id),
    savedViewId: Number(r.savedViewId),
    version: Number(r.version),
    name: String(r.name),
    viewKind: String(r.viewKind),
    filters: (r.filters as Record<string, unknown> | null) ?? null,
    sort: (r.sort as Record<string, unknown> | null) ?? null,
    columns: (r.columns as string[] | null) ?? null,
    visibility: String(r.visibility),
    capturedByUserId: (r.capturedByUserId as number | null) ?? null,
    capturedAt: r.capturedAt as Date,
  };
}

/**
 * Return all immutable version snapshots for a saved view in
 * version-desc order. Empty array when no versions exist yet (no
 * updates since creation).
 */
export async function listSavedViewVersions(
  savedViewId: number,
  options: SavedViewServiceOptions = {},
): Promise<SavedViewVersionRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: agsVaultSavedViewVersions.id,
      savedViewId: agsVaultSavedViewVersions.savedViewId,
      version: agsVaultSavedViewVersions.version,
      name: agsVaultSavedViewVersions.name,
      viewKind: agsVaultSavedViewVersions.viewKind,
      filters: agsVaultSavedViewVersions.filters,
      sort: agsVaultSavedViewVersions.sort,
      columns: agsVaultSavedViewVersions.columns,
      visibility: agsVaultSavedViewVersions.visibility,
      capturedByUserId: agsVaultSavedViewVersions.capturedByUserId,
      capturedAt: agsVaultSavedViewVersions.capturedAt,
    })
    .from(agsVaultSavedViewVersions)
    .where(eq(agsVaultSavedViewVersions.savedViewId, savedViewId))
    .orderBy(desc(agsVaultSavedViewVersions.version));
  return rows.map((r) => rowToSavedViewVersion(r as Record<string, unknown>));
}

/**
 * Look up one immutable version snapshot by id. Returns null when
 * the row is absent.
 */
export async function getSavedViewVersionById(
  versionId: number,
  options: SavedViewServiceOptions = {},
): Promise<SavedViewVersionRow | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: agsVaultSavedViewVersions.id,
      savedViewId: agsVaultSavedViewVersions.savedViewId,
      version: agsVaultSavedViewVersions.version,
      name: agsVaultSavedViewVersions.name,
      viewKind: agsVaultSavedViewVersions.viewKind,
      filters: agsVaultSavedViewVersions.filters,
      sort: agsVaultSavedViewVersions.sort,
      columns: agsVaultSavedViewVersions.columns,
      visibility: agsVaultSavedViewVersions.visibility,
      capturedByUserId: agsVaultSavedViewVersions.capturedByUserId,
      capturedAt: agsVaultSavedViewVersions.capturedAt,
    })
    .from(agsVaultSavedViewVersions)
    .where(eq(agsVaultSavedViewVersions.id, versionId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToSavedViewVersion(rows[0] as Record<string, unknown>);
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

// ============================================================================
// V1+ Phase 16-γ — restore from a version snapshot (no-deferral slice 50)
//
// Closes the remaining-punch-list rank-7 drill: version-history reads
// (`listSavedViewVersions` / `getSavedViewVersionById`) shipped at Phase
// 16-γ, but the restore *mutation* operators reach for after browsing
// history was never wired. This function delegates to `updateSavedView`
// so the restore itself snapshots the pre-restore row into a NEW
// `ags_vault_saved_view_versions` entry — audit-trail preserved by
// reuse, not re-implementation. Operators can roll back a restore by
// restoring the version it just produced.
// ============================================================================

export class SavedViewVersionNotFoundError extends Error {
  constructor(public readonly versionId: number) {
    super(`Saved view version ${versionId} not found`);
    this.name = "SavedViewVersionNotFoundError";
  }
}

/**
 * Restore a saved view to the snapshot at `versionId`. Composes
 * `getSavedViewVersionById` + `updateSavedView` so the existing
 * snapshot-before-update behavior captures the pre-restore row into a
 * new version row (audit-trail invariant preserved).
 *
 * `viewKind` is not restored — it is an identity attribute of the
 * saved view, not a versioned content field, and `UpdateSavedViewInput`
 * intentionally has no `viewKind` field. The restore otherwise
 * overwrites `name` / `filters` / `sort` / `columns` / `visibility`
 * from the snapshot.
 *
 * Throws `SavedViewVersionNotFoundError` when the version row is
 * absent (covers stale dashboard links). Throws
 * `SavedViewNotFoundError` (from the inner `updateSavedView`) when the
 * parent saved view row has been deleted since the version was
 * captured — the version row outlives its parent, so this is a real
 * edge case operators may hit.
 */
export async function restoreSavedViewVersion(
  versionId: number,
  options: UpdateSavedViewOptions = {},
): Promise<SavedViewRow> {
  const version = await getSavedViewVersionById(versionId, options);
  if (!version) throw new SavedViewVersionNotFoundError(versionId);

  const visibility: SavedViewVisibility =
    version.visibility === "workspace_shared" ? "workspace_shared" : "personal";

  return updateSavedView(
    {
      id: version.savedViewId,
      name: version.name,
      filters: version.filters,
      sort: version.sort,
      columns: version.columns,
      visibility,
    },
    options,
  );
}
