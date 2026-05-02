/**
 * PM Central — event constants surface test.
 */
import { describe, it, expect } from "vitest";
import { PM_CENTRAL_EVENTS } from "../events";
import { pmCentralManifest } from "../manifest";

describe("PM_CENTRAL_EVENTS", () => {
  it("declares the sixteen known event types", () => {
    expect(Object.keys(PM_CENTRAL_EVENTS).length).toBe(16);
  });

  it("every event constant is namespaced under pm.*", () => {
    for (const v of Object.values(PM_CENTRAL_EVENTS)) {
      expect(v.startsWith("pm.")).toBe(true);
    }
  });

  it("manifest emits matches event constants", () => {
    const declared = new Set(pmCentralManifest.events?.emits ?? []);
    const constants = new Set(Object.values(PM_CENTRAL_EVENTS));
    expect([...constants].sort()).toEqual([...declared].sort());
  });
});
