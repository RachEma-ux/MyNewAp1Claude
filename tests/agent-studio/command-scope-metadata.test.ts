/**
 * Phase G §T-G.49 — Command-scope metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  COMMAND_SCOPES,
  COMMAND_SCOPE_METADATA,
  getCommandScopeMetadata,
} from "../../server/agent-studio/services/command-registry/command-registry.js";

describe("COMMAND_SCOPE_METADATA (T-G.49)", () => {
  it("has metadata for every closed-taxonomy scope", () => {
    for (const s of COMMAND_SCOPES) {
      expect(COMMAND_SCOPE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(COMMAND_SCOPE_METADATA).length).toBe(
      COMMAND_SCOPES.length,
    );
  });

  it.each(COMMAND_SCOPES)(
    "%s has non-empty label + description + valid rank + boolean requiresExtraConfirmation",
    (s) => {
      const md = COMMAND_SCOPE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2]).toContain(md.rank);
      expect(typeof md.requiresExtraConfirmation).toBe("boolean");
    },
  );

  it.each(COMMAND_SCOPES)(
    "getCommandScopeMetadata(%s) returns table entry",
    (s) => {
      expect(getCommandScopeMetadata(s)).toBe(COMMAND_SCOPE_METADATA[s]);
    },
  );

  it("rank order matches declaration order (read=0 → destructive=2)", () => {
    COMMAND_SCOPES.forEach((s, idx) => {
      expect(COMMAND_SCOPE_METADATA[s].rank).toBe(idx);
    });
  });

  it("rank is unique across scopes", () => {
    const ranks = new Set<number>();
    for (const s of COMMAND_SCOPES) {
      ranks.add(COMMAND_SCOPE_METADATA[s].rank);
    }
    expect(ranks.size).toBe(COMMAND_SCOPES.length);
  });

  it("destructive is the only scope requiring extra confirmation", () => {
    const confirm = COMMAND_SCOPES.filter(
      (s) => COMMAND_SCOPE_METADATA[s].requiresExtraConfirmation,
    );
    expect(confirm).toEqual(["destructive"]);
  });

  it("requiresExtraConfirmation implies rank === 2", () => {
    for (const s of COMMAND_SCOPES) {
      const md = COMMAND_SCOPE_METADATA[s];
      if (md.requiresExtraConfirmation) {
        expect(md.rank).toBe(2);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of COMMAND_SCOPES) {
      labels.add(COMMAND_SCOPE_METADATA[s].label);
    }
    expect(labels.size).toBe(COMMAND_SCOPES.length);
  });
});
