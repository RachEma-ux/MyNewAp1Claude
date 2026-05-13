/**
 * Canvas projection helper — V1+ Phase 17-β.
 *
 * Phase 17-α (#752) shipped the Canvas data model + service +
 * `listNoteReferencesForCanvas()` (the pure source-of-truth side).
 * The β slice closes the projection side: turning a canvas's
 * `note_ref` nodes into graph projection writes that the existing
 * `applyProjectionJob()` path can apply.
 *
 * Projection shape:
 *   - Canvas       (typeKey="Canvas", id=`canvas:<canvasId>`)
 *   - CanvasNode   (typeKey="CanvasNode", id=`canvas_node:<nodeId>`)
 *   - CONTAINS_CANVAS_NODE  (Canvas → CanvasNode)
 *   - CANVAS_REFERENCES_NOTE  (CanvasNode → Note)
 *
 * The Canvas + CanvasNode nodes are bundled with the edge to keep
 * the projection self-consistent — without them, the
 * CANVAS_REFERENCES_NOTE edge would dangle on its source side.
 * Bundling matches the `note.created` pattern in sync-worker.ts
 * (which bundles Note + NoteVersion + VERSION_OF together).
 *
 * Idempotency:
 *   - `upsert_node` against the same `(typeKey, id)` is a no-op on
 *     the projection backend; emitting the Canvas + CanvasNode in
 *     every event is safe (the projection writer dedups internally).
 *   - The CANVAS_REFERENCES_NOTE edge id is deterministic
 *     (`canvas_references_note:<canvasNodeId>`) so re-emission
 *     updates rather than duplicates.
 *
 * Removal:
 *   - `buildCanvasReferenceRemoval()` returns a `delete_edge` write
 *     plus a `delete_node` for the CanvasNode. The Canvas node is
 *     left in place (other CanvasNodes may still reference it; the
 *     Canvas-deletion event is a separate concern, out of scope for
 *     17-β).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - The canvas service does NOT call `applyProjectionJob` directly.
 *     This module returns the pure write list; the existing
 *     `ProjectionSyncWorker` handles the I/O. Graph mutations still
 *     route through GraphRepository.
 *   - No `credential-resolver` import. No raw `process.env.*_API_KEY`.
 *   - No neo4j-driver import. Source-scan tested.
 */

import type {
  ProjectionWrite,
  ProvenanceFields,
} from "../graph/repository/index.js";

/** Provenance helper — bundles the lineageStatus + governanceStatus
 *  defaults so callers don't repeat them. */
function provenance(
  sourceType: string,
  sourceId: string,
  lineageStatus: ProvenanceFields["lineageStatus"],
): ProvenanceFields {
  return {
    sourceType,
    sourceId,
    lineageStatus,
    governanceStatus: "active",
  };
}

export interface CanvasReferenceInput {
  readonly canvasId: number;
  readonly canvasNodeId: number;
  readonly referencedNoteId: number;
}

/**
 * Build the projection writes for a single canvas note-reference
 * link. Emits Canvas + CanvasNode + CONTAINS_CANVAS_NODE +
 * CANVAS_REFERENCES_NOTE. Pure function — no I/O.
 */
export function buildCanvasReferenceProjection(
  input: CanvasReferenceInput,
): ProjectionWrite[] {
  const canvasId = `canvas:${input.canvasId}`;
  const canvasNodeId = `canvas_node:${input.canvasNodeId}`;
  const noteId = `note:${input.referencedNoteId}`;

  return [
    {
      kind: "upsert_node",
      node: {
        typeKey: "Canvas",
        id: canvasId,
        sourceId: String(input.canvasId),
        properties: {},
        provenance: provenance(
          "canvas",
          String(input.canvasId),
          "asserted",
        ),
      },
    },
    {
      kind: "upsert_node",
      node: {
        typeKey: "CanvasNode",
        id: canvasNodeId,
        sourceId: String(input.canvasNodeId),
        properties: { kind: "note_ref" },
        provenance: provenance(
          "canvas_node",
          String(input.canvasNodeId),
          "asserted",
        ),
      },
    },
    {
      kind: "upsert_edge",
      edge: {
        typeKey: "CONTAINS_CANVAS_NODE",
        id: `contains_canvas_node:${input.canvasNodeId}`,
        sourceNode: { typeKey: "Canvas", id: canvasId },
        targetNode: { typeKey: "CanvasNode", id: canvasNodeId },
        properties: {},
        provenance: provenance(
          "canvas",
          String(input.canvasId),
          "derived",
        ),
      },
    },
    {
      kind: "upsert_edge",
      edge: {
        typeKey: "CANVAS_REFERENCES_NOTE",
        id: `canvas_references_note:${input.canvasNodeId}`,
        sourceNode: { typeKey: "CanvasNode", id: canvasNodeId },
        targetNode: { typeKey: "Note", id: noteId },
        properties: {},
        provenance: provenance(
          "canvas_node",
          String(input.canvasNodeId),
          "asserted",
        ),
      },
    },
  ];
}

export interface CanvasReferenceRemovalInput {
  readonly canvasNodeId: number;
}

/**
 * Build the projection writes to remove a canvas reference. Deletes
 * the CANVAS_REFERENCES_NOTE edge + the CONTAINS_CANVAS_NODE edge +
 * the CanvasNode node. The Canvas node is preserved (other
 * CanvasNodes may still reference it).
 */
export function buildCanvasReferenceRemoval(
  input: CanvasReferenceRemovalInput,
): ProjectionWrite[] {
  return [
    {
      kind: "delete_edge",
      edge: {
        typeKey: "CANVAS_REFERENCES_NOTE",
        id: `canvas_references_note:${input.canvasNodeId}`,
        sourceNode: { typeKey: "CanvasNode", id: `canvas_node:${input.canvasNodeId}` },
        targetNode: { typeKey: "Note", id: "" },
        properties: {},
        provenance: provenance(
          "canvas_node",
          String(input.canvasNodeId),
          "asserted",
        ),
      },
    },
    {
      kind: "delete_edge",
      edge: {
        typeKey: "CONTAINS_CANVAS_NODE",
        id: `contains_canvas_node:${input.canvasNodeId}`,
        sourceNode: { typeKey: "Canvas", id: "" },
        targetNode: { typeKey: "CanvasNode", id: `canvas_node:${input.canvasNodeId}` },
        properties: {},
        provenance: provenance(
          "canvas_node",
          String(input.canvasNodeId),
          "derived",
        ),
      },
    },
    {
      kind: "delete_node",
      node: {
        typeKey: "CanvasNode",
        id: `canvas_node:${input.canvasNodeId}`,
        properties: {},
        provenance: provenance(
          "canvas_node",
          String(input.canvasNodeId),
          "asserted",
        ),
      },
    },
  ];
}

export interface BuildAllCanvasReferencesInput {
  readonly canvasId: number;
  readonly references: ReadonlyArray<{ nodeId: number; noteId: number }>;
}

/**
 * Build the full projection write list for every note-reference in a
 * canvas. Composes `buildCanvasReferenceProjection` over the list
 * returned by `listNoteReferencesForCanvas()`. Pure function — no I/O.
 */
export function buildAllCanvasReferenceProjections(
  input: BuildAllCanvasReferencesInput,
): ProjectionWrite[] {
  const writes: ProjectionWrite[] = [];
  for (const ref of input.references) {
    writes.push(
      ...buildCanvasReferenceProjection({
        canvasId: input.canvasId,
        canvasNodeId: ref.nodeId,
        referencedNoteId: ref.noteId,
      }),
    );
  }
  return writes;
}
