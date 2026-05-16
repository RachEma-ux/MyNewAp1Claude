/**
 * `summarizeCanvasNodes` — stable-shape aggregator over `CanvasNodeRecord[]`
 * (T-C.2).
 *
 * Companion to T-C.1 `CANVAS_NODE_KIND_METADATA`. 15th instantiation
 * of the lesson-30 aggregator-pair pattern in the post-compaction
 * resume window.
 *
 * Use case: the canvas browser admin panel renders per-canvas
 * node-kind histograms (#967 shipped the per-kind breakdown). This
 * aggregator generalizes that pattern + adds metadata-derived gauges
 * (`referenceCount` / `evaluatesAtRenderCount`) so the panel can
 * answer "how many live-query nodes are on this canvas?" without
 * recounting per render.
 *
 * Stable-shape guarantees:
 *   - `byKind[kind]` zero-filled across `CANVAS_NODE_KINDS`.
 *   - `referenceCount` derived from `metadata.isReference`.
 *   - `evaluatesAtRenderCount` derived from `metadata.evaluatesAtRender`.
 *   - `freeFormCount` = total - referenceCount.
 *   - `withReferencedNoteCount` counts rows with a non-null
 *     `referencedNoteId` regardless of kind.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  CANVAS_NODE_KINDS,
  CANVAS_NODE_KIND_METADATA,
  type CanvasNodeKind,
  type CanvasNodeRecord,
} from "./types.js";

export interface CanvasNodeListSummary {
  readonly total: number;
  /** Per-kind count, zero-filled across `CANVAS_NODE_KINDS`. */
  readonly byKind: Readonly<Record<CanvasNodeKind, number>>;
  /** Nodes whose kind metadata says they reference an external
   *  governed primitive (note_ref / embedded_query / image_ref). */
  readonly referenceCount: number;
  /** Nodes whose kind metadata says they live entirely inline
   *  (free_text). */
  readonly freeFormCount: number;
  /** Nodes whose kind metadata says they evaluate at render time
   *  (embedded_query). */
  readonly evaluatesAtRenderCount: number;
  /** Nodes whose `referencedNoteId` field is non-null — usually
   *  note_ref kind but can be other kinds with stored note pointers. */
  readonly withReferencedNoteCount: number;
  /** Distinct `canvasId` values across the input — for cross-canvas
   *  rollups. */
  readonly distinctCanvasCount: number;
}

export function summarizeCanvasNodes(
  nodes: readonly CanvasNodeRecord[],
): CanvasNodeListSummary {
  const byKind: Record<string, number> = {};
  for (const k of CANVAS_NODE_KINDS) byKind[k] = 0;

  let withReferencedNoteCount = 0;
  const canvasIds = new Set<number>();

  for (const node of nodes) {
    byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
    if (node.referencedNoteId !== null) withReferencedNoteCount += 1;
    canvasIds.add(node.canvasId);
  }

  let referenceCount = 0;
  let evaluatesAtRenderCount = 0;
  for (const kind of CANVAS_NODE_KINDS) {
    const meta = CANVAS_NODE_KIND_METADATA[kind];
    if (meta.isReference) referenceCount += byKind[kind];
    if (meta.evaluatesAtRender) evaluatesAtRenderCount += byKind[kind];
  }

  return {
    total: nodes.length,
    byKind: byKind as Readonly<Record<CanvasNodeKind, number>>,
    referenceCount,
    freeFormCount: nodes.length - referenceCount,
    evaluatesAtRenderCount,
    withReferencedNoteCount,
    distinctCanvasCount: canvasIds.size,
  };
}
