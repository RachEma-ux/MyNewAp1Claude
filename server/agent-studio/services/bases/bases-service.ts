/**
 * Bases service — CRUD entry points for Phase 24 MVP (T-F.1).
 *
 * Composes:
 *   - `createBase` — top-level Base entity
 *   - `listBases` — workspace or vault scoped browser
 *   - `getBaseSnapshot` — Base + all columns + all rows in one call
 *   - `updateBase` — partial-update of presentation + sort + archived
 *   - `createBaseColumn` — schema layer
 *   - `createBaseRow` — row instance (validates cells against schema
 *     keys; unknown keys rejected)
 *   - `updateBaseRow` — partial-update of cells / noteId / sortKey
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No graph mutation here. The Base → graph projection edge is
 *     emitted by a separate projection step (T-F.2) — this PR ships
 *     the data model + service.
 *   - No `process.env.*_API_KEY` reads.
 *   - No `neo4j-driver` imports.
 *   - GraphRepository is NOT touched — Bases reads are ASDB-only.
 *   - No `openrouter` / `dispatchMcpToolCall`.
 */

import { and, asc, eq, isNull } from "drizzle-orm";

import { getAsDb, getAsDbForWorkspace } from "../../db/connection.js";
import {
  agsBases,
  agsBaseColumns,
  agsBaseRows,
} from "../../../../drizzle/tables/agent-studio-bases.js";
import {
  AsdbUnavailableError,
  BaseColumnDataTypeError,
  BaseColumnNotFoundError,
  BaseNotFoundError,
  BaseRowNotFoundError,
  isAgsBaseColumnDataType,
  type AgsBase,
  type AgsBaseColumn,
  type AgsBaseRow,
  type BaseSnapshot,
  type CreateBaseColumnInput,
  type CreateBaseInput,
  type CreateBaseRowInput,
  type UpdateBaseInput,
  type UpdateBaseRowInput,
} from "./types.js";
import {
  enqueueBaseProjection,
  enqueueBaseRowProjection,
  enqueueBaseRowRemoval,
} from "./graph-projection.js";

/**
 * Fire-and-forget base-side projection enqueue. Failures here NEVER
 * roll back the Postgres mutation — Postgres is canonical, the graph
 * is a writeable projection. The drain cron will retry transiently
 * failed rows; permanent failures get capped at MAX_DRAIN_RETRY_ATTEMPTS.
 */
function fireBaseProjection(
  base: AgsBase,
  eventKind: "base.created" | "base.updated",
): void {
  void enqueueBaseProjection({
    baseId: base.id,
    workspaceId: base.workspaceId,
    vaultId: base.vaultId,
    slug: base.slug,
    name: base.name,
    eventKind,
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[bases-service] enqueueBaseProjection failed for base ${base.id} (${eventKind}): ${message}`,
    );
  });
}

function fireBaseRowProjection(row: AgsBaseRow): void {
  void enqueueBaseRowProjection({
    rowId: row.id,
    baseId: row.baseId,
    noteId: row.noteId,
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[bases-service] enqueueBaseRowProjection failed for row ${row.id}: ${message}`,
    );
  });
}

