/**
 * Phase G §T-G.58 — Runtime dispatch-result metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RUNTIME_DISPATCH_RESULTS,
  RUNTIME_DISPATCH_RESULT_METADATA,
  getRuntimeDispatchResultMetadata,
} from "../../server/agent-studio/services/runtime/trace-writer.js";

describe("RUNTIME_DISPATCH_RESULT_METADATA (T-G.58)", () => {
  it("has metadata for every closed-taxonomy result", () => {
    for (const r of RUNTIME_DISPATCH_RESULTS) {
      expect(RUNTIME_DISPATCH_RESULT_METADATA[r]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RUNTIME_DISPATCH_RESULT_METADATA).length).toBe(
      RUNTIME_DISPATCH_RESULTS.length,
    );
  });

  it.each(RUNTIME_DISPATCH_RESULTS)(
    "%s has non-empty label + description + boolean attempted + boolean successful",
    (r) => {
      const md = RUNTIME_DISPATCH_RESULT_METADATA[r];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.attempted).toBe("boolean");
      expect(typeof md.successful).toBe("boolean");
    },
  );

  it.each(RUNTIME_DISPATCH_RESULTS)(
    "getRuntimeDispatchResultMetadata(%s) returns table entry",
    (r) => {
      expect(getRuntimeDispatchResultMetadata(r)).toBe(
        RUNTIME_DISPATCH_RESULT_METADATA[r],
      );
    },
  );

  it("ok + error are exactly the attempted results", () => {
    const attempted = new Set(
      RUNTIME_DISPATCH_RESULTS.filter(
        (r) => RUNTIME_DISPATCH_RESULT_METADATA[r].attempted,
      ),
    );
    expect(attempted).toEqual(new Set(["ok", "error"]));
  });

  it("ok is the only successful result", () => {
    const success = RUNTIME_DISPATCH_RESULTS.filter(
      (r) => RUNTIME_DISPATCH_RESULT_METADATA[r].successful,
    );
    expect(success).toEqual(["ok"]);
  });

  it("successful implies attempted", () => {
    for (const r of RUNTIME_DISPATCH_RESULTS) {
      const md = RUNTIME_DISPATCH_RESULT_METADATA[r];
      if (md.successful) {
        expect(md.attempted).toBe(true);
      }
    }
  });

  it("blocked is the only result that is both !attempted AND !successful", () => {
    const both = RUNTIME_DISPATCH_RESULTS.filter(
      (r) =>
        !RUNTIME_DISPATCH_RESULT_METADATA[r].attempted &&
        !RUNTIME_DISPATCH_RESULT_METADATA[r].successful,
    );
    expect(both).toEqual(["blocked"]);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const r of RUNTIME_DISPATCH_RESULTS) {
      labels.add(RUNTIME_DISPATCH_RESULT_METADATA[r].label);
    }
    expect(labels.size).toBe(RUNTIME_DISPATCH_RESULTS.length);
  });
});
