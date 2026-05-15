/**
 * Canvas service — CRUD entry points for V1+ Phase 17-α first slice.
 *
 * Composes:
 *   - `createCanvas` — top-level container
 *   - `createCanvasNode` — adds a node (note_ref / embedded_query /
 *     free_text / image_ref)
 *   - `createCanvasEdge` — links two canvas nodes
 *   - `getCanvasSnapshot` — pulls the canvas + all nodes/edges in
 *     one call (the UI consumes this on canvas open)
 *   - `listCanvasesByVault` — operator browser surface
 *
 * Hard-rule compliance:
 *   - No graph mutation here. The Canvas → graph projection edge
 *     (`CANVAS_REFERENCES_NOTE`) is emitted by a separate
 *     projection step (Phase 17-β) — this PR ships the data
 *     model + service.
 *   - No `process.env.*_API_KEY` reads.
 *   - No `neo4j-driver` imports.
 *   - GraphRepository is NOT touched — Canvas reads are
 *     ASDB-only.
 */

import { and, asc, eq } from "drizzle-orm";

import { getAsDb, getAsDbForWorkspace } from "../../db/connection.js";
import {
  agsCanvases,
  agsCanvasNodes,
  agsCanvasEdges,
} from "../../../../drizzle/tables/agent-studio-canvas.js";
import { agsVaults } from "../../../../drizzle/tables/agent-studio-vault.js";
import {
  CanvasNodeKindError,
  CanvasNodeNotFoundError,
  CanvasNotFoundError,
  isCanvasNodeKind,
  type CanvasEdgeRecord,
  type CanvasNodeRecord,
  type CanvasRecord,
  type CanvasSnapshot,
  type CreateCanvasEdgeInput,
  type CreateCanvasInput,
  type CreateCanvasNodeInput,
  type UpdateCanvasNodeInput,
} from "./types.js";
import { recordCanvasProjectionEvent } from "./projection-events-sink.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB unavailable for canvas operation");
    this.name = "AsdbUnavailableError";
  }
}

function rowToCanvas(r: Record<string, unknown>): CanvasRecord {
  return {
    id: Number(r.id),
    vaultId: Number(r.vaultId),
    slug: String(r.slug),
    title: String(r.title),
    description: (r.description as string | null) ?? null,
    settings: (r.settings as Record<string, unknown> | null) ?? null,
    archivedAt: (r.archivedAt as Date | null) ?? null,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  };
}

