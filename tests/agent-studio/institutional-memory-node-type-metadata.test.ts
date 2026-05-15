/**
 * Phase 25 §T-G.26 — institutional-memory node-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA,
  getInstitutionalMemoryNodeTypeMetadata,
} from "../../server/agent-studio/services/institutional-memory/public-api.js";

describe("INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA (T-G.26)", () => {
  it("has metadata for every closed-taxonomy node type", () => {
    for (const t of INSTITUTIONAL_MEMORY_NODE_TYPES) {
      expect(INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA[t]).toBeDefined();
    }
  });

  it("metadata key count equals INSTITUTIONAL_MEMORY_NODE_TYPES.length", () => {
    expect(Object.keys(INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA).length).toBe(
      INSTITUTIONAL_MEMORY_NODE_TYPES.length,
    );
  });

  it.each(INSTITUTIONAL_MEMORY_NODE_TYPES)(
    "%s has non-empty label + description",
    (type) => {
      const m = INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA[type];
      expect(m.label.length).toBeGreaterThan(1);
      expect(m.description.length).toBeGreaterThan(20);
    },
  );

  it.each(INSTITUTIONAL_MEMORY_NODE_TYPES)(
    "getInstitutionalMemoryNodeTypeMetadata(%s) returns the table entry",
    (type) => {
      expect(getInstitutionalMemoryNodeTypeMetadata(type)).toBe(
        INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA[type],
      );
    },
  );

  it("every metadata key maps to a INSTITUTIONAL_MEMORY_NODE_TYPES entry", () => {
    const registered = new Set<string>(INSTITUTIONAL_MEMORY_NODE_TYPES);
    for (const key of Object.keys(INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
