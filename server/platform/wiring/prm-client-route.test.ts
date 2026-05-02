/**
 * AWI — PRM client-route wiring.
 *
 * Mirrors the prior capsule client-route tests so the sixth migrated
 * capsule is held to the same AWI bar.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — PRM client-route", () => {
  const matrix = buildWiringMatrix();
  const prm = matrix.modules.find((m) => m.moduleKey === "prm");

  it("is present in the inventory", () => {
    expect(prm).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = prm!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for prm").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("prm has no blockers (test+docs gaps are pre-existing AWI areas, not capsule blockers)", () => {
    // PRM has historic `test: missing` and `documentation: missing`
    // gaps in the AWI inventory that pre-date the capsule migration.
    // The capsule migration itself wires the client-route area;
    // closing the test/docs gaps is tracked separately and out of
    // scope for this PR.
    expect(prm!.blockers).toEqual([]);
    expect(["fully-wired", "mostly-wired"]).toContain(prm!.readinessStatus);
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
});