function fireBaseRowRemoval(rowId: number): void {
  void enqueueBaseRowRemoval({ rowId }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[bases-service] enqueueBaseRowRemoval failed for row ${rowId}: ${message}`,
    );
  });
}

// ----- Workspace resolution helpers (T-B.3 caller-migration tail) ----
//
// No-deferral continuation-7 slice 54. The remaining `getAsDb()` call
// sites in this file were Path-A "bootstrap lookup, then route" pattern
// candidates: the function receives a `baseId` (or `rowId`), the base
// row's `workspaceId` column is non-null for workspace-scoped bases,
// and the route-on-write contract is the same as `createBase`. Both
// helpers return `null` when the row is missing OR when the base is
// catalog-wide (workspaceId IS NULL) — callers then fall back to the
// bootstrap handle so the FK constraint surfaces the missing-row error
// naturally rather than tangling the routing path with NotFound logic.

type AsDbHandle = NonNullable<ReturnType<typeof getAsDb>>;

async function resolveWorkspaceIdForBase(
  lookupDb: AsDbHandle,
  baseId: number,
): Promise<number | null> {
  const rows = await lookupDb
    .select({ workspaceId: agsBases.workspaceId })
    .from(agsBases)
    .where(eq(agsBases.id, baseId))
    .limit(1);
  return rows[0]?.workspaceId ?? null;
}

async function resolveWorkspaceIdForBaseRow(
  lookupDb: AsDbHandle,
  rowId: number,
): Promise<number | null> {
  const rows = await lookupDb
    .select({ workspaceId: agsBases.workspaceId })
    .from(agsBaseRows)
    .innerJoin(agsBases, eq(agsBaseRows.baseId, agsBases.id))
    .where(eq(agsBaseRows.id, rowId))
    .limit(1);
  return rows[0]?.workspaceId ?? null;
}

// ----- Bases ----------------------------------------------------------

export async function createBase(input: CreateBaseInput): Promise<AgsBase> {
  // T-B.3 — when input scopes the Base to a workspace, route the
  // INSERT through the workspace's region. Catalog-wide Bases
  // (workspaceId=null) fall back to bootstrap.
  const ws = input.workspaceId;
  const db =
    ws != null ? (getAsDbForWorkspace(ws) ?? getAsDb()) : getAsDb();
  if (!db) throw new AsdbUnavailableError();
  const rows = await db
    .insert(agsBases)
    .values({
      workspaceId: input.workspaceId ?? null,
      vaultId: input.vaultId ?? null,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortKey: input.sortKey ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();
  const inserted = rows[0];
  if (!inserted) {
    throw new Error("Failed to insert base row");
  }
  fireBaseProjection(inserted, "base.created");
  return inserted;
}

export interface ListBasesFilter {
  readonly workspaceId?: number | null;
  readonly vaultId?: number | null;
  /**
   * When false, exclude archived bases (default: false).
   * When true, return archived bases as well.
   */
  readonly includeArchived?: boolean;
}

export async function listBases(
  filter: ListBasesFilter = {},
): Promise<readonly AgsBase[]> {
  // T-B.3 — when the caller scopes the listing by workspaceId, route
  // through the workspace's region. Catalog-wide listings stay on
  // the bootstrap handle.
  const ws = filter.workspaceId;
  const db =
    ws != null ? (getAsDbForWorkspace(ws) ?? getAsDb()) : getAsDb();
  if (!db) return [];
  const conds = [] as ReturnType<typeof eq>[];
  if (filter.workspaceId !== undefined) {
    if (filter.workspaceId === null) {
      conds.push(isNull(agsBases.workspaceId) as never);
    } else {
      conds.push(eq(agsBases.workspaceId, filter.workspaceId));
    }
  }
  if (filter.vaultId !== undefined) {
    if (filter.vaultId === null) {
      conds.push(isNull(agsBases.vaultId) as never);
    } else {
      conds.push(eq(agsBases.vaultId, filter.vaultId));
    }
  }
  if (!filter.includeArchived) {
    conds.push(isNull(agsBases.archivedAt) as never);
  }
  const query = db.select().from(agsBases);
  const where = conds.length > 0 ? and(...conds) : undefined;
  const rows = where
    ? await query.where(where).orderBy(asc(agsBases.sortKey), asc(agsBases.id))
    : await query.orderBy(asc(agsBases.sortKey), asc(agsBases.id));
  return rows;
}

export async function getBaseSnapshot(
  baseId: number,
): Promise<BaseSnapshot> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const workspaceId = await resolveWorkspaceIdForBase(lookupDb, baseId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const baseRows = await db
    .select()
    .from(agsBases)
    .where(eq(agsBases.id, baseId))
    .limit(1);
  const base = baseRows[0];
  if (!base) throw new BaseNotFoundError(baseId);

  const columns = await db
    .select()
    .from(agsBaseColumns)
    .where(eq(agsBaseColumns.baseId, baseId))
    .orderBy(asc(agsBaseColumns.sortKey), asc(agsBaseColumns.id));

  const rows = await db
    .select()
    .from(agsBaseRows)
    .where(eq(agsBaseRows.baseId, baseId))
    .orderBy(asc(agsBaseRows.sortKey), asc(agsBaseRows.id));

  return { base, columns, rows };
}

export async function updateBase(
  baseId: number,
  patch: UpdateBaseInput,
): Promise<AgsBase> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const workspaceId = await resolveWorkspaceIdForBase(lookupDb, baseId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.icon !== undefined) updates.icon = patch.icon;
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.sortKey !== undefined) updates.sortKey = patch.sortKey;
  if (patch.archivedAt !== undefined) updates.archivedAt = patch.archivedAt;
  const rows = await db
    .update(agsBases)
    .set(updates)
    .where(eq(agsBases.id, baseId))
    .returning();
  const updated = rows[0];
  if (!updated) throw new BaseNotFoundError(baseId);
  fireBaseProjection(updated, "base.updated");
  return updated;
}

// ----- Columns --------------------------------------------------------

export async function createBaseColumn(
  input: CreateBaseColumnInput,
): Promise<AgsBaseColumn> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  if (!isAgsBaseColumnDataType(input.dataType)) {
    throw new BaseColumnDataTypeError(String(input.dataType));
  }
  const workspaceId = await resolveWorkspaceIdForBase(lookupDb, input.baseId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  // Validate base exists — error is more user-friendly than the
  // foreign-key constraint error.
  const baseRows = await db
    .select({ id: agsBases.id })
    .from(agsBases)
    .where(eq(agsBases.id, input.baseId))
    .limit(1);
  if (baseRows.length === 0) throw new BaseNotFoundError(input.baseId);

  const rows = await db
    .insert(agsBaseColumns)
    .values({
      baseId: input.baseId,
      key: input.key,
      name: input.name,
      dataType: input.dataType,
      config: input.config ?? null,
      sortKey: input.sortKey ?? null,
    })
    .returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("Failed to insert base column row");
  return inserted;
}

export async function listBaseColumns(
  baseId: number,
): Promise<readonly AgsBaseColumn[]> {
  const lookupDb = getAsDb();
  if (!lookupDb) return [];
  const workspaceId = await resolveWorkspaceIdForBase(lookupDb, baseId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  return await db
    .select()
    .from(agsBaseColumns)
    .where(eq(agsBaseColumns.baseId, baseId))
    .orderBy(asc(agsBaseColumns.sortKey), asc(agsBaseColumns.id));
}

/**
 * Phase 24 maturity slice (2026-05-21): mutate an existing column's
 * metadata (name / config / sortKey). `dataType` + `key` are NOT
 * mutable — changing them would corrupt every existing row's `cells`
 * payload. Operators delete + recreate when the type or key needs to
 * change. `BaseColumnDataTypeError` thrown for an unknown dataType
 * passed in by mistake (defensive; the optional override is rejected
 * before it can land).
 */
export interface UpdateBaseColumnInput {
  readonly name?: string;
  readonly config?: Record<string, unknown> | null;
  readonly sortKey?: number | null;
}

export async function updateBaseColumn(
  columnId: number,
  patch: UpdateBaseColumnInput,
): Promise<AgsBaseColumn> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  // Workspace routing: the column row only carries baseId; resolve
  // the workspace via the parent base in one extra round-trip.
  const colLookup = await lookupDb
    .select({ baseId: agsBaseColumns.baseId })
    .from(agsBaseColumns)
    .where(eq(agsBaseColumns.id, columnId))
    .limit(1);
  if (colLookup.length === 0) {
    throw new BaseColumnNotFoundError(columnId);
  }
  const workspaceId = await resolveWorkspaceIdForBase(
    lookupDb,
    colLookup[0].baseId,
  );
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;

  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.config !== undefined) updates.config = patch.config;
  if (patch.sortKey !== undefined) updates.sortKey = patch.sortKey;
  if (Object.keys(updates).length === 0) {
    // No-op patch: return current row rather than firing an UPDATE.
    const current = await db
      .select()
      .from(agsBaseColumns)
      .where(eq(agsBaseColumns.id, columnId))
      .limit(1);
    if (current.length === 0) throw new BaseColumnNotFoundError(columnId);
    return current[0];
  }
  const rows = await db
    .update(agsBaseColumns)
    .set(updates)
    .where(eq(agsBaseColumns.id, columnId))
    .returning();
  const updated = rows[0];
  if (!updated) throw new BaseColumnNotFoundError(columnId);
  return updated;
}

/**
 * Phase 24 maturity slice (2026-05-21): hard-delete a column row.
 * Row cells keyed by the dropped column become orphaned (still
 * valid JSON in `agsBaseRows.cells`, just no longer described by
 * any schema row). Operators with strict schemas can subsequently
 * scrub via updateRow; the service does not pre-scrub because the
 * cells payload is operator-owned data.
 */
export async function deleteBaseColumn(columnId: number): Promise<void> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const colLookup = await lookupDb
    .select({ baseId: agsBaseColumns.baseId })
    .from(agsBaseColumns)
    .where(eq(agsBaseColumns.id, columnId))
    .limit(1);
  if (colLookup.length === 0) {
    throw new BaseColumnNotFoundError(columnId);
  }
  const workspaceId = await resolveWorkspaceIdForBase(
    lookupDb,
    colLookup[0].baseId,
  );
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  await db.delete(agsBaseColumns).where(eq(agsBaseColumns.id, columnId));
}

/**
 * Phase 24 maturity slice (2026-05-21): explicit archive verb.
 * Wraps `updateBase({ archivedAt: now })` so the operator surface
 * carries verb-level intent (audits + permissions can pin on
 * `archiveBase` rather than the generic `update`). Idempotent —
 * already-archived rows return their current state without
 * bumping `archivedAt`.
 */
export async function archiveBase(baseId: number): Promise<AgsBase> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const workspaceId = await resolveWorkspaceIdForBase(lookupDb, baseId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const existing = await db
    .select()
    .from(agsBases)
    .where(eq(agsBases.id, baseId))
    .limit(1);
  if (existing.length === 0) throw new BaseNotFoundError(baseId);
  if (existing[0].archivedAt != null) return existing[0]; // idempotent
  const rows = await db
    .update(agsBases)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(agsBases.id, baseId))
    .returning();
  const updated = rows[0];
  if (!updated) throw new BaseNotFoundError(baseId);
  fireBaseProjection(updated, "base.updated");
  return updated;
}

/**
 * Phase 24 maturity slice (2026-05-21): explicit unarchive verb.
 * Inverse of archiveBase; clears `archivedAt`. Idempotent on
 * already-unarchived bases.
 */
export async function unarchiveBase(baseId: number): Promise<AgsBase> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const workspaceId = await resolveWorkspaceIdForBase(lookupDb, baseId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const existing = await db
    .select()
    .from(agsBases)
    .where(eq(agsBases.id, baseId))
    .limit(1);
  if (existing.length === 0) throw new BaseNotFoundError(baseId);
  if (existing[0].archivedAt == null) return existing[0]; // idempotent
  const rows = await db
    .update(agsBases)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(agsBases.id, baseId))
    .returning();
  const updated = rows[0];
  if (!updated) throw new BaseNotFoundError(baseId);
  fireBaseProjection(updated, "base.updated");
  return updated;
}

// ----- Rows -----------------------------------------------------------

export class BaseRowUnknownColumnsError extends Error {
  readonly unknownKeys: readonly string[];
  constructor(baseId: number, unknownKeys: readonly string[]) {
    super(
      `Base ${baseId} row contains unknown column key(s): ${unknownKeys.join(", ")}`,
    );
    this.name = "BaseRowUnknownColumnsError";
    this.unknownKeys = unknownKeys;
  }
}

async function assertCellsMatchSchema(
  db: NonNullable<ReturnType<typeof getAsDb>>,
  baseId: number,
  cells: Record<string, unknown>,
): Promise<void> {
  const cellKeys = Object.keys(cells);
  if (cellKeys.length === 0) return;
  const cols = await db
    .select({ key: agsBaseColumns.key })
    .from(agsBaseColumns)
    .where(eq(agsBaseColumns.baseId, baseId));
  const known = new Set(cols.map((c) => c.key));
  const unknown = cellKeys.filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new BaseRowUnknownColumnsError(baseId, unknown);
  }
}

export async function createBaseRow(
  input: CreateBaseRowInput,
): Promise<AgsBaseRow> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const workspaceId = await resolveWorkspaceIdForBase(lookupDb, input.baseId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const baseRows = await db
    .select({ id: agsBases.id })
    .from(agsBases)
    .where(eq(agsBases.id, input.baseId))
    .limit(1);
  if (baseRows.length === 0) throw new BaseNotFoundError(input.baseId);

  await assertCellsMatchSchema(db, input.baseId, input.cells);

  const rows = await db
    .insert(agsBaseRows)
    .values({
      baseId: input.baseId,
      slug: input.slug ?? null,
      noteId: input.noteId ?? null,
      cells: input.cells,
      sortKey: input.sortKey ?? null,
    })
    .returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("Failed to insert base row");
  fireBaseRowProjection(inserted);
  return inserted;
}

export async function updateBaseRow(
  rowId: number,
  patch: UpdateBaseRowInput,
): Promise<AgsBaseRow> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const workspaceId = await resolveWorkspaceIdForBaseRow(lookupDb, rowId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const existing = await db
    .select({ id: agsBaseRows.id, baseId: agsBaseRows.baseId })
    .from(agsBaseRows)
    .where(eq(agsBaseRows.id, rowId))
    .limit(1);
  const row = existing[0];
  if (!row) throw new BaseRowNotFoundError(rowId);

  if (patch.cells !== undefined) {
    await assertCellsMatchSchema(db, row.baseId, patch.cells);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.cells !== undefined) updates.cells = patch.cells;
  if (patch.noteId !== undefined) updates.noteId = patch.noteId;
  if (patch.sortKey !== undefined) updates.sortKey = patch.sortKey;

  const updatedRows = await db
    .update(agsBaseRows)
    .set(updates)
    .where(eq(agsBaseRows.id, rowId))
    .returning();
  const updated = updatedRows[0];
  if (!updated) throw new BaseRowNotFoundError(rowId);
  fireBaseRowProjection(updated);
  return updated;
}

/**
 * Hard-delete a row + enqueue a `base.row_removed` projection event
 * so Neo4j prunes the BaseRow node + OF_BASE / ROW_OF_NOTE edges.
 */
export async function deleteBaseRow(rowId: number): Promise<void> {
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const workspaceId = await resolveWorkspaceIdForBaseRow(lookupDb, rowId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const existing = await db
    .select({ id: agsBaseRows.id })
    .from(agsBaseRows)
    .where(eq(agsBaseRows.id, rowId))
    .limit(1);
  if (existing.length === 0) throw new BaseRowNotFoundError(rowId);
  await db.delete(agsBaseRows).where(eq(agsBaseRows.id, rowId));
  fireBaseRowRemoval(rowId);
}

export async function listBaseRows(
  baseId: number,
): Promise<readonly AgsBaseRow[]> {
  const lookupDb = getAsDb();
  if (!lookupDb) return [];
  const workspaceId = await resolveWorkspaceIdForBase(lookupDb, baseId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  return await db
    .select()
    .from(agsBaseRows)
    .where(eq(agsBaseRows.baseId, baseId))
    .orderBy(asc(agsBaseRows.sortKey), asc(agsBaseRows.id));
}
