/**
 * Canvas tRPC router — V1+ Phase 17 closure. PR-V1-170.
 *
 * Mounted at `agentStudio.canvas.*`. Exposes the existing
 * canvas-service CRUD ops (#752 / #844-#845) + the new update/delete
 * hooks (#920) so the React UI + operator tools can finally reach
 * Canvas features over tRPC. Prior to this slice, canvas-service had
 * no external consumers — the service has been hermetic since
 * Phase 17-α.
 *
 * Closed taxonomies are Zod-enforced at the boundary:
 *   - `CANVAS_NODE_KINDS` (4-value: note_ref / embedded_query /
 *     free_text / image_ref).
 *
 * Hard-rule compliance:
 *   - All mutations route through canvas-service (no direct
 *     agsCanvases / agsCanvasNodes / agsCanvasEdges writes from
 *     the router). The service handles the canvas→vault→workspace
 *     split-handle + projection event emission.
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` /
 *     `neo4j-driver` imports.
 *   - Reads: `protectedProcedure` (any logged-in user in the
 *     workspace can read).
 *   - Writes: `protectedProcedure` for now — Canvas governance is
 *     enforced at the vault/workspace boundary, same as other
 *     vault operations. A future slice can tighten to `governedProcedure`
 *     if Canvas mutations need approval gates.
 */

import { z } from "zod";

import { protectedProcedure, router } from "../../../_core/trpc.js";
import {
  CANVAS_NODE_KINDS,
  createCanvas,
  createCanvasEdge,
  createCanvasNode,
  deleteCanvasNode,
  getCanvasById,
  getCanvasSnapshot,
  listCanvasesByVault,
  listNoteReferencesForCanvas,
  updateCanvasNode,
} from "./public-api.js";

const CanvasNodeKindSchema = z.enum(CANVAS_NODE_KINDS);

const CreateCanvasInputSchema = z.object({
  vaultId: z.number().int().positive(),
  slug: z.string().min(1).max(255),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  createdByUserId: z.number().int().positive().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const CreateCanvasNodeInputSchema = z.object({
  canvasId: z.number().int().positive(),
  kind: CanvasNodeKindSchema,
  referencedNoteId: z.number().int().positive().nullable().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const UpdateCanvasNodeInputSchema = z.object({
  nodeId: z.number().int().positive(),
  kind: CanvasNodeKindSchema.optional(),
  referencedNoteId: z.number().int().positive().nullable().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
});

const CreateCanvasEdgeInputSchema = z.object({
  canvasId: z.number().int().positive(),
  sourceCanvasNodeId: z.number().int().positive(),
  targetCanvasNodeId: z.number().int().positive(),
  relationshipKind: z.string().min(1).max(80).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const canvasRouter = router({
  /**
   * Get a canvas by id. Returns null when missing (404-shaped at
   * the UI layer).
   */
  get: protectedProcedure
    .input(z.object({ canvasId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getCanvasById(input.canvasId);
    }),

  /**
   * List canvases inside a vault.
   */
  listByVault: protectedProcedure
    .input(z.object({ vaultId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return listCanvasesByVault(input.vaultId);
    }),

  /**
   * Get the canvas + all nodes + all edges in a single round-trip.
   * The UI calls this on canvas open.
   */
  getSnapshot: protectedProcedure
    .input(z.object({ canvasId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getCanvasSnapshot(input.canvasId);
    }),

  /**
   * List the canvas's note-reference edges. Used by the Canvas UI
   * to highlight note links + by the projection diff path.
   */
  listNoteReferences: protectedProcedure
    .input(z.object({ canvasId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return listNoteReferencesForCanvas(input.canvasId);
    }),

  /**
   * Create a new canvas inside a vault.
   */
  create: protectedProcedure
    .input(CreateCanvasInputSchema)
    .mutation(async ({ input }) => {
      return createCanvas({
        vaultId: input.vaultId,
        slug: input.slug,
        title: input.title,
        description: input.description,
        createdByUserId: input.createdByUserId,
        settings: input.settings,
      });
    }),

  /**
   * Add a node to a canvas. Emits
   * `canvas.note_reference_changed` when `referencedNoteId` is
   * supplied (existing 17-γ caller).
   */
  createNode: protectedProcedure
    .input(CreateCanvasNodeInputSchema)
    .mutation(async ({ input }) => {
      return createCanvasNode({
        canvasId: input.canvasId,
        kind: input.kind,
        referencedNoteId: input.referencedNoteId,
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        data: input.data,
      });
    }),

  /**
   * V1+ PR-V1-169 surface — update an existing canvas node. Emits
   * `_changed` / `_removed` events as the reference diff demands.
   */
  updateNode: protectedProcedure
    .input(UpdateCanvasNodeInputSchema)
    .mutation(async ({ input }) => {
      return updateCanvasNode({
        nodeId: input.nodeId,
        kind: input.kind,
        referencedNoteId: input.referencedNoteId,
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        data: input.data,
      });
    }),

  /**
   * V1+ PR-V1-169 surface — delete a canvas node. Idempotent;
   * emits `_removed` when the deleted node carried a referencedNoteId.
   * Returns `{ removed: boolean }`.
   */
  deleteNode: protectedProcedure
    .input(z.object({ nodeId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return { removed: await deleteCanvasNode(input.nodeId) };
    }),

  /**
   * Create an edge between two canvas nodes (NOTE: a canvas edge is
   * a UI-layer link, NOT the graph projection edge — the projection
   * edge is `CANVAS_REFERENCES_NOTE` emitted by `createCanvasNode`).
   */
  createEdge: protectedProcedure
    .input(CreateCanvasEdgeInputSchema)
    .mutation(async ({ input }) => {
      return createCanvasEdge({
        canvasId: input.canvasId,
        sourceCanvasNodeId: input.sourceCanvasNodeId,
        targetCanvasNodeId: input.targetCanvasNodeId,
        relationshipKind: input.relationshipKind,
        data: input.data,
      });
    }),
});
