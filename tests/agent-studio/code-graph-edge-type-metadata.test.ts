/**
 * Phase 25 §T-G.30 — code-graph edge-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CODE_GRAPH_EDGE_TYPES,
  CODE_GRAPH_EDGE_TYPE_METADATA,
  getCodeGraphEdgeTypeMetadata,
} from "../../server/agent-studio/services/code-graph/contracts/public-api.js";

describe("CODE_GRAPH_EDGE_TYPE_METADATA (T-G.30)", () => {
  it("has metadata for every closed-taxonomy edge type", () => {
    for (const t of CODE_GRAPH_EDGE_TYPES) {
      expect(CODE_GRAPH_EDGE_TYPE_METADATA[t]).toBeDefined();
    }
  });

  it("metadata key count equals CODE_GRAPH_EDGE_TYPES.length", () => {
    expect(Object.keys(CODE_GRAPH_EDGE_TYPE_METADATA).length).toBe(
      CODE_GRAPH_EDGE_TYPES.length,
    );
  });

  it.each(CODE_GRAPH_EDGE_TYPES)(
    "%s has non-empty label + description",
    (type) => {
      const m = CODE_GRAPH_EDGE_TYPE_METADATA[type];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
    },
  );

  it.each(CODE_GRAPH_EDGE_TYPES)(
    "getCodeGraphEdgeTypeMetadata(%s) returns table entry",
    (type) => {
      expect(getCodeGraphEdgeTypeMetadata(type)).toBe(
        CODE_GRAPH_EDGE_TYPE_METADATA[type],
      );
    },
  );

  it("every metadata key maps to a CODE_GRAPH_EDGE_TYPES entry", () => {
    const registered = new Set<string>(CODE_GRAPH_EDGE_TYPES);
    for (const key of Object.keys(CODE_GRAPH_EDGE_TYPE_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
