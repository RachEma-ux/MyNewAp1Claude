/**
 * Phase 24 §T-F.15 — graph-lens layout metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_LENS_LAYOUTS,
  GRAPH_LENS_LAYOUT_METADATA,
  getGraphLensLayoutMetadata,
} from "../../server/agent-studio/services/graph-lens/public-api.js";

describe("GRAPH_LENS_LAYOUT_METADATA (T-F.15)", () => {
  it("has metadata for every closed-taxonomy layout", () => {
    for (const l of GRAPH_LENS_LAYOUTS) {
      expect(GRAPH_LENS_LAYOUT_METADATA[l]).toBeDefined();
    }
  });

  it("metadata key count equals GRAPH_LENS_LAYOUTS.length", () => {
    expect(Object.keys(GRAPH_LENS_LAYOUT_METADATA).length).toBe(
      GRAPH_LENS_LAYOUTS.length,
    );
  });

  it.each(GRAPH_LENS_LAYOUTS)("%s has non-empty label + description", (layout) => {
    const m = GRAPH_LENS_LAYOUT_METADATA[layout];
    expect(m.label.length).toBeGreaterThan(2);
    expect(m.description.length).toBeGreaterThan(20);
  });

  it.each(GRAPH_LENS_LAYOUTS)(
    "getGraphLensLayoutMetadata(%s) returns table entry",
    (layout) => {
      expect(getGraphLensLayoutMetadata(layout)).toBe(
        GRAPH_LENS_LAYOUT_METADATA[layout],
      );
    },
  );

  it("every metadata key maps to a GRAPH_LENS_LAYOUTS entry", () => {
    const registered = new Set<string>(GRAPH_LENS_LAYOUTS);
    for (const key of Object.keys(GRAPH_LENS_LAYOUT_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
