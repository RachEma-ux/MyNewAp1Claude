/**
 * AWI — Data Analysis client-route wiring.
 *
 * After the Data Analysis capsule migration, every server-declared
 * Data Analysis route must be classified `wired` even though
 * App.tsx no longer mounts them directly: the client manifest
 * declares `baseRoute: "/data-analysis"` + `capsuleEntrypoint`, and
 * the AWI builder counts every server-declared path under that
 * subtree as covered by the capsule.
 *
 * If this test fails, the most likely cause is a regression in
 * `server/platform/modules/wiring-inventory.ts → parseRoutes` —
 * specifically the capsule-aware extension of `clientRegistered`.
 *
 * Mirrors `communication-client-route.test.ts` so the second
 * migrated capsule is held to the same AWI bar as the pilot.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — Data Analysis client-route", () => {
  const matrix = buildWiringMatrix();
  const da = matrix.modules.find((m) => m.moduleKey === "dataAnalysis");

  it("is present in the inventory", () => {
    expect(da).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = da!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for dataAnalysis").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("dataAnalysis readiness is fully-wired with no blockers", () => {
    expect(da!.readinessStatus).toBe("fully-wired");
    expect(da!.blockers).toEqual([]);
  });

  it("communication remains fully-wired (regression guard)", () => {
    const comm = matrix.modules.find((m) => m.moduleKey === "communication");
    expect(comm).toBeDefined();
    expect(comm!.readinessStatus).toBe("fully-wired");
    expect(comm!.blockers).toEqual([]);
  });
});
