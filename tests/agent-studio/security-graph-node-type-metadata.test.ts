/**
 * Phase 25 §T-G.24 — security-graph node-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  SECURITY_GRAPH_NODE_TYPES,
  SECURITY_GRAPH_NODE_TYPE_METADATA,
  getSecurityGraphNodeTypeMetadata,
} from "../../server/agent-studio/services/security-graph/public-api.js";

describe("SECURITY_GRAPH_NODE_TYPE_METADATA (T-G.24)", () => {
  it("has metadata for every closed-taxonomy node type", () => {
    for (const t of SECURITY_GRAPH_NODE_TYPES) {
      expect(SECURITY_GRAPH_NODE_TYPE_METADATA[t]).toBeDefined();
    }
  });

  it("metadata key count equals SECURITY_GRAPH_NODE_TYPES.length", () => {
    expect(Object.keys(SECURITY_GRAPH_NODE_TYPE_METADATA).length).toBe(
      SECURITY_GRAPH_NODE_TYPES.length,
    );
  });

  it.each(SECURITY_GRAPH_NODE_TYPES)(
    "%s has non-empty label + description",
    (type) => {
      const m = SECURITY_GRAPH_NODE_TYPE_METADATA[type];
      expect(m.label.length).toBeGreaterThan(1);
      expect(m.description.length).toBeGreaterThan(20);
    },
  );

  it.each(SECURITY_GRAPH_NODE_TYPES)(
    "getSecurityGraphNodeTypeMetadata(%s) returns the table entry",
    (type) => {
      expect(getSecurityGraphNodeTypeMetadata(type)).toBe(
        SECURITY_GRAPH_NODE_TYPE_METADATA[type],
      );
    },
  );

  it("every metadata key maps to a SECURITY_GRAPH_NODE_TYPES entry", () => {
    const registered = new Set<string>(SECURITY_GRAPH_NODE_TYPES);
    for (const key of Object.keys(SECURITY_GRAPH_NODE_TYPE_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
