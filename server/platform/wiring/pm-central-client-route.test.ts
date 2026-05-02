/**
 * AWI — PM Central client-route wiring.
 *
 * After the PM Central capsule migration, every server-declared PM
 * Central route must be classified `wired` even though App.tsx no
 * longer mounts them directly: the client manifest declares
 * `baseRoute: "/pm"` + `capsuleEntrypoint`, and the AWI builder
 * counts every server-declared path under that subtree as covered
 * by the capsule.
 *
 * If this test fails, the most likely cause is a regression in
 * `server/platform/modules/wiring-inventory.ts → parseRoutes` —
 * specifically the capsule-aware extension of `clientRegistered`.
 *
 * Mirrors `communication-client-route.test.ts` and
 * `data-analysis-client-route.test.ts` so the third migrated capsule
 * is held to the same AWI bar.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — PM Central client-route", () => {
  const matrix = buildWiringMatrix();
  const pm = matrix.modules.find((m) => m.moduleKey === "pmCentral");

  it("is present in the inventory", () => {
    expect(pm).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = pm!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for pmCentral").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("pmCentral readiness is fully-wired with no blockers", () => {
    expect(pm!.readinessStatus).toBe("fully-wired");
    expect(pm!.blockers).toEqual([]);
  });

  it("communication remains fully-wired (regression guard)", () => {
    const comm = matrix.modules.find((m) => m.moduleKey === "communication");
    expect(comm).toBeDefined();
    expect(comm!.readinessStatus).toBe("fully-wired");
    expect(comm!.blockers).toEqual([]);
  });

  it("dataAnalysis remains fully-wired (regression guard)", () => {
    const da = matrix.modules.find((m) => m.moduleKey === "dataAnalysis");
    expect(da).toBeDefined();
    expect(da!.readinessStatus).toBe("fully-wired");
    expect(da!.blockers).toEqual([]);
  });
});
