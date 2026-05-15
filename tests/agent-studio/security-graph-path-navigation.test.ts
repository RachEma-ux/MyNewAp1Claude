/**
 * Security Graph canonical-path navigation — Phase 25 §T-G.11.
 *
 * Pure-function tests on the 7-step canonical impact path:
 *   cve → package → component → service → environment → owner → customer_exposure
 */

import { describe, it, expect } from "vitest";
import {
  isCanonicalImpactStep,
  getNextCanonicalImpactStep,
  getPreviousCanonicalImpactStep,
  getCanonicalImpactPathFromStep,
  validateImpactPathSequence,
  SECURITY_GRAPH_CANONICAL_IMPACT_PATH,
} from "../../server/agent-studio/services/security-graph/public-api";

describe("isCanonicalImpactStep", () => {
  it("recognizes all 7 canonical steps", () => {
    for (const step of SECURITY_GRAPH_CANONICAL_IMPACT_PATH) {
      expect(isCanonicalImpactStep(step)).toBe(true);
    }
  });

  it("rejects non-canonical security node types", () => {
    expect(isCanonicalImpactStep("security_finding")).toBe(false);
    expect(isCanonicalImpactStep("policy")).toBe(false);
    expect(isCanonicalImpactStep("control")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isCanonicalImpactStep(undefined)).toBe(false);
    expect(isCanonicalImpactStep(null)).toBe(false);
    expect(isCanonicalImpactStep(123)).toBe(false);
  });
});

describe("getNextCanonicalImpactStep", () => {
  it("advances cve → package", () => {
    expect(getNextCanonicalImpactStep("cve")).toBe("package");
  });

  it("advances through all intermediate steps", () => {
    expect(getNextCanonicalImpactStep("package")).toBe("component");
    expect(getNextCanonicalImpactStep("component")).toBe("service");
    expect(getNextCanonicalImpactStep("service")).toBe("environment");
    expect(getNextCanonicalImpactStep("environment")).toBe("owner");
    expect(getNextCanonicalImpactStep("owner")).toBe("customer_exposure");
  });

  it("returns null at the terminal step (customer_exposure)", () => {
    expect(getNextCanonicalImpactStep("customer_exposure")).toBe(null);
  });
});

describe("getPreviousCanonicalImpactStep", () => {
  it("returns null at the origin step (cve)", () => {
    expect(getPreviousCanonicalImpactStep("cve")).toBe(null);
  });

  it("retreats through all intermediate steps", () => {
    expect(getPreviousCanonicalImpactStep("package")).toBe("cve");
    expect(getPreviousCanonicalImpactStep("component")).toBe("package");
    expect(getPreviousCanonicalImpactStep("service")).toBe("component");
    expect(getPreviousCanonicalImpactStep("environment")).toBe("service");
    expect(getPreviousCanonicalImpactStep("owner")).toBe("environment");
    expect(getPreviousCanonicalImpactStep("customer_exposure")).toBe("owner");
  });
});

describe("getCanonicalImpactPathFromStep", () => {
  it("from origin returns the full 7-step path", () => {
    expect(getCanonicalImpactPathFromStep("cve")).toEqual(
      SECURITY_GRAPH_CANONICAL_IMPACT_PATH,
    );
  });

  it("from a mid step returns the remaining steps inclusive of start", () => {
    expect(getCanonicalImpactPathFromStep("service")).toEqual([
      "service",
      "environment",
      "owner",
      "customer_exposure",
    ]);
  });

  it("from the terminal step returns just the terminal", () => {
    expect(getCanonicalImpactPathFromStep("customer_exposure")).toEqual([
      "customer_exposure",
    ]);
  });
});

describe("validateImpactPathSequence — valid sequences", () => {
  it("accepts the full canonical path", () => {
    expect(
      validateImpactPathSequence(
        SECURITY_GRAPH_CANONICAL_IMPACT_PATH as unknown as string[],
      ),
    ).toEqual({ ok: true });
  });

  it("accepts a partial walk from origin", () => {
    expect(
      validateImpactPathSequence(["cve", "package", "component"]),
    ).toEqual({ ok: true });
  });

  it("accepts a partial walk to terminal", () => {
    expect(
      validateImpactPathSequence([
        "service",
        "environment",
        "owner",
        "customer_exposure",
      ]),
    ).toEqual({ ok: true });
  });

  it("accepts a single-step walk", () => {
    expect(validateImpactPathSequence(["component"])).toEqual({ ok: true });
  });
});

describe("validateImpactPathSequence — invalid sequences", () => {
  it("rejects empty sequence", () => {
    expect(validateImpactPathSequence([])).toEqual({
      ok: false,
      reason: "empty_sequence",
    });
  });

  it("rejects unknown step with stepIndex", () => {
    expect(
      validateImpactPathSequence(["cve", "package", "not_a_step"]),
    ).toEqual({
      ok: false,
      reason: "unknown_step",
      stepIndex: 2,
    });
  });

  it("rejects step that doesn't strictly advance (repeat)", () => {
    expect(validateImpactPathSequence(["cve", "package", "package"])).toEqual({
      ok: false,
      reason: "sequence_not_strictly_advancing",
      stepIndex: 2,
    });
  });

  it("rejects step that retreats", () => {
    expect(validateImpactPathSequence(["cve", "package", "cve"])).toEqual({
      ok: false,
      reason: "sequence_not_strictly_advancing",
      stepIndex: 2,
    });
  });

  it("rejects a skipped step", () => {
    expect(validateImpactPathSequence(["cve", "component"])).toEqual({
      ok: false,
      reason: "sequence_skips_steps",
      stepIndex: 1,
    });
  });

  it("rejects unknown step at position 0", () => {
    expect(validateImpactPathSequence(["not_a_step"])).toEqual({
      ok: false,
      reason: "unknown_step",
      stepIndex: 0,
    });
  });
});

describe("get*ImpactStep — input validation", () => {
  it("getNext throws on unrecognized step", () => {
    expect(() =>
      getNextCanonicalImpactStep("bogus" as never),
    ).toThrow();
  });

  it("getPrevious throws on unrecognized step", () => {
    expect(() =>
      getPreviousCanonicalImpactStep("bogus" as never),
    ).toThrow();
  });

  it("getPathFromStep throws on unrecognized step", () => {
    expect(() =>
      getCanonicalImpactPathFromStep("bogus" as never),
    ).toThrow();
  });
});
