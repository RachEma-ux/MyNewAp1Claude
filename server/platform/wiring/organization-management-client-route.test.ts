/**
 * AWI — Organization Management client-route wiring.
 *
 * Mirrors the prior capsule client-route tests so the ninth migrated
 * capsule is held to the same AWI bar.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — Organization Management client-route", () => {
  const matrix = buildWiringMatrix();
  const om = matrix.modules.find((m) => m.moduleKey === "organizationManagement");

  it("is present in the inventory", () => {
    expect(om).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = om!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for organizationManagement").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("organizationManagement has no blockers (test+docs gaps are pre-existing AWI areas, not capsule blockers)", () => {
    expect(om!.blockers).toEqual([]);
    expect(["fully-wired", "mostly-wired"]).toContain(om!.readinessStatus);
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

  it.each(["prm", "psm", "hr"])(
    "%s remains wired (mostly-wired or fully-wired)",
    (key) => {
      const m = matrix.modules.find((x) => x.moduleKey === key);
      expect(m).toBeDefined();
      expect(["fully-wired", "mostly-wired"]).toContain(m!.readinessStatus);
      expect(m!.blockers).toEqual([]);
    },
  );
});
