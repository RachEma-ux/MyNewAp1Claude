/**
 * Phase 11 §T-A.10 — RAC owner-module metadata lockstep.
 * Also covers the union→tuple promotion of `RacOwnerModule`.
 */

import { describe, it, expect } from "vitest";
import {
  RAC_OWNER_MODULES,
  RAC_OWNER_MODULE_METADATA,
  getRacOwnerModuleMetadata,
} from "../../server/agent-studio/services/rac/sources/index.js";

describe("RAC_OWNER_MODULE_METADATA (T-A.10)", () => {
  it("has metadata for every closed-taxonomy owner module", () => {
    for (const o of RAC_OWNER_MODULES) {
      expect(RAC_OWNER_MODULE_METADATA[o]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RAC_OWNER_MODULE_METADATA).length).toBe(
      RAC_OWNER_MODULES.length,
    );
  });

  it.each(RAC_OWNER_MODULES)(
    "%s has non-empty label + description + boolean firstParty",
    (o) => {
      const md = RAC_OWNER_MODULE_METADATA[o];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.firstParty).toBe("boolean");
    },
  );

  it.each(RAC_OWNER_MODULES)(
    "getRacOwnerModuleMetadata(%s) returns table entry",
    (o) => {
      expect(getRacOwnerModuleMetadata(o)).toBe(RAC_OWNER_MODULE_METADATA[o]);
    },
  );

  it("only agentStudio is first-party", () => {
    expect(RAC_OWNER_MODULE_METADATA.agentStudio.firstParty).toBe(true);
    expect(RAC_OWNER_MODULE_METADATA.dataAnalysis.firstParty).toBe(false);
    expect(RAC_OWNER_MODULE_METADATA.projectsSystem.firstParty).toBe(false);
    expect(RAC_OWNER_MODULE_METADATA.external.firstParty).toBe(false);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const o of RAC_OWNER_MODULES) {
      labels.add(RAC_OWNER_MODULE_METADATA[o].label);
    }
    expect(labels.size).toBe(RAC_OWNER_MODULES.length);
  });
});
