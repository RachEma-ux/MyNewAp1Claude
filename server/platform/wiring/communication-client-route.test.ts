/**
 * AWI — Communication client-route wiring.
 *
 * After the Communication capsule migration, every server-declared
 * Communication route must be classified `wired` even though
 * App.tsx no longer mounts them directly: the client manifest
 * declares `baseRoute: "/communication"` + `capsuleEntrypoint`, and
 * the AWI builder counts every server-declared path under that
 * subtree as covered by the capsule.
 *
 * If this test fails, the most likely cause is a regression in
 * `server/platform/modules/wiring-inventory.ts → parseRoutes` —
 * specifically the capsule-aware extension of `clientRegistered`.
 */

import { describe, expect, it } from "vitest";
import { buildWiringMatrix } from "./index";

describe("AWI — Communication client-route", () => {
  const matrix = buildWiringMatrix();
  const comm = matrix.modules.find((m) => m.moduleKey === "communication");

  it("is present in the inventory", () => {
    expect(comm).toBeDefined();
  });

  it("client-route area is wired", () => {
    const area = comm!.areas.find((a) => a.area === "client-route");
    expect(area, "client-route area missing for communication").toBeDefined();
    expect(area!.status).toBe("wired");
  });

  it("communication readiness is fully-wired with no blockers", () => {
    expect(comm!.readinessStatus).toBe("fully-wired");
    expect(comm!.blockers).toEqual([]);
  });
});
