/**
 * Phase S §T-S.9 — AGS test-verdict metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_TEST_VERDICTS,
  AGS_TEST_VERDICT_METADATA,
  getAgsTestVerdictMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_TEST_VERDICT_METADATA (T-S.9)", () => {
  it("has metadata for every closed-taxonomy verdict", () => {
    for (const v of AGS_TEST_VERDICTS) {
      expect(AGS_TEST_VERDICT_METADATA[v]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_TEST_VERDICT_METADATA).length).toBe(
      AGS_TEST_VERDICTS.length,
    );
  });

  it.each(AGS_TEST_VERDICTS)(
    "%s has non-empty label + description + booleans",
    (v) => {
      const md = AGS_TEST_VERDICT_METADATA[v];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.countedAsPass).toBe("boolean");
      expect(typeof md.executed).toBe("boolean");
    },
  );

  it.each(AGS_TEST_VERDICTS)(
    "getAgsTestVerdictMetadata(%s) returns table entry",
    (v) => {
      expect(getAgsTestVerdictMetadata(v)).toBe(AGS_TEST_VERDICT_METADATA[v]);
    },
  );

  it("only `pass` counts as pass", () => {
    for (const v of AGS_TEST_VERDICTS) {
      const expected = v === "pass";
      expect(AGS_TEST_VERDICT_METADATA[v].countedAsPass).toBe(expected);
    }
  });

  it("only `skipped` did NOT execute", () => {
    for (const v of AGS_TEST_VERDICTS) {
      const expected = v !== "skipped";
      expect(AGS_TEST_VERDICT_METADATA[v].executed).toBe(expected);
    }
  });

  it("countedAsPass=true implies executed=true", () => {
    for (const v of AGS_TEST_VERDICTS) {
      const md = AGS_TEST_VERDICT_METADATA[v];
      if (md.countedAsPass) {
        expect(md.executed).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const v of AGS_TEST_VERDICTS) {
      labels.add(AGS_TEST_VERDICT_METADATA[v].label);
    }
    expect(labels.size).toBe(AGS_TEST_VERDICTS.length);
  });
});
