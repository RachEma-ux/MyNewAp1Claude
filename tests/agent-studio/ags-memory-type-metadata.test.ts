/**
 * Phase S §T-S.6 — AGS memory-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_MEMORY_TYPES,
  AGS_MEMORY_TYPE_METADATA,
  getAgsMemoryTypeMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_MEMORY_TYPE_METADATA (T-S.6)", () => {
  it("has metadata for every closed-taxonomy type", () => {
    for (const t of AGS_MEMORY_TYPES) {
      expect(AGS_MEMORY_TYPE_METADATA[t]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_MEMORY_TYPE_METADATA).length).toBe(
      AGS_MEMORY_TYPES.length,
    );
  });

  it.each(AGS_MEMORY_TYPES)(
    "%s has non-empty label + description + boolean + valid scope",
    (t) => {
      const md = AGS_MEMORY_TYPE_METADATA[t];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.persistsAcrossSessions).toBe("boolean");
      expect(["single_agent", "cross_agent"]).toContain(md.scope);
    },
  );

  it.each(AGS_MEMORY_TYPES)(
    "getAgsMemoryTypeMetadata(%s) returns table entry",
    (t) => {
      expect(getAgsMemoryTypeMetadata(t)).toBe(AGS_MEMORY_TYPE_METADATA[t]);
    },
  );

  it("only `session` does NOT persist across sessions", () => {
    for (const t of AGS_MEMORY_TYPES) {
      const expected = t !== "session";
      expect(AGS_MEMORY_TYPE_METADATA[t].persistsAcrossSessions).toBe(
        expected,
      );
    }
  });

  it("only `shared` is cross_agent scope", () => {
    for (const t of AGS_MEMORY_TYPES) {
      const md = AGS_MEMORY_TYPE_METADATA[t];
      if (t === "shared") {
        expect(md.scope).toBe("cross_agent");
      } else {
        expect(md.scope).toBe("single_agent");
      }
    }
  });

  it("cross_agent scope implies persistsAcrossSessions=true", () => {
    for (const t of AGS_MEMORY_TYPES) {
      const md = AGS_MEMORY_TYPE_METADATA[t];
      if (md.scope === "cross_agent") {
        expect(md.persistsAcrossSessions).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const t of AGS_MEMORY_TYPES) {
      labels.add(AGS_MEMORY_TYPE_METADATA[t].label);
    }
    expect(labels.size).toBe(AGS_MEMORY_TYPES.length);
  });
});
