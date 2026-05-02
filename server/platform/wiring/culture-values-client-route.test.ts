/**
 * AWI — Culture & Values client-route wiring.
 *
 * Mirrors the prior capsule client-route tests so the tenth migrated
 * capsule is held to the same AWI bar.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — Culture & Values client-route", () => {
  const matrix = buildWiringMatrix();
  const cv = matrix.modules.find((m) => m.moduleKey === "cultureValues");

  it("is present in the inventory", () => {
    expect(cv).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = cv!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for cultureValues").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("cultureValues has no blockers (test+docs gaps are pre-existing AWI areas, not capsule blockers)", () => {
    expect(cv!.blockers).toEqual([]);
    expect(["fully-wired", "mostly-wired"]).toContain(cv!.readinessStatus);
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

  it.each(["prm", "psm", "hr", "organizationManagement"])(
    "%s remains wired (mostly-wired or fully-wired)",
    (key) => {
      const m = matrix.modules.find((x) => x.moduleKey === key);
      expect(m).toBeDefined();
      expect(["fully-wired", "mostly-wired"]).toContain(m!.readinessStatus);
      expect(m!.blockers).toEqual([]);
    },
  );
});
