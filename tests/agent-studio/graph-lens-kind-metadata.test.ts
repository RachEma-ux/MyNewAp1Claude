/**
 * Phase 24 §T-F.13 — graph-lens kind metadata lockstep.
 *
 * Per-kind operator-facing labels + descriptions over the closed
 * GRAPH_LENS_KINDS taxonomy.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_LENS_KINDS,
  GRAPH_LENS_KIND_METADATA,
  getGraphLensKindMetadata,
} from "../../server/agent-studio/services/graph-lens/public-api.js";

describe("GRAPH_LENS_KIND_METADATA (T-F.13)", () => {
  it("has metadata for every closed-taxonomy kind", () => {
    for (const k of GRAPH_LENS_KINDS) {
      expect(GRAPH_LENS_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals GRAPH_LENS_KINDS.length", () => {
    expect(Object.keys(GRAPH_LENS_KIND_METADATA).length).toBe(
      GRAPH_LENS_KINDS.length,
    );
  });

  it.each(GRAPH_LENS_KINDS)("%s has non-empty label + description", (kind) => {
    const m = GRAPH_LENS_KIND_METADATA[kind];
    expect(m.label.length).toBeGreaterThan(1);
    expect(m.description.length).toBeGreaterThan(20);
  });

  it.each(GRAPH_LENS_KINDS)(
    "getGraphLensKindMetadata(%s) returns the table entry",
    (kind) => {
      expect(getGraphLensKindMetadata(kind)).toBe(
        GRAPH_LENS_KIND_METADATA[kind],
      );
    },
  );

  it("every metadata key maps to a GRAPH_LENS_KINDS entry (no orphans)", () => {
    const registered = new Set<string>(GRAPH_LENS_KINDS);
    for (const key of Object.keys(GRAPH_LENS_KIND_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
