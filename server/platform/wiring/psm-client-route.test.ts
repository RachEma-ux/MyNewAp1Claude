/**
 * AWI — PSM client-route wiring.
 *
 * Mirrors the prior capsule client-route tests so the seventh migrated
 * capsule is held to the same AWI bar.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — PSM client-route", () => {
  const matrix = buildWiringMatrix();
  const psm = matrix.modules.find((m) => m.moduleKey === "psm");

  it("is present in the inventory", () => {
    expect(psm).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = psm!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for psm").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("psm has no blockers (test+docs gaps are pre-existing AWI areas, not capsule blockers)", () => {
    // PSM may have historic `test: missing` and `documentation: missing`
    // gaps in the AWI inventory that pre-date the capsule migration —
    // same pattern as PRM. The capsule migration itself wires the
    // client-route area; closing the test/docs gaps is tracked
    // separately and out of scope for this PR.
    expect(psm!.blockers).toEqual([]);
    expect(["fully-wired", "mostly-wired"]).toContain(psm!.readinessStatus);
  });

  it.each([
    "communication",
    "dataAnalysis",
    "pmCentral",
    "codeStudio",
    "ps",
  ])("%s remains fully-wired (regression guard)", (key) => {
    const m = matrix.modules.find((x) => x.moduleKey === key);
    expect(m).toBeDefined();
    expect(m!.readinessStatus).toBe("fully-wired");
    expect(m!.blockers).toEqual([]);
  });

  it("prm remains wired (mostly-wired or fully-wired)", () => {
    const m = matrix.modules.find((x) => x.moduleKey === "prm");
    expect(m).toBeDefined();
    expect(["fully-wired", "mostly-wired"]).toContain(m!.readinessStatus);
    expect(m!.blockers).toEqual([]);
  });
});
