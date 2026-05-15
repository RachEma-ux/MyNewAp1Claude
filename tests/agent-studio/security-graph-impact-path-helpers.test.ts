/**
 * Phase 25 §T-G.19 — canonical impact path helpers lockstep.
 *
 * Tests the three new path-walk helpers complementing
 * getCanonicalImpactPathFromStep / getNextCanonicalImpactStep /
 * getPreviousCanonicalImpactStep.
 */

import { describe, it, expect } from "vitest";
import {
  SECURITY_GRAPH_CANONICAL_IMPACT_PATH,
  getCanonicalImpactPathToStep,
  getCanonicalImpactSubPath,
  getCanonicalImpactDistance,
} from "../../server/agent-studio/services/security-graph/public-api.js";

describe("getCanonicalImpactPathToStep (T-G.19)", () => {
  it("returns [cve, package] for endStep='package'", () => {
    expect(getCanonicalImpactPathToStep("package")).toEqual([
      "cve",
      "package",
    ]);
  });

  it("returns [cve] for endStep='cve' (single-step)", () => {
    expect(getCanonicalImpactPathToStep("cve")).toEqual(["cve"]);
  });

  it("returns the full path for endStep='customer_exposure'", () => {
    expect(getCanonicalImpactPathToStep("customer_exposure")).toEqual(
      SECURITY_GRAPH_CANONICAL_IMPACT_PATH,
    );
  });

  it("throws on unknown step", () => {
    expect(() =>
      // @ts-expect-error — intentionally bad value
      getCanonicalImpactPathToStep("totally_made_up"),
    ).toThrow();
  });
});

describe("getCanonicalImpactSubPath (T-G.19)", () => {
  it("returns the inclusive slice [package, component, service]", () => {
    expect(getCanonicalImpactSubPath("package", "service")).toEqual([
      "package",
      "component",
      "service",
    ]);
  });

  it("returns single-step when start == end", () => {
    expect(getCanonicalImpactSubPath("component", "component")).toEqual([
      "component",
    ]);
  });

  it("throws when start > end (reversed)", () => {
    expect(() =>
      getCanonicalImpactSubPath("customer_exposure", "package"),
    ).toThrow(/must precede/);
  });

  it("throws on unknown start or end", () => {
    expect(() =>
      // @ts-expect-error — intentionally bad value
      getCanonicalImpactSubPath("bad", "package"),
    ).toThrow();
    expect(() =>
      // @ts-expect-error — intentionally bad value
      getCanonicalImpactSubPath("package", "bad"),
    ).toThrow();
  });
});

describe("getCanonicalImpactDistance (T-G.19)", () => {
  it("returns 0 for same step", () => {
    expect(getCanonicalImpactDistance("cve", "cve")).toBe(0);
  });

  it("returns positive when b later than a", () => {
    expect(getCanonicalImpactDistance("cve", "package")).toBe(1);
    expect(getCanonicalImpactDistance("cve", "service")).toBe(3);
  });

  it("returns negative when b earlier than a", () => {
    expect(getCanonicalImpactDistance("service", "cve")).toBe(-3);
  });

  it("returns null when either side is unknown", () => {
    expect(getCanonicalImpactDistance("not_a_step", "cve")).toBeNull();
    expect(getCanonicalImpactDistance("cve", "not_a_step")).toBeNull();
    expect(getCanonicalImpactDistance("bad", "also_bad")).toBeNull();
  });
});
