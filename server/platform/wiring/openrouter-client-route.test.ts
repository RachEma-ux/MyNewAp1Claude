/**
 * AWI — OpenRouter client-route wiring.
 *
 * Mirrors the prior capsule client-route tests so the twelfth
 * migrated capsule is held to the same AWI bar.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — OpenRouter client-route", () => {
  const matrix = buildWiringMatrix();
  const or = matrix.modules.find((m) => m.moduleKey === "openRouter");

  it("is present in the inventory", () => {
    expect(or).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = or!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for openRouter").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("openRouter has no blockers (test+docs gaps are pre-existing AWI areas, not capsule blockers)", () => {
    expect(or!.blockers).toEqual([]);
    expect(["fully-wired", "mostly-wired"]).toContain(or!.readinessStatus);
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

  it.each([
    "prm",
    "psm",
    "hr",
    "organizationManagement",
    "cultureValues",
    "aiTypes",
  ])(
    "%s remains wired (mostly-wired or fully-wired)",
    (key) => {
      const m = matrix.modules.find((x) => x.moduleKey === key);
      expect(m).toBeDefined();
      expect(["fully-wired", "mostly-wired"]).toContain(m!.readinessStatus);
      expect(m!.blockers).toEqual([]);
    },
  );
});
