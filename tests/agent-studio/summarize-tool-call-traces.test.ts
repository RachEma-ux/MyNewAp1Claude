/**
 * Phase G §T-G.63 — `summarizeToolCallTraces` lockstep.
 *
 * Two-axis closed-taxonomy aggregator over `agsToolCallTraces`.
 * 14th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  summarizeToolCallTraces,
  type SummarizeToolCallTracesInput,
} from "../../server/agent-studio/services/runtime/tool-call-trace-summary.js";
import {
  RUNTIME_DISPATCH_RESULTS,
  RUNTIME_VALIDATION_VERDICTS,
} from "../../server/agent-studio/services/runtime/trace-writer.js";

function makeRow(
  overrides: Partial<SummarizeToolCallTracesInput> = {},
): SummarizeToolCallTracesInput {
  return {
    validationVerdict: "ok",
    dispatchResult: null,
    errorMessage: null,
    durationMs: null,
    ...overrides,
  };
}

describe("summarizeToolCallTraces — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeToolCallTraces([]);
    expect(s.total).toBe(0);
    expect(s.nullDispatchResultCount).toBe(0);
    expect(s.attemptedCount).toBe(0);
    expect(s.successfulCount).toBe(0);
    expect(s.attemptSuccessRate).toBeNull();
    expect(s.withErrorMessageCount).toBe(0);
    expect(s.durationStats).toBeNull();
  });

  it("byValidationVerdict carries every closed value at 0", () => {
    const s = summarizeToolCallTraces([]);
    for (const v of RUNTIME_VALIDATION_VERDICTS) {
      expect(s.byValidationVerdict[v]).toBe(0);
    }
  });

  it("byDispatchResult carries every closed value at 0", () => {
    const s = summarizeToolCallTraces([]);
    for (const r of RUNTIME_DISPATCH_RESULTS) {
      expect(s.byDispatchResult[r]).toBe(0);
    }
  });
});

describe("summarizeToolCallTraces — validation verdict axis", () => {
  it("counts each verdict", () => {
    const s = summarizeToolCallTraces([
      makeRow({ validationVerdict: "ok" }),
      makeRow({ validationVerdict: "ok" }),
      makeRow({ validationVerdict: "rejected" }),
    ]);
    expect(s.byValidationVerdict.ok).toBe(2);
    expect(s.byValidationVerdict.rejected).toBe(1);
  });
});

describe("summarizeToolCallTraces — dispatch result + null partition", () => {
  it("counts each dispatch result", () => {
    const s = summarizeToolCallTraces([
      makeRow({ dispatchResult: "ok" }),
      makeRow({ dispatchResult: "error" }),
      makeRow({ dispatchResult: "blocked" }),
    ]);
    expect(s.byDispatchResult.ok).toBe(1);
    expect(s.byDispatchResult.error).toBe(1);
    expect(s.byDispatchResult.blocked).toBe(1);
  });

  it("null dispatchResult counted via separate axis", () => {
    const s = summarizeToolCallTraces([
      makeRow({ dispatchResult: null }),
      makeRow({ dispatchResult: null }),
      makeRow({ dispatchResult: "ok" }),
    ]);
    expect(s.nullDispatchResultCount).toBe(2);
    expect(s.byDispatchResult.ok).toBe(1);
  });

  it("byDispatchResult + nullDispatchResultCount sums to total", () => {
    const s = summarizeToolCallTraces([
      makeRow({ dispatchResult: "ok" }),
      makeRow({ dispatchResult: "error" }),
      makeRow({ dispatchResult: null }),
    ]);
    let sum = 0;
    for (const r of RUNTIME_DISPATCH_RESULTS) sum += s.byDispatchResult[r];
    expect(sum + s.nullDispatchResultCount).toBe(s.total);
  });
});

describe("summarizeToolCallTraces — attempted + successful derivation", () => {
  it("ok + error both count as attempted; blocked does not", () => {
    const s = summarizeToolCallTraces([
      makeRow({ dispatchResult: "ok" }),
      makeRow({ dispatchResult: "error" }),
      makeRow({ dispatchResult: "blocked" }),
    ]);
    expect(s.attemptedCount).toBe(2); // ok + error
    expect(s.successfulCount).toBe(1); // ok only
  });

  it("null dispatch is NOT counted as attempted", () => {
    const s = summarizeToolCallTraces([
      makeRow({ dispatchResult: null }),
      makeRow({ dispatchResult: "ok" }),
    ]);
    expect(s.attemptedCount).toBe(1);
  });

  it("attemptSuccessRate is successfulCount / attemptedCount", () => {
    const s = summarizeToolCallTraces([
      makeRow({ dispatchResult: "ok" }),
      makeRow({ dispatchResult: "ok" }),
      makeRow({ dispatchResult: "ok" }),
      makeRow({ dispatchResult: "error" }),
    ]);
    expect(s.attemptSuccessRate).toBe(75);
  });

  it("attemptSuccessRate is null when no attempts", () => {
    const s = summarizeToolCallTraces([
      makeRow({ dispatchResult: "blocked" }),
      makeRow({ dispatchResult: null }),
    ]);
    expect(s.attemptSuccessRate).toBeNull();
  });
});

describe("summarizeToolCallTraces — gauges", () => {
  it("withErrorMessageCount counts non-null errorMessage", () => {
    const s = summarizeToolCallTraces([
      makeRow({ errorMessage: null }),
      makeRow({ errorMessage: "boom" }),
      makeRow({ errorMessage: "" }),
    ]);
    expect(s.withErrorMessageCount).toBe(2);
  });

  it("durationStats null when no rows have durationMs", () => {
    const s = summarizeToolCallTraces([makeRow({ durationMs: null })]);
    expect(s.durationStats).toBeNull();
  });

  it("durationStats computes over non-null durations", () => {
    const s = summarizeToolCallTraces([
      makeRow({ durationMs: null }),
      makeRow({ durationMs: 100 }),
      makeRow({ durationMs: 200 }),
      makeRow({ durationMs: 300 }),
    ]);
    expect(s.durationStats!.count).toBe(3);
    expect(s.durationStats!.sum).toBe(600);
    expect(s.durationStats!.mean).toBe(200);
    expect(s.durationStats!.min).toBe(100);
    expect(s.durationStats!.max).toBe(300);
  });
});

describe("summarizeToolCallTraces — realistic mixed trace batch", () => {
  it("renders the operator-dashboard rollup correctly", () => {
    const s = summarizeToolCallTraces([
      // 2 validator rejections (no dispatch).
      makeRow({ validationVerdict: "rejected" }),
      makeRow({ validationVerdict: "rejected" }),
      // 3 ok dispatches (success).
      makeRow({ validationVerdict: "ok", dispatchResult: "ok", durationMs: 100 }),
      makeRow({ validationVerdict: "ok", dispatchResult: "ok", durationMs: 200 }),
      makeRow({ validationVerdict: "ok", dispatchResult: "ok", durationMs: 300 }),
      // 1 error dispatch (attempted, failed).
      makeRow({
        validationVerdict: "ok",
        dispatchResult: "error",
        errorMessage: "boom",
        durationMs: 50,
      }),
      // 1 blocked dispatch (governance refused).
      makeRow({ validationVerdict: "ok", dispatchResult: "blocked" }),
    ]);
    expect(s.total).toBe(7);
    expect(s.byValidationVerdict.ok).toBe(5);
    expect(s.byValidationVerdict.rejected).toBe(2);
    expect(s.byDispatchResult.ok).toBe(3);
    expect(s.byDispatchResult.error).toBe(1);
    expect(s.byDispatchResult.blocked).toBe(1);
    expect(s.nullDispatchResultCount).toBe(2); // rejections
    expect(s.attemptedCount).toBe(4); // ok + error
    expect(s.successfulCount).toBe(3); // ok only
    expect(s.attemptSuccessRate).toBe(75);
    expect(s.withErrorMessageCount).toBe(1);
    expect(s.durationStats!.count).toBe(4);
  });
});
