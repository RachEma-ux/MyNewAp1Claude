/**
 * Canvas service — contracts.
 *
 * V1+ Phase 17-α first slice. Closed kind-taxonomy + service input/
 * output shapes. The kind union is enforced at the service layer
 * (Drizzle column is varchar for additive growth, validated here).
 *
 * Hard-rule compliance:
 *   - Canvas is a UI surface. Graph mutations route through Phase
 *     11.5 graph change proposals; Canvas → graph projection is
 *     a SEPARATE, asynchronous edge (`CANVAS_REFERENCES_NOTE`).
 *   - No raw env reads. No graph-driver imports.
 */

export const CANVAS_NODE_KINDS = [
  "note_ref",
  "embedded_query",
  "free_text",
  "image_ref",
] as const;

export type CanvasNodeKind = (typeof CANVAS_NODE_KINDS)[number];

export function isCanvasNodeKind(s: unknown): s is CanvasNodeKind {
  return (
    typeof s === "string" &&
    (CANVAS_NODE_KINDS as readonly string[]).includes(s)
  );
}

// ============================================================================
// Per-node-kind operator-facing metadata (T-C.1)
// ============================================================================

export interface CanvasNodeKindMetadata {
  /** Display label rendered in the canvas node picker / toolbar. */
  readonly label: string;
  /** Short operator-facing description of what the node represents. */
  readonly description: string;
  /** Whether this node kind holds a reference to a governed-content
   *  primitive (note, query, image) that lives outside the canvas vs.
   *  free-form inline content. References inherit permissions /
   *  freshness from the referenced primitive. */
  readonly isReference: boolean;
  /** Whether this node kind embeds a live retrieval / query result
   *  that re-evaluates on canvas open (true) vs. static content (false). */
  readonly evaluatesAtRender: boolean;
}

export const CANVAS_NODE_KIND_METADATA: Readonly<
  Record<CanvasNodeKind, CanvasNodeKindMetadata>
> = {
  note_ref: {
    label: "Note Reference",
    description:
      "References a governed note. The canvas renders the note's current title/excerpt; permissions and freshness flow from the referenced note.",
    isReference: true,
    evaluatesAtRender: false,
  },
  embedded_query: {
    label: "Embedded Query",
    description:
      "References a saved query that re-evaluates each time the canvas renders — surfaces live result rows in the canvas layout.",
    isReference: true,
    evaluatesAtRender: true,
  },
  free_text: {
    label: "Free Text",
    description:
      "Inline text content authored directly on the canvas — not a reference to a governed primitive; lives only in the canvas's own node table.",
    isReference: false,
    evaluatesAtRender: false,
  },
  image_ref: {
    label: "Image Reference",
    description:
      "References a governed image attachment. The canvas renders the image; permissions flow from the referenced attachment.",
    isReference: true,
    evaluatesAtRender: false,
  },
};

export function getCanvasNodeKindMetadata(
  kind: CanvasNodeKind,
): CanvasNodeKindMetadata {
  return CANVAS_NODE_KIND_METADATA[kind];
}

export interface CanvasRecord {
  readonly id: number;
  readonly vaultId: number;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly settings: Record<string, unknown> | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CanvasNodeRecord {
  readonly id: number;
  readonly canvasId: number;
  readonly kind: CanvasNodeKind;
  readonly referencedNoteId: number | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly data: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CanvasEdgeRecord {
  readonly id: number;
  readonly canvasId: number;
  readonly sourceCanvasNodeId: number;
  readonly targetCanvasNodeId: number;
  readonly relationshipKind: string;
  readonly data: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export interface CreateCanvasInput {
  readonly vaultId: number;
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly createdByUserId?: number;
  readonly settings?: Record<string, unknown>;
}

export interface CreateCanvasNodeInput {
  readonly canvasId: number;
  readonly kind: CanvasNodeKind;
  readonly referencedNoteId?: number | null;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly data?: Record<string, unknown>;
}

export interface CreateCanvasEdgeInput {
  readonly canvasId: number;
  readonly sourceCanvasNodeId: number;
  readonly targetCanvasNodeId: number;
  readonly relationshipKind?: string;
  readonly data?: Record<string, unknown>;
}

/**
 * V1+ Phase 17-γ follow-up (PR-V1-169): update a canvas node.
 *
 * All fields except `nodeId` are optional — caller supplies only
 * the columns they want to change. Note-reference changes
 * (referencedNoteId added / changed / cleared) emit the appropriate
 * projection event (`canvas.note_reference_changed` /
 * `canvas.note_reference_removed`) so the existing 17-γ persistence
 * sink + drain chain (#804–#812) automatically captures the change.
 *
 * Passing `referencedNoteId: null` explicitly clears the reference.
 * Passing `referencedNoteId: undefined` leaves it untouched.
 */
export interface UpdateCanvasNodeInput {
  readonly nodeId: number;
  readonly kind?: CanvasNodeKind;
  readonly referencedNoteId?: number | null;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly data?: Record<string, unknown> | null;
}

export class CanvasNodeNotFoundError extends Error {
  constructor(nodeId: number) {
    super(`Canvas node ${nodeId} not found`);
    this.name = "CanvasNodeNotFoundError";
  }
}

export interface CanvasSnapshot {
  readonly canvas: CanvasRecord;
  readonly nodes: ReadonlyArray<CanvasNodeRecord>;
  readonly edges: ReadonlyArray<CanvasEdgeRecord>;
}

export class CanvasNotFoundError extends Error {
  readonly code = "canvas_not_found";
  constructor(id: number | string) {
    super(`Canvas not found: ${String(id)}`);
    this.name = "CanvasNotFoundError";
  }
}

export class CanvasNodeKindError extends Error {
  readonly code = "canvas_node_kind_invalid";
  constructor(value: unknown) {
    super(
      `Invalid canvas node kind: ${String(value)}. ` +
        `Allowed: ${CANVAS_NODE_KINDS.join(" | ")}.`,
    );
    this.name = "CanvasNodeKindError";
  }
}
