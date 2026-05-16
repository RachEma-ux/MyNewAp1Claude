/**
 * Phase S §T-S.16 — AGS memory-scope metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_MEMORY_SCOPES,
  AGS_MEMORY_SCOPE_METADATA,
  getAgsMemoryScopeMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_MEMORY_SCOPE_METADATA (T-S.16)", () => {
  it("has metadata for every closed-taxonomy scope", () => {
    for (const s of AGS_MEMORY_SCOPES) {
      expect(AGS_MEMORY_SCOPE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_MEMORY_SCOPE_METADATA).length).toBe(
      AGS_MEMORY_SCOPES.length,
    );
  });

  it.each(AGS_MEMORY_SCOPES)(
    "%s has non-empty label + description + booleans",
    (s) => {
      const md = AGS_MEMORY_SCOPE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.crossProject).toBe("boolean");
      expect(typeof md.survivesClone).toBe("boolean");
    },
  );

  it.each(AGS_MEMORY_SCOPES)(
    "getAgsMemoryScopeMetadata(%s) returns table entry",
    (s) => {
      expect(getAgsMemoryScopeMetadata(s)).toBe(AGS_MEMORY_SCOPE_METADATA[s]);
    },
  );

  it("only `user` is cross-project", () => {
    expect(AGS_MEMORY_SCOPE_METADATA.user.crossProject).toBe(true);
    expect(AGS_MEMORY_SCOPE_METADATA.project.crossProject).toBe(false);
    expect(AGS_MEMORY_SCOPE_METADATA.local.crossProject).toBe(false);
  });

  it("user + project survive clone; local does not", () => {
    expect(AGS_MEMORY_SCOPE_METADATA.user.survivesClone).toBe(true);
    expect(AGS_MEMORY_SCOPE_METADATA.project.survivesClone).toBe(true);
    expect(AGS_MEMORY_SCOPE_METADATA.local.survivesClone).toBe(false);
  });

  it("crossProject=true implies survivesClone=true", () => {
    for (const s of AGS_MEMORY_SCOPES) {
      const md = AGS_MEMORY_SCOPE_METADATA[s];
      if (md.crossProject) {
        expect(md.survivesClone).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of AGS_MEMORY_SCOPES) {
      labels.add(AGS_MEMORY_SCOPE_METADATA[s].label);
    }
    expect(labels.size).toBe(AGS_MEMORY_SCOPES.length);
  });
});