function rowToNode(r: Record<string, unknown>): CanvasNodeRecord {
  return {
    id: Number(r.id),
    canvasId: Number(r.canvasId),
    kind: r.kind as CanvasNodeRecord["kind"],
    referencedNoteId:
      r.referencedNoteId == null ? null : Number(r.referencedNoteId),
    x: Number(r.x ?? 0),
    y: Number(r.y ?? 0),
    width: Number(r.width ?? 200),
    height: Number(r.height ?? 120),
    data: (r.data as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  };
}

function rowToEdge(r: Record<string, unknown>): CanvasEdgeRecord {
  return {
    id: Number(r.id),
    canvasId: Number(r.canvasId),
    sourceCanvasNodeId: Number(r.sourceCanvasNodeId),
    targetCanvasNodeId: Number(r.targetCanvasNodeId),
    relationshipKind: String(r.relationshipKind ?? "references"),
    data: (r.data as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt as Date,
  };
}

export async function createCanvas(
  input: CreateCanvasInput,
): Promise<CanvasRecord> {
  // V1+ MR-3 twenty-fifth batch (PR-V1-93): split-handle pattern with
  // a vault→workspace lookup. The Canvas table itself doesn't carry
  // workspaceId, but its parent vault does (agsVaults.workspaceId).
  // We SELECT-by-id to discover the vault's workspaceId (Cat C
  // bootstrap lookup), then route the INSERT through
  // getAsDbForWorkspace. If the vault row is missing OR the column
  // is null (legacy rows), we fall back to getAsDb() — the FK
  // constraint on the INSERT will surface the missing-vault error.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const lookup = await lookupDb
    .select({ workspaceId: agsVaults.workspaceId })
    .from(agsVaults)
    .where(eq(agsVaults.id, input.vaultId))
    .limit(1);
  const workspaceId = lookup[0]?.workspaceId ?? null;
  const db =
    workspaceId != null ? getAsDbForWorkspace(workspaceId) : lookupDb;
  if (!db) throw new AsdbUnavailableError();
  const [inserted] = await db
    .insert(agsCanvases)
    .values({
      vaultId: input.vaultId,
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      createdByUserId: input.createdByUserId ?? null,
      settings: input.settings ?? null,
    })
    .returning();
  if (!inserted) throw new Error("Failed to insert canvas");
  return rowToCanvas(inserted as Record<string, unknown>);
}

export async function getCanvasById(
  canvasId: number,
): Promise<CanvasRecord | null> {
  // V1+ MR-3 sixty-eighth batch (PR-V1-138): Path-A read consumer
  // reuses the existing resolveWorkspaceIdForCanvas helper. The
  // SELECT now routes to the home region under Phase-2 via
  // getAsDbForWorkspace. Returns null when the canvas row doesn't
  // exist (helper returns null → fall back to lookupDb, then the
  // SELECT below returns empty rows).
  const lookupDb = getAsDb();
  if (!lookupDb) return null;
  const workspaceId = await resolveWorkspaceIdForCanvas(lookupDb, canvasId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const rows = await db
    .select()
    .from(agsCanvases)
    .where(eq(agsCanvases.id, canvasId))
    .limit(1);
  return rows[0] ? rowToCanvas(rows[0] as Record<string, unknown>) : null;
}

export async function listCanvasesByVault(
  vaultId: number,
): Promise<ReadonlyArray<CanvasRecord>> {
  // V1+ MR-3 sixty-eighth batch (PR-V1-138): Path-A read consumer.
  // vaultId → agsVaults.workspaceId in a single pre-projection
  // SELECT, then route the SELECT on agsCanvases to the home region.
  const lookupDb = getAsDb();
  if (!lookupDb) return [];
  const wsRows = await lookupDb
    .select({ workspaceId: agsVaults.workspaceId })
    .from(agsVaults)
    .where(eq(agsVaults.id, vaultId))
    .limit(1);
  const db =
    wsRows.length > 0
      ? (getAsDbForWorkspace(wsRows[0].workspaceId) ?? lookupDb)
      : lookupDb;
  const rows = await db
    .select()
    .from(agsCanvases)
    .where(eq(agsCanvases.vaultId, vaultId))
    .orderBy(asc(agsCanvases.updatedAt));
  return rows.map((r) => rowToCanvas(r as Record<string, unknown>));
}

/**
 * Internal helper — resolve the workspaceId for a given canvasId by
 * JOIN-ing agsCanvases × agsVaults. Returns null when the canvas
 * row is missing OR the parent vault's workspaceId column is null
 * (legacy rows). Used by createCanvasNode + createCanvasEdge so the
 * routing handle can be chosen consistently. Single Cat C bootstrap
 * SELECT — workspaceId is not in scope on the input.
 */
async function resolveWorkspaceIdForCanvas(
  lookupDb: NonNullable<ReturnType<typeof getAsDb>>,
  canvasId: number,
): Promise<number | null> {
  const rows = await lookupDb
    .select({ workspaceId: agsVaults.workspaceId })
    .from(agsCanvases)
    .innerJoin(agsVaults, eq(agsCanvases.vaultId, agsVaults.id))
    .where(eq(agsCanvases.id, canvasId))
    .limit(1);
  return rows[0]?.workspaceId ?? null;
}

export async function createCanvasNode(
  input: CreateCanvasNodeInput,
): Promise<CanvasNodeRecord> {
  if (!isCanvasNodeKind(input.kind)) {
    throw new CanvasNodeKindError(input.kind);
  }
  // V1+ MR-3 twenty-sixth batch (PR-V1-94): cross-table split-handle.
  // canvas→vault→workspace JOIN resolves the routing handle. When
  // the chain returns null (vault missing OR vault.workspaceId IS
  // NULL), fall back to the default lookupDb so the FK constraint
  // on the INSERT surfaces the missing-canvas error.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const workspaceId = await resolveWorkspaceIdForCanvas(lookupDb, input.canvasId);
  const db =
    workspaceId != null ? getAsDbForWorkspace(workspaceId) : lookupDb;
  if (!db) throw new AsdbUnavailableError();
  const [inserted] = await db
    .insert(agsCanvasNodes)
    .values({
      canvasId: input.canvasId,
      kind: input.kind,
      referencedNoteId: input.referencedNoteId ?? null,
      x: input.x ?? 0,
      y: input.y ?? 0,
      width: input.width ?? 200,
      height: input.height ?? 120,
      data: input.data ?? null,
    })
    .returning();
  if (!inserted) throw new Error("Failed to insert canvas node");
  const node = rowToNode(inserted as Record<string, unknown>);
  // V1+ 17-γ-canvas-events: emit the projection event when this
  // node references a vault note. No-op when no sink is registered
  // (default state — preserves existing behavior). Errors are
  // caught inside recordCanvasProjectionEvent so a faulty sink
  // never breaks the mutation path.
  if (node.referencedNoteId != null) {
    await recordCanvasProjectionEvent({
      kind: "canvas.note_reference_changed",
      payload: {
        canvasId: node.canvasId,
        canvasNodeId: node.id,
        referencedNoteId: node.referencedNoteId,
      },
    });
  }
  return node;
}

/**
 * V1+ Phase 17-γ follow-up (PR-V1-169): update a canvas node.
 *
 * Routes through the same canvas→vault→workspace split-handle that
 * `createCanvasNode` uses. Emits the appropriate projection event
 * when `referencedNoteId` changes:
 *   - `null → noteX`           → `note_reference_changed`
 *   - `noteX → noteY` (Y≠X)    → `note_reference_changed`
 *   - `noteX → null`           → `note_reference_removed` (carries
 *                                priorReferencedNoteId = X)
 *   - `null → null` / `X → X`  → no event
 *
 * Throws `CanvasNodeNotFoundError` when the node row is missing.
 * Throws `CanvasNodeKindError` when an invalid `kind` is supplied.
 */
export async function updateCanvasNode(
  input: UpdateCanvasNodeInput,
): Promise<CanvasNodeRecord> {
  if (input.kind !== undefined && !isCanvasNodeKind(input.kind)) {
    throw new CanvasNodeKindError(input.kind);
  }
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  // First fetch the existing row so we know the canvasId for the
  // workspace routing and the prior referencedNoteId for the
  // event-payload diff. Single query.
  const priorRows = await lookupDb
    .select()
    .from(agsCanvasNodes)
    .where(eq(agsCanvasNodes.id, input.nodeId))
    .limit(1);
  if (!priorRows[0]) throw new CanvasNodeNotFoundError(input.nodeId);
  const prior = rowToNode(priorRows[0] as Record<string, unknown>);
  const workspaceId = await resolveWorkspaceIdForCanvas(lookupDb, prior.canvasId);
  const db =
    workspaceId != null ? getAsDbForWorkspace(workspaceId) : lookupDb;
  if (!db) throw new AsdbUnavailableError();

  // Build the partial UPDATE — only set fields the caller supplied.
  // `referencedNoteId: undefined` means "leave alone"; `null` means
  // "clear" (the column is nullable).
  const patch: Record<string, unknown> = {};
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.referencedNoteId !== undefined)
    patch.referencedNoteId = input.referencedNoteId;
  if (input.x !== undefined) patch.x = input.x;
  if (input.y !== undefined) patch.y = input.y;
  if (input.width !== undefined) patch.width = input.width;
  if (input.height !== undefined) patch.height = input.height;
  if (input.data !== undefined) patch.data = input.data;
  if (Object.keys(patch).length === 0) {
    // No-op update: return the prior row without round-tripping.
    return prior;
  }

  const [updated] = await db
    .update(agsCanvasNodes)
    .set(patch)
    .where(eq(agsCanvasNodes.id, input.nodeId))
    .returning();
  if (!updated) throw new CanvasNodeNotFoundError(input.nodeId);
  const node = rowToNode(updated as Record<string, unknown>);

  // Emit projection event when the note reference actually changed.
  // No-op when no sink is registered (default state).
  if (input.referencedNoteId !== undefined) {
    const before = prior.referencedNoteId;
    const after = node.referencedNoteId;
    if (before !== after) {
      if (after != null) {
        await recordCanvasProjectionEvent({
          kind: "canvas.note_reference_changed",
          payload: {
            canvasId: node.canvasId,
            canvasNodeId: node.id,
            referencedNoteId: after,
          },
        });
      } else if (before != null) {
        await recordCanvasProjectionEvent({
          kind: "canvas.note_reference_removed",
          payload: {
            canvasId: node.canvasId,
            canvasNodeId: node.id,
            priorReferencedNoteId: before,
          },
        });
      }
    }
  }
  return node;
}

/**
 * V1+ Phase 17-γ follow-up (PR-V1-169): delete a canvas node.
 *
 * Routes via the canvas→vault→workspace split-handle. When the
 * deleted node carried a `referencedNoteId`, emits
 * `canvas.note_reference_removed` with the prior id so the 17-γ
 * sink can unlink the projected edge.
 *
 * Returns `true` when a row was deleted, `false` when no row
 * matched (idempotent — `deleteCanvasNode(nodeId)` after the row
 * has already been deleted is not an error).
 */
export async function deleteCanvasNode(nodeId: number): Promise<boolean> {
  const lookupDb = getAsDb();
  if (!lookupDb) return false;
  const priorRows = await lookupDb
    .select()
    .from(agsCanvasNodes)
    .where(eq(agsCanvasNodes.id, nodeId))
    .limit(1);
  if (!priorRows[0]) return false;
  const prior = rowToNode(priorRows[0] as Record<string, unknown>);
  const workspaceId = await resolveWorkspaceIdForCanvas(lookupDb, prior.canvasId);
  const db =
    workspaceId != null ? getAsDbForWorkspace(workspaceId) : lookupDb;
  if (!db) return false;
  await db.delete(agsCanvasNodes).where(eq(agsCanvasNodes.id, nodeId));
  if (prior.referencedNoteId != null) {
    await recordCanvasProjectionEvent({
      kind: "canvas.note_reference_removed",
      payload: {
        canvasId: prior.canvasId,
        canvasNodeId: prior.id,
        priorReferencedNoteId: prior.referencedNoteId,
      },
    });
  }
  return true;
}

export async function createCanvasEdge(
  input: CreateCanvasEdgeInput,
): Promise<CanvasEdgeRecord> {
  // V1+ MR-3 twenty-sixth batch (PR-V1-94): cross-table split-handle
  // (same shape as createCanvasNode above).
  const lookupDb = getAsDb();
  if (!lookupDb) throw new AsdbUnavailableError();
  const workspaceId = await resolveWorkspaceIdForCanvas(lookupDb, input.canvasId);
  const db =
    workspaceId != null ? getAsDbForWorkspace(workspaceId) : lookupDb;
  if (!db) throw new AsdbUnavailableError();
  const [inserted] = await db
    .insert(agsCanvasEdges)
    .values({
      canvasId: input.canvasId,
      sourceCanvasNodeId: input.sourceCanvasNodeId,
      targetCanvasNodeId: input.targetCanvasNodeId,
      relationshipKind: input.relationshipKind ?? "references",
      data: input.data ?? null,
    })
    .returning();
  if (!inserted) throw new Error("Failed to insert canvas edge");
  return rowToEdge(inserted as Record<string, unknown>);
}

/**
 * Operator-load entrypoint — returns the canvas + all nodes/edges
 * in one ASDB round-trip. The UI consumes this on canvas open.
 */
export async function getCanvasSnapshot(
  canvasId: number,
): Promise<CanvasSnapshot> {
  // V1+ MR-3 sixty-eighth batch (PR-V1-138): Path-A read consumer
  // via resolveWorkspaceIdForCanvas. The nodes + edges SELECTs share
  // a single routed conn so the snapshot is consistent under Phase-2.
  const canvas = await getCanvasById(canvasId);
  if (!canvas) throw new CanvasNotFoundError(canvasId);
  const lookupDb = getAsDb();
  if (!lookupDb) return { canvas, nodes: [], edges: [] };
  const workspaceId = await resolveWorkspaceIdForCanvas(lookupDb, canvasId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const nodeRows = await db
    .select()
    .from(agsCanvasNodes)
    .where(eq(agsCanvasNodes.canvasId, canvasId));
  const edgeRows = await db
    .select()
    .from(agsCanvasEdges)
    .where(eq(agsCanvasEdges.canvasId, canvasId));
  return {
    canvas,
    nodes: nodeRows.map((r) => rowToNode(r as Record<string, unknown>)),
    edges: edgeRows.map((r) => rowToEdge(r as Record<string, unknown>)),
  };
}

/**
 * Identifies note references that need to project as
 * `CANVAS_REFERENCES_NOTE` edges into the graph backend. The actual
 * projection happens via the existing projection-sync worker
 * (Phase 17-β); this helper is the pure source-of-truth side.
 */
export async function listNoteReferencesForCanvas(
  canvasId: number,
): Promise<ReadonlyArray<{ nodeId: number; noteId: number }>> {
  // V1+ MR-3 sixty-eighth batch (PR-V1-138): Path-A read consumer
  // via resolveWorkspaceIdForCanvas.
  const lookupDb = getAsDb();
  if (!lookupDb) return [];
  const workspaceId = await resolveWorkspaceIdForCanvas(lookupDb, canvasId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const rows = await db
    .select({
      nodeId: agsCanvasNodes.id,
      noteId: agsCanvasNodes.referencedNoteId,
    })
    .from(agsCanvasNodes)
    .where(
      and(
        eq(agsCanvasNodes.canvasId, canvasId),
        eq(agsCanvasNodes.kind, "note_ref"),
      ),
    );
  return rows
    .filter((r): r is { nodeId: number; noteId: number } => r.noteId != null)
    .map((r) => ({ nodeId: Number(r.nodeId), noteId: Number(r.noteId) }));
}
