/**
 * Phase 25 §T-G.25 — code-graph node-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CODE_GRAPH_NODE_TYPES,
  CODE_GRAPH_NODE_TYPE_METADATA,
  getCodeGraphNodeTypeMetadata,
} from "../../server/agent-studio/services/code-graph/contracts/public-api.js";

describe("CODE_GRAPH_NODE_TYPE_METADATA (T-G.25)", () => {
  it("has metadata for every closed-taxonomy node type", () => {
    for (const t of CODE_GRAPH_NODE_TYPES) {
      expect(CODE_GRAPH_NODE_TYPE_METADATA[t]).toBeDefined();
    }
  });

  it("metadata key count equals CODE_GRAPH_NODE_TYPES.length", () => {
    expect(Object.keys(CODE_GRAPH_NODE_TYPE_METADATA).length).toBe(
      CODE_GRAPH_NODE_TYPES.length,
    );
  });

  it.each(CODE_GRAPH_NODE_TYPES)(
    "%s has non-empty label + description",
    (type) => {
      const m = CODE_GRAPH_NODE_TYPE_METADATA[type];
      expect(m.label.length).toBeGreaterThan(1);
      expect(m.description.length).toBeGreaterThan(20);
    },
  );

  it.each(CODE_GRAPH_NODE_TYPES)(
    "getCodeGraphNodeTypeMetadata(%s) returns the table entry",
    (type) => {
      expect(getCodeGraphNodeTypeMetadata(type)).toBe(
        CODE_GRAPH_NODE_TYPE_METADATA[type],
      );
    },
  );

  it("every metadata key maps to a CODE_GRAPH_NODE_TYPES entry", () => {
    const registered = new Set<string>(CODE_GRAPH_NODE_TYPES);
    for (const key of Object.keys(CODE_GRAPH_NODE_TYPE_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
