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
