/**
 * Phase G §T-G.56 — Runtime validation-verdict metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RUNTIME_VALIDATION_VERDICTS,
  RUNTIME_VALIDATION_VERDICT_METADATA,
  getRuntimeValidationVerdictMetadata,
} from "../../server/agent-studio/services/runtime/trace-writer.js";

describe("RUNTIME_VALIDATION_VERDICT_METADATA (T-G.56)", () => {
  it("has metadata for every closed-taxonomy verdict", () => {
    for (const v of RUNTIME_VALIDATION_VERDICTS) {
      expect(RUNTIME_VALIDATION_VERDICT_METADATA[v]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RUNTIME_VALIDATION_VERDICT_METADATA).length).toBe(
      RUNTIME_VALIDATION_VERDICTS.length,
    );
  });

  it.each(RUNTIME_VALIDATION_VERDICTS)(
    "%s has non-empty label + description + boolean allowsDispatch",
    (v) => {
      const md = RUNTIME_VALIDATION_VERDICT_METADATA[v];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.allowsDispatch).toBe("boolean");
    },
  );

  it.each(RUNTIME_VALIDATION_VERDICTS)(
    "getRuntimeValidationVerdictMetadata(%s) returns table entry",
    (v) => {
      expect(getRuntimeValidationVerdictMetadata(v)).toBe(
        RUNTIME_VALIDATION_VERDICT_METADATA[v],
      );
    },
  );

  it("ok is the only allowsDispatch verdict", () => {
    const allow = RUNTIME_VALIDATION_VERDICTS.filter(
      (v) => RUNTIME_VALIDATION_VERDICT_METADATA[v].allowsDispatch,
    );
    expect(allow).toEqual(["ok"]);
  });

  it("rejected is the only !allowsDispatch verdict", () => {
    const refuse = RUNTIME_VALIDATION_VERDICTS.filter(
      (v) => !RUNTIME_VALIDATION_VERDICT_METADATA[v].allowsDispatch,
    );
    expect(refuse).toEqual(["rejected"]);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const v of RUNTIME_VALIDATION_VERDICTS) {
      labels.add(RUNTIME_VALIDATION_VERDICT_METADATA[v].label);
    }
    expect(labels.size).toBe(RUNTIME_VALIDATION_VERDICTS.length);
  });
});
