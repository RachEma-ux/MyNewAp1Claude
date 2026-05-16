/**
 * Phase G §T-G.44 — CAG compile-result metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CAG_COMPILE_RESULTS,
  CAG_COMPILE_RESULT_METADATA,
  getCagCompileResultMetadata,
} from "../../server/agent-studio/services/cag/types.js";

describe("CAG_COMPILE_RESULT_METADATA (T-G.44)", () => {
  it("has metadata for every closed-taxonomy result", () => {
    for (const r of CAG_COMPILE_RESULTS) {
      expect(CAG_COMPILE_RESULT_METADATA[r]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(CAG_COMPILE_RESULT_METADATA).length).toBe(
      CAG_COMPILE_RESULTS.length,
    );
  });

  it.each(CAG_COMPILE_RESULTS)(
    "%s has non-empty label + description + boolean producedBlock + boolean hasSignal",
    (r) => {
      const md = CAG_COMPILE_RESULT_METADATA[r];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.producedBlock).toBe("boolean");
      expect(typeof md.hasSignal).toBe("boolean");
    },
  );

  it.each(CAG_COMPILE_RESULTS)(
    "getCagCompileResultMetadata(%s) returns table entry",
    (r) => {
      expect(getCagCompileResultMetadata(r)).toBe(
        CAG_COMPILE_RESULT_METADATA[r],
      );
    },
  );

  it("error is the only non-producing result", () => {
    const nonProducing = CAG_COMPILE_RESULTS.filter(
      (r) => !CAG_COMPILE_RESULT_METADATA[r].producedBlock,
    );
    expect(nonProducing).toEqual(["error"]);
  });

  it("ok is the only no-signal result", () => {
    const noSignal = CAG_COMPILE_RESULTS.filter(
      (r) => !CAG_COMPILE_RESULT_METADATA[r].hasSignal,
    );
    expect(noSignal).toEqual(["ok"]);
  });

  it("hasSignal + !producedBlock implies error", () => {
    for (const r of CAG_COMPILE_RESULTS) {
      const md = CAG_COMPILE_RESULT_METADATA[r];
      if (md.hasSignal && !md.producedBlock) {
        expect(r).toBe("error");
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const r of CAG_COMPILE_RESULTS) {
      labels.add(CAG_COMPILE_RESULT_METADATA[r].label);
    }
    expect(labels.size).toBe(CAG_COMPILE_RESULTS.length);
  });
});
