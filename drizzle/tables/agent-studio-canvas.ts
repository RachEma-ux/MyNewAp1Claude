/**
 * Agent Studio Native Graph Workspace — Canvas tables.
 *
 * V1+ Phase 17-α first slice. ASDB-resident.
 *
 * Canvas is the free-form spatial editor surface — a 2D plane with
 * nodes (notes / embedded queries / free-text) and edges. Canvas
 * COEXISTS with the graph projection: a Canvas node that references
 * a vault note projects into the typed graph backend as a
 * `CANVAS_REFERENCES_NOTE` edge (Phase 17-α acceptance criterion #2).
 * The Canvas tables themselves never carry graph facts — those live
 * in `ags_graph_nodes` / `ags_graph_edges` per the Postgres-SoT rule.
 *
 * Design:
 *   - `agsCanvases` — top-level container. One per (vault, slug).
 *   - `agsCanvasNodes` — spatial node entries with (x, y, width,
 *     height, kind, dataRef). `kind` is the closed taxonomy:
 *     `note_ref` | `embedded_query` | `free_text` | `image_ref`.
 *   - `agsCanvasEdges` — relationships between canvas nodes.
 *     `relationshipKind` is free-form per V1+ plan (UI-driven).
 *
 * Spatial coordinates are integers in arbitrary canvas units; the
 * UI's zoom/pan transform maps them to viewport pixels. We do NOT
 * pin a coordinate system — operators can use 1u = 1px or any
 * other convention.
 *
 * ADR: docs/architecture/agent-studio-canvas-strategy.md.
 */

