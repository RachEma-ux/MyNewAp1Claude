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

import { getAsDb } from "../../db/connection.js";
import {
  agsCanvases,
  agsCanvasNodes,
  agsCanvasEdges,
} from "../../../../drizzle/tables/agent-studio-canvas.js";
import {
  CanvasNodeKindError,
  CanvasNotFoundError,
  isCanvasNodeKind,
  type CanvasEdgeRecord,
  type CanvasNodeRecord,
  type CanvasRecord,
  type CanvasSnapshot,
  type CreateCanvasEdgeInput,
  type CreateCanvasInput,
  type CreateCanvasNodeInput,
} from "./types.js";

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
  const db = getAsDb();
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
  const db = getAsDb();
  if (!db) return null;
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
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(agsCanvases)
    .where(eq(agsCanvases.vaultId, vaultId))
    .orderBy(asc(agsCanvases.updatedAt));
  return rows.map((r) => rowToCanvas(r as Record<string, unknown>));
}

export async function createCanvasNode(
  input: CreateCanvasNodeInput,
): Promise<CanvasNodeRecord> {
  if (!isCanvasNodeKind(input.kind)) {
    throw new CanvasNodeKindError(input.kind);
  }
  const db = getAsDb();
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
  return rowToNode(inserted as Record<string, unknown>);
}

export async function createCanvasEdge(
  input: CreateCanvasEdgeInput,
): Promise<CanvasEdgeRecord> {
  const db = getAsDb();
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
  const canvas = await getCanvasById(canvasId);
  if (!canvas) throw new CanvasNotFoundError(canvasId);
  const db = getAsDb();
  if (!db) return { canvas, nodes: [], edges: [] };
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
  const db = getAsDb();
  if (!db) return [];
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
