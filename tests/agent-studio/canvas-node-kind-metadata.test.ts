/**
 * Phase C §T-C.1 — canvas node-kind metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CANVAS_NODE_KINDS,
  CANVAS_NODE_KIND_METADATA,
  getCanvasNodeKindMetadata,
} from "../../server/agent-studio/services/canvas/types.js";

describe("CANVAS_NODE_KIND_METADATA (T-C.1)", () => {
  it("has metadata for every closed-taxonomy kind", () => {
    for (const k of CANVAS_NODE_KINDS) {
      expect(CANVAS_NODE_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(CANVAS_NODE_KIND_METADATA).length).toBe(
      CANVAS_NODE_KINDS.length,
    );
  });

  it.each(CANVAS_NODE_KINDS)(
    "%s has non-empty label + description + booleans",
    (k) => {
      const md = CANVAS_NODE_KIND_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.isReference).toBe("boolean");
      expect(typeof md.evaluatesAtRender).toBe("boolean");
    },
  );

  it.each(CANVAS_NODE_KINDS)(
    "getCanvasNodeKindMetadata(%s) returns table entry",
    (k) => {
      expect(getCanvasNodeKindMetadata(k)).toBe(CANVAS_NODE_KIND_METADATA[k]);
    },
  );

  it("free_text is the only non-reference kind", () => {
    expect(CANVAS_NODE_KIND_METADATA.note_ref.isReference).toBe(true);
    expect(CANVAS_NODE_KIND_METADATA.embedded_query.isReference).toBe(true);
    expect(CANVAS_NODE_KIND_METADATA.image_ref.isReference).toBe(true);
    expect(CANVAS_NODE_KIND_METADATA.free_text.isReference).toBe(false);
  });

  it("only embedded_query evaluates at render", () => {
    for (const k of CANVAS_NODE_KINDS) {
      const expected = k === "embedded_query";
      expect(CANVAS_NODE_KIND_METADATA[k].evaluatesAtRender).toBe(expected);
    }
  });

  it("any kind that evaluates at render is necessarily a reference", () => {
    for (const k of CANVAS_NODE_KINDS) {
      const md = CANVAS_NODE_KIND_METADATA[k];
      if (md.evaluatesAtRender) {
        expect(md.isReference).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of CANVAS_NODE_KINDS) {
      labels.add(CANVAS_NODE_KIND_METADATA[k].label);
    }
    expect(labels.size).toBe(CANVAS_NODE_KINDS.length);
  });
});
