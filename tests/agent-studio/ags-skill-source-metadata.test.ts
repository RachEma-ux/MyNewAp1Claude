/**
 * Phase S §T-S.18 — AGS skill-source metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_SKILL_SOURCES,
  AGS_SKILL_SOURCE_METADATA,
  getAgsSkillSourceMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_SKILL_SOURCE_METADATA (T-S.18)", () => {
  it("has metadata for every closed-taxonomy source", () => {
    for (const s of AGS_SKILL_SOURCES) {
      expect(AGS_SKILL_SOURCE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_SKILL_SOURCE_METADATA).length).toBe(
      AGS_SKILL_SOURCES.length,
    );
  });

  it.each(AGS_SKILL_SOURCES)(
    "%s has non-empty label + description + booleans",
    (s) => {
      const md = AGS_SKILL_SOURCE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.editable).toBe("boolean");
      expect(typeof md.external).toBe("boolean");
    },
  );

  it.each(AGS_SKILL_SOURCES)(
    "getAgsSkillSourceMetadata(%s) returns table entry",
    (s) => {
      expect(getAgsSkillSourceMetadata(s)).toBe(AGS_SKILL_SOURCE_METADATA[s]);
    },
  );

  it("only `db` is editable", () => {
    for (const s of AGS_SKILL_SOURCES) {
      const expected = s === "db";
      expect(AGS_SKILL_SOURCE_METADATA[s].editable).toBe(expected);
    }
  });

  it("only `db` is non-external", () => {
    for (const s of AGS_SKILL_SOURCES) {
      const expected = s !== "db";
      expect(AGS_SKILL_SOURCE_METADATA[s].external).toBe(expected);
    }
  });

  it("editable=true implies external=false (db only)", () => {
    for (const s of AGS_SKILL_SOURCES) {
      const md = AGS_SKILL_SOURCE_METADATA[s];
      if (md.editable) {
        expect(md.external).toBe(false);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of AGS_SKILL_SOURCES) {
      labels.add(AGS_SKILL_SOURCE_METADATA[s].label);
    }
    expect(labels.size).toBe(AGS_SKILL_SOURCES.length);
  });
});
