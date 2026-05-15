/**
 * Phase 22 §T-I.5 batch B.4 — Promotion lifecycle → bridge.
 *
 * Source-scan structural test asserting `PromotionLifecycle.submit`
 * (validation reject) and `.reject` (operator reject) both emit
 * `promotion_failed` with distinguishable `rejectionStage` metadata.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const lifecyclePath = resolve(
  __dirname,
  "../../server/agent-studio/services/promotion/lifecycle.ts",
);

describe("promotion lifecycle is wired into the bridge", () => {
  const src = readFileSync(lifecyclePath, "utf8");

  it("imports recordFailureStateEvent", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it("submit() validation-reject path emits promotion_failed", () => {
    // The submit method has `if (!validation.ok)` then emits inside.
    expect(src).toMatch(
      /if\s*\(\s*!validation\.ok\s*\)\s*\{[\s\S]{0,1000}failureState:\s*"promotion_failed"/,
    );
  });

  it("submit() emission carries rejectionStage: 'validation'", () => {
    expect(src).toContain('rejectionStage: "validation"');
  });

  it("submit() emission carries errorFields list for triage", () => {
    expect(src).toContain("errorFields: validation.errors.map");
  });

  it("reject() path emits promotion_failed with rejectionStage: 'operator'", () => {
    expect(src).toContain('rejectionStage: "operator"');
    // The operator-rejection emission lives in the .reject method;
    // it references promotionId and decidedByUserId.
    const idxReject = src.indexOf("async reject(");
    const idxOperatorStage = src.indexOf('rejectionStage: "operator"');
    expect(idxOperatorStage).toBeGreaterThan(idxReject);
  });

  it("both emissions use fire-and-forget envelope", () => {
    // At least two void recordFailureStateEvent(...).catch envelopes.
    const matches = src.match(/void recordFailureStateEvent[\s\S]{0,800}\.catch/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
