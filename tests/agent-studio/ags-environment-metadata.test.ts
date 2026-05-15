/**
 * Phase S §T-S.4 — AGS environment metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_ENVIRONMENTS,
  AGS_ENVIRONMENT_METADATA,
  getAgsEnvironmentMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_ENVIRONMENT_METADATA (T-S.4)", () => {
  it("has metadata for every closed-taxonomy environment", () => {
    for (const e of AGS_ENVIRONMENTS) {
      expect(AGS_ENVIRONMENT_METADATA[e]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_ENVIRONMENT_METADATA).length).toBe(
      AGS_ENVIRONMENTS.length,
    );
  });

  it.each(AGS_ENVIRONMENTS)(
    "%s has non-empty label + description + valid rank + booleans",
    (e) => {
      const md = AGS_ENVIRONMENT_METADATA[e];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2, 3]).toContain(md.rank);
      expect(typeof md.customerFacing).toBe("boolean");
      expect(typeof md.persistent).toBe("boolean");
    },
  );

  it.each(AGS_ENVIRONMENTS)(
    "getAgsEnvironmentMetadata(%s) returns table entry",
    (e) => {
      expect(getAgsEnvironmentMetadata(e)).toBe(AGS_ENVIRONMENT_METADATA[e]);
    },
  );

  it("rank order matches declaration order (draft=0 → production=3)", () => {
    AGS_ENVIRONMENTS.forEach((env, idx) => {
      expect(AGS_ENVIRONMENT_METADATA[env].rank).toBe(idx);
    });
  });

  it("rank is unique across environments", () => {
    const ranks = new Set<number>();
    for (const e of AGS_ENVIRONMENTS) {
      ranks.add(AGS_ENVIRONMENT_METADATA[e].rank);
    }
    expect(ranks.size).toBe(AGS_ENVIRONMENTS.length);
  });

  it("only `production` is customer-facing", () => {
    for (const e of AGS_ENVIRONMENTS) {
      const expected = e === "production";
      expect(AGS_ENVIRONMENT_METADATA[e].customerFacing).toBe(expected);
    }
  });

  it("staging + production are persistent; draft + sandbox are not", () => {
    expect(AGS_ENVIRONMENT_METADATA.draft.persistent).toBe(false);
    expect(AGS_ENVIRONMENT_METADATA.sandbox.persistent).toBe(false);
    expect(AGS_ENVIRONMENT_METADATA.staging.persistent).toBe(true);
    expect(AGS_ENVIRONMENT_METADATA.production.persistent).toBe(true);
  });

  it("customerFacing=true implies persistent=true", () => {
    for (const e of AGS_ENVIRONMENTS) {
      const md = AGS_ENVIRONMENT_METADATA[e];
      if (md.customerFacing) {
        expect(md.persistent).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const e of AGS_ENVIRONMENTS) {
      labels.add(AGS_ENVIRONMENT_METADATA[e].label);
    }
    expect(labels.size).toBe(AGS_ENVIRONMENTS.length);
  });
});
