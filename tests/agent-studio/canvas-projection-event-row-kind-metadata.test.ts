/**
 * Phase C §T-C.2 — canvas projection-event row-kind metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CANVAS_PROJECTION_EVENT_ROW_KINDS,
  CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA,
  getCanvasProjectionEventRowKindMetadata,
} from "../../server/agent-studio/services/canvas/projection-events-drain-row-projector.js";

describe("CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA (T-C.2)", () => {
  it("has metadata for every closed-taxonomy kind", () => {
    for (const k of CANVAS_PROJECTION_EVENT_ROW_KINDS) {
      expect(CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA).length,
    ).toBe(CANVAS_PROJECTION_EVENT_ROW_KINDS.length);
  });

  it.each(CANVAS_PROJECTION_EVENT_ROW_KINDS)(
    "%s has non-empty label + description + booleans",
    (k) => {
      const md = CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.referencesCurrentNote).toBe("boolean");
      expect(typeof md.isLinkAdd).toBe("boolean");
    },
  );

  it.each(CANVAS_PROJECTION_EVENT_ROW_KINDS)(
    "getCanvasProjectionEventRowKindMetadata(%s) returns table entry",
    (k) => {
      expect(getCanvasProjectionEventRowKindMetadata(k)).toBe(
        CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA[k],
      );
    },
  );

  it("note_reference_changed is the link-add, current-note kind", () => {
    expect(
      CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA.note_reference_changed.isLinkAdd,
    ).toBe(true);
    expect(
      CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA.note_reference_changed
        .referencesCurrentNote,
    ).toBe(true);
  });

  it("note_reference_removed is the link-removal, prior-note kind", () => {
    expect(
      CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA.note_reference_removed.isLinkAdd,
    ).toBe(false);
    expect(
      CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA.note_reference_removed
        .referencesCurrentNote,
    ).toBe(false);
  });

  it("isLinkAdd ⇔ referencesCurrentNote (closed-taxonomy invariant)", () => {
    for (const k of CANVAS_PROJECTION_EVENT_ROW_KINDS) {
      const md = CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA[k];
      expect(md.isLinkAdd).toBe(md.referencesCurrentNote);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of CANVAS_PROJECTION_EVENT_ROW_KINDS) {
      labels.add(CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA[k].label);
    }
    expect(labels.size).toBe(CANVAS_PROJECTION_EVENT_ROW_KINDS.length);
  });
});
