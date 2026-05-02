/**
 * AWI — Sandbox WF client-route wiring.
 *
 * Mirrors the prior capsule client-route tests so the fourteenth
 * migrated capsule is held to the same AWI bar.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — Sandbox WF client-route", () => {
  const matrix = buildWiringMatrix();
  const swf = matrix.modules.find((m) => m.moduleKey === "sandboxWf");

  it("is present in the inventory", () => {
    expect(swf).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = swf!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for sandboxWf").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("sandboxWf has no blockers (test+docs gaps are pre-existing AWI areas, not capsule blockers)", () => {
    expect(swf!.blockers).toEqual([]);
    expect(["fully-wired", "mostly-wired"]).toContain(swf!.readinessStatus);
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
