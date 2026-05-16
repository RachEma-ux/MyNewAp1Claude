/**
 * Phase C §T-C.2 — `summarizeCanvasNodes` lockstep.
 *
 * 15th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import { summarizeCanvasNodes } from "../../server/agent-studio/services/canvas/canvas-node-summary.js";
import {
  CANVAS_NODE_KINDS,
  type CanvasNodeRecord,
} from "../../server/agent-studio/services/canvas/types.js";

function makeNode(overrides: Partial<CanvasNodeRecord> = {}): CanvasNodeRecord {
  return {
    id: 1,
    canvasId: 1,
    kind: "free_text",
    referencedNoteId: null,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    data: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("summarizeCanvasNodes — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeCanvasNodes([]);
    expect(s.total).toBe(0);
    expect(s.referenceCount).toBe(0);
    expect(s.freeFormCount).toBe(0);
    expect(s.evaluatesAtRenderCount).toBe(0);
    expect(s.withReferencedNoteCount).toBe(0);
    expect(s.distinctCanvasCount).toBe(0);
  });

  it("byKind carries every closed kind at 0 (stable shape)", () => {
    const s = summarizeCanvasNodes([]);
    for (const kind of CANVAS_NODE_KINDS) {
      expect(s.byKind[kind]).toBe(0);
    }
  });
});

describe("summarizeCanvasNodes — kind partition", () => {
  it("counts each kind correctly", () => {
    const s = summarizeCanvasNodes([
      makeNode({ kind: "note_ref" }),
      makeNode({ kind: "note_ref" }),
      makeNode({ kind: "embedded_query" }),
      makeNode({ kind: "free_text" }),
      makeNode({ kind: "image_ref" }),
    ]);
    expect(s.byKind.note_ref).toBe(2);
    expect(s.byKind.embedded_query).toBe(1);
    expect(s.byKind.free_text).toBe(1);
    expect(s.byKind.image_ref).toBe(1);
  });
});

describe("summarizeCanvasNodes — metadata-derived gauges", () => {
  it("reference + freeForm sums to total (every node is one or the other)", () => {
    const s = summarizeCanvasNodes([
      makeNode({ kind: "note_ref" }),
      makeNode({ kind: "embedded_query" }),
      makeNode({ kind: "free_text" }),
      makeNode({ kind: "image_ref" }),
    ]);
    expect(s.referenceCount + s.freeFormCount).toBe(s.total);
    expect(s.referenceCount).toBe(3); // note_ref / embedded_query / image_ref
    expect(s.freeFormCount).toBe(1); // free_text
  });

  it("evaluatesAtRenderCount only counts embedded_query kind", () => {
    const s = summarizeCanvasNodes([
      makeNode({ kind: "note_ref" }),
      makeNode({ kind: "embedded_query" }),
      makeNode({ kind: "embedded_query" }),
      makeNode({ kind: "free_text" }),
    ]);
    expect(s.evaluatesAtRenderCount).toBe(2);
  });
});

describe("summarizeCanvasNodes — referencedNoteId gauge", () => {
  it("withReferencedNoteCount counts non-null referencedNoteId", () => {
    const s = summarizeCanvasNodes([
      makeNode({ referencedNoteId: null }),
      makeNode({ referencedNoteId: 0 }), // 0 is a valid id, non-null
      makeNode({ referencedNoteId: 5 }),
    ]);
    expect(s.withReferencedNoteCount).toBe(2);
  });
});

describe("summarizeCanvasNodes — distinct canvas count", () => {
  it("tracks unique canvasId values", () => {
    const s = summarizeCanvasNodes([
      makeNode({ canvasId: 1 }),
      makeNode({ canvasId: 1 }),
      makeNode({ canvasId: 2 }),
      makeNode({ canvasId: 3 }),
    ]);
    expect(s.distinctCanvasCount).toBe(3);
  });

  it("0 distinct canvases when input is empty", () => {
    const s = summarizeCanvasNodes([]);
    expect(s.distinctCanvasCount).toBe(0);
  });
});

describe("summarizeCanvasNodes — invariants", () => {
  it("byKind sums to total", () => {
    const nodes: CanvasNodeRecord[] = CANVAS_NODE_KINDS.flatMap((kind) => [
      makeNode({ kind }),
      makeNode({ kind }),
    ]);
    const s = summarizeCanvasNodes(nodes);
    let sum = 0;
    for (const kind of CANVAS_NODE_KINDS) sum += s.byKind[kind];
    expect(sum).toBe(s.total);
  });
});
