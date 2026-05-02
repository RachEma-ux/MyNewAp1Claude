/**
 * AWI — HR client-route wiring.
 *
 * Mirrors the prior capsule client-route tests so the eighth
 * migrated capsule is held to the same AWI bar.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — HR client-route", () => {
  const matrix = buildWiringMatrix();
  const hr = matrix.modules.find((m) => m.moduleKey === "hr");

  it("is present in the inventory", () => {
    expect(hr).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = hr!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for hr").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("hr has no blockers (test+docs gaps are pre-existing AWI areas, not capsule blockers)", () => {
    // HR may have historic test/documentation gaps in the AWI
    // inventory that pre-date the capsule migration — same pattern
    // as PRM (PR #65) and PSM (PR #67). The capsule migration itself
    // wires the client-route area; closing the test/docs gaps is
    // tracked separately and out of scope for this PR.
    expect(hr!.blockers).toEqual([]);
    expect(["fully-wired", "mostly-wired"]).toContain(hr!.readinessStatus);
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

  it.each(["prm", "psm"])(
    "%s remains wired (mostly-wired or fully-wired)",
    (key) => {
      const m = matrix.modules.find((x) => x.moduleKey === key);
      expect(m).toBeDefined();
      expect(["fully-wired", "mostly-wired"]).toContain(m!.readinessStatus);
      expect(m!.blockers).toEqual([]);
    },
  );
});
