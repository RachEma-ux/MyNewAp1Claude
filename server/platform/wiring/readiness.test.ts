/**
 * AWI readiness-scoring tests.
 *
 * Pure unit tests against `computeReadiness` — no fs / no real
 * inventory.
 */
import { describe, expect, it } from "vitest";
import { computeReadiness, AREA_WEIGHTS } from "./readiness";
import type { ModuleWiringAreaStatus } from "./types";

function area(
  partial: Partial<ModuleWiringAreaStatus> & { area: ModuleWiringAreaStatus["area"]; status: ModuleWiringAreaStatus["status"] },
): ModuleWiringAreaStatus {
  return {
    moduleKey: "test",
    score: 100,
    severity: "none",
    required: false,
    evidence: [],
    missing: [],
    ...partial,
  } as ModuleWiringAreaStatus;
}

describe("computeReadiness", () => {
  it("excludes not-applicable areas from the denominator", () => {
    const r = computeReadiness([
      area({ area: "manifest", status: "wired", score: 100, required: true }),
      area({ area: "database", status: "not-applicable", score: 0 }),
    ]);
    expect(r.score).toBe(100);
  });

  it("required missing area lowers the score", () => {
    const r = computeReadiness([
      area({ area: "manifest", status: "wired", score: 100, required: true }),
      area({ area: "database", status: "missing", score: 0, required: true }),
    ]);
    expect(r.score).toBeLessThan(100);
    expect(r.blockers.length).toBe(1);
  });

  it("required broken area adds a blocker", () => {
    const r = computeReadiness([
      area({ area: "database", status: "broken", score: 0, required: true }),
    ]);
    expect(r.blockers.length).toBe(1);
  });

  it("declared-only optional area becomes a warning, not a blocker", () => {
    const r = computeReadiness([
      area({ area: "manifest", status: "wired", score: 100, required: true }),
      area({ area: "event", status: "declared-only", score: 25, required: false }),
    ]);
    expect(r.blockers.length).toBe(0);
    expect(r.warnings.length).toBe(1);
  });

  it("partial area gives partial credit", () => {
    const r = computeReadiness([
      area({ area: "public-api", status: "partial", score: 50, required: true }),
    ]);
    expect(r.score).toBe(50);
    expect(r.warnings.length).toBe(1);
  });

  it("fully-wired bucket requires score >= 90", () => {
    // 100 in every required area.
    const areas: ModuleWiringAreaStatus[] = (
      ["manifest", "server-router", "database", "permission", "governance", "runtime", "test"] as const
    ).map((a) => area({ area: a, status: "wired", score: 100, required: true }));
    const r = computeReadiness(areas);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.status).toBe("fully-wired");
  });

  it("with score < 50 and at least 1 blocker → blocked", () => {
    const r = computeReadiness([
      area({ area: "manifest", status: "missing", score: 0, required: true }),
      area({ area: "database", status: "missing", score: 0, required: true }),
    ]);
    expect(r.status).toBe("blocked");
  });

  it("AREA_WEIGHTS covers every documented area exactly once", () => {
    const keys = Object.keys(AREA_WEIGHTS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(17);
  });
});