import {
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const agsCanvases = pgTable(
  "ags_canvases",
  {
    id: serial("id").primaryKey(),
    /** Vault scoping. Soft FK — Canvases survive vault soft-delete
     *  for audit. */
    vaultId: integer("vault_id").notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    createdByUserId: integer("created_by_user_id"),
    /** Operator-tunable per-canvas metadata (default zoom level,
     *  background grid spacing, etc.). */
    settings: json("settings"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("uniq_ags_canvases_slug").on(t.vaultId, t.slug),
    vaultIdx: index("idx_ags_canvases_vault").on(t.vaultId),
  }),
);

export const agsCanvasNodes = pgTable(
  "ags_canvas_nodes",
  {
    id: serial("id").primaryKey(),
    canvasId: integer("canvas_id")
      .notNull()
      .references(() => agsCanvases.id),
    /** Closed taxonomy enforced at the service layer:
     *  `note_ref` | `embedded_query` | `free_text` | `image_ref`. */
    kind: varchar("kind", { length: 40 }).notNull(),
    /** For `note_ref`: the `ags_vault_notes.id`. For other kinds,
     *  null; the payload lives in `data`. */
    referencedNoteId: integer("referenced_note_id"),
    /** Spatial bounds (canvas units; UI maps to viewport). */
    x: integer("x").notNull().default(0),
    y: integer("y").notNull().default(0),
    width: integer("width").notNull().default(200),
    height: integer("height").notNull().default(120),
    /** Kind-specific payload (free_text content, embedded_query
     *  template/params, image asset id, etc.). */
    data: json("data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    canvasIdx: index("idx_ags_canvas_nodes_canvas").on(t.canvasId),
    noteRefIdx: index("idx_ags_canvas_nodes_note_ref").on(t.referencedNoteId),
    kindIdx: index("idx_ags_canvas_nodes_kind").on(t.kind),
  }),
);

export const agsCanvasEdges = pgTable(
  "ags_canvas_edges",
  {
    id: serial("id").primaryKey(),
    canvasId: integer("canvas_id")
      .notNull()
      .references(() => agsCanvases.id),
    sourceCanvasNodeId: integer("source_canvas_node_id")
      .notNull()
      .references(() => agsCanvasNodes.id),
    targetCanvasNodeId: integer("target_canvas_node_id")
      .notNull()
      .references(() => agsCanvasNodes.id),
    /** Free-form UI-driven relationship label. Examples:
     *  `"references"`, `"depends_on"`, `"contradicts"`. */
    relationshipKind: varchar("relationship_kind", { length: 80 })
      .notNull()
      .default("references"),
    /** Optional caption + style payload. */
    data: json("data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    canvasIdx: index("idx_ags_canvas_edges_canvas").on(t.canvasId),
    sourceIdx: index("idx_ags_canvas_edges_source").on(t.sourceCanvasNodeId),
    targetIdx: index("idx_ags_canvas_edges_target").on(t.targetCanvasNodeId),
  }),
);

export type AgsCanvas = typeof agsCanvases.$inferSelect;
export type NewAgsCanvas = typeof agsCanvases.$inferInsert;
export type AgsCanvasNode = typeof agsCanvasNodes.$inferSelect;
export type NewAgsCanvasNode = typeof agsCanvasNodes.$inferInsert;
export type AgsCanvasEdge = typeof agsCanvasEdges.$inferSelect;
export type NewAgsCanvasEdge = typeof agsCanvasEdges.$inferInsert;

/**
 * V1+ Phase 17-γ — Canvas → graph projection event log.
 *
 * Audit trail for projection-sink fan-out. Sink registry shipped in
 * PR-V1-41 (#792); the no-op default suppresses recording. This
 * table is the persistence target for an ASDB-backed sink that
 * will land in a follow-up PR composing on top of this schema.
 *
 * Closed-taxonomy `kind`:
 *   - `note_reference_changed` — CanvasNode.referencedNoteId was
 *     set or updated (caller hook in `createCanvasNode` already
 *     emits this for first-set; future `updateCanvasNode` will
 *     emit for changes).
 *   - `note_reference_removed` — CanvasNode.referencedNoteId
 *     cleared (delete path).
 *
 * The kind list mirrors `CanvasProjectionEvent` in
 * `services/canvas/projection-events-sink.ts` (the structural
 * declaration) — keep in lockstep when adding kinds.
 *
 * Workspace scoping is INTENTIONAL even though the source event
 * doesn't carry workspaceId: ASDB-backed retention + multi-region
 * routing (MR-2 onwards) need the column. Sink writers resolve
 * workspaceId via the canvas's vault before insert.
 *
 * Append-only — no UPDATE / DELETE in the sink's contract. The
 * projection-sync worker reads sequentially via `createdAt` /
 * `id` and is free to drain idempotently.
 */
export const agsCanvasProjectionEvents = pgTable(
  "ags_canvas_projection_events",
  {
    id: serial("id").primaryKey(),
    /** Closed taxonomy — see `CanvasProjectionEvent` in
     *  `services/canvas/projection-events-sink.ts`. */
    kind: varchar("kind", { length: 64 }).notNull(),
    /** Workspace scoping for retention + multi-region routing. */
    workspaceId: integer("workspace_id").notNull(),
    /** Canvas + node that originated the event. */
    canvasId: integer("canvas_id").notNull(),
    canvasNodeId: integer("canvas_node_id").notNull(),
    /** The referenced note id captured at event time. For
     *  `note_reference_removed` events this is the PRIOR value
     *  (post-clear the column is null on the node row). */
    referencedNoteId: integer("referenced_note_id"),
    /** Optional caller-supplied metadata payload (provenance,
     *  change reason, etc.). */
    metadata: json("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    workspaceCreatedIdx: index("idx_ags_canvas_projection_events_ws_created").on(
      t.workspaceId,
      t.createdAt,
    ),
    canvasIdx: index("idx_ags_canvas_projection_events_canvas").on(t.canvasId),
    nodeIdx: index("idx_ags_canvas_projection_events_node").on(
      t.canvasNodeId,
    ),
    kindIdx: index("idx_ags_canvas_projection_events_kind").on(t.kind),
  }),
);

export type AgsCanvasProjectionEvent =
  typeof agsCanvasProjectionEvents.$inferSelect;
export type NewAgsCanvasProjectionEvent =
  typeof agsCanvasProjectionEvents.$inferInsert;
