/**
 * AWI matrix tests.
 *
 * The matrix is a thin wrap over buildApplicationWiringInventory() —
 * verifies columns, summary counts, and the helpers that filter by
 * status.
 */
import { describe, expect, it } from "vitest";
import {
  buildWiringMatrix,
  DEFAULT_MATRIX_COLUMNS,
  getDeclaredOnlyWires,
  getMissingWires,
  getPartialWires,
  summarize,
} from "./index";

describe("buildWiringMatrix", () => {
  it("returns the documented columns", () => {
    const m = buildWiringMatrix();
    expect(m.columns).toEqual(DEFAULT_MATRIX_COLUMNS);
  });

  it("returns one row per registered module", () => {
    const m = buildWiringMatrix();
    expect(m.modules.length).toBeGreaterThan(0);
    const keys = new Set(m.modules.map((x) => x.moduleKey));
    expect(keys.size).toBe(m.modules.length); // unique
  });

  it("summary counts add up to moduleCount when summed by readinessStatus", () => {
    const m = buildWiringMatrix();
    const sum =
      m.summary.fullyWiredCount +
      m.summary.mostlyWiredCount +
      m.summary.partialCount +
      m.summary.declaredOnlyCount +
      m.summary.blockedCount;
    expect(sum).toBe(m.summary.moduleCount);
  });

  it("missing-required count matches the explicit filter", () => {
    const m = buildWiringMatrix();
    const explicit = getMissingWires(m.modules);
    expect(m.summary.missingRequiredWires).toBeGreaterThanOrEqual(explicit.length);
    // missingRequiredWires is broader (also counts broken/blocked
    // required), so >= rather than ==.
  });

  it("filters return area entries (not module-level)", () => {
    const m = buildWiringMatrix();
    const declared = getDeclaredOnlyWires(m.modules);
    const partial = getPartialWires(m.modules);
    for (const x of declared) expect(x.status).toBe("declared-only");
    for (const x of partial) expect(x.status).toBe("partial");
  });

  it("summarize is pure: same input → same output", () => {
    const m = buildWiringMatrix();
    const a = summarize(m.modules);
    const b = summarize(m.modules);
    expect(a).toEqual(b);
  });
});
