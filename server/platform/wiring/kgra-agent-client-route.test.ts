/**
 * AWI — KGRA Agent client-route wiring.
 *
 * The fifteenth and FINAL migrated capsule. Mirrors the prior
 * capsule client-route tests so KGRA Agent is held to the same AWI
 * bar, and pins the regression guard for every prior capsule.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — KGRA Agent client-route", () => {
  const matrix = buildWiringMatrix();
  const kgra = matrix.modules.find((m) => m.moduleKey === "kgraAgent");

  it("is present in the inventory", () => {
    expect(kgra).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = kgra!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for kgraAgent").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("kgraAgent has no blockers (test+docs gaps are pre-existing AWI areas, not capsule blockers)", () => {
    expect(kgra!.blockers).toEqual([]);
    expect(["fully-wired", "mostly-wired"]).toContain(kgra!.readinessStatus);
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
    "openRouter",
    "agentStudio",
    "sandboxWf",
  ])(
    "%s remains wired (mostly-wired or fully-wired)",
    (key) => {
      const m = matrix.modules.find((x) => x.moduleKey === key);
      expect(m).toBeDefined();
      expect(["fully-wired", "mostly-wired"]).toContain(m!.readinessStatus);
      expect(m!.blockers).toEqual([]);
    },
  );

  it("every RTLM in the matrix is wired or better (full-platform check)", () => {
    const rtlmKeys = [
      "communication",
      "dataAnalysis",
      "pmCentral",
      "codeStudio",
      "ps",
      "prm",
      "psm",
      "hr",
      "organizationManagement",
      "cultureValues",
      "aiTypes",
      "openRouter",
      "agentStudio",
      "sandboxWf",
      "kgraAgent",
    ];
    for (const key of rtlmKeys) {
      const m = matrix.modules.find((x) => x.moduleKey === key);
      expect(m, `${key} missing from AWI matrix`).toBeDefined();
      expect(m!.blockers, `${key} has AWI blockers`).toEqual([]);
      expect(["fully-wired", "mostly-wired"]).toContain(m!.readinessStatus);
    }
  });
});
