/**
 * Phase B §T-X.5 — `summarizeLaneHookRegistry` lockstep.
 *
 * Stable-shape registry aggregator over the extension lane hook
 * registry. Mirrors T-F.12 `summarizeLensRunnerRegistry` (#1068) but
 * adapted to the 3-lane registerable taxonomy + 1-lane `notRegisterable`
 * axis (`tool` is contract-refused).
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  __resetExtensionLaneHooksForTests,
  REGISTERABLE_LANE_HOOK_LANES,
  registerLaneHook,
  summarizeLaneHookRegistry,
} from "../../server/agent-studio/services/extensions/lane-hooks.js";
import { EXTENSION_CAPABILITY_LANES } from "../../server/agent-studio/services/extensions/contracts.js";

afterEach(() => {
  __resetExtensionLaneHooksForTests();
});

describe("summarizeLaneHookRegistry — stable-shape contract", () => {
  it("cold-boot returns 0/3 with all lanes missing", () => {
    const s = summarizeLaneHookRegistry();
    expect(s.totalRegistered).toBe(0);
    expect(s.totalRegisterable).toBe(3);
    expect(s.coveragePercent).toBe(0);
    expect(s.missingLanes).toEqual(["retrieve", "assemble", "compose"]);
    expect(s.registered).toEqual({
      retrieve: false,
      assemble: false,
      compose: false,
    });
  });

  it("registered map carries every registerable lane key on cold boot", () => {
    const s = summarizeLaneHookRegistry();
    for (const lane of REGISTERABLE_LANE_HOOK_LANES) {
      expect(s.registered[lane]).toBe(false);
    }
  });

  it("notRegisterable axis lists `tool` (contract-refused)", () => {
    const s = summarizeLaneHookRegistry();
    expect(s.notRegisterable).toEqual(["tool"]);
  });

  it("single registration flips one lane to true", () => {
    registerLaneHook("retrieve", async () => ({ succeeded: true }));
    const s = summarizeLaneHookRegistry();
    expect(s.totalRegistered).toBe(1);
    expect(s.registered.retrieve).toBe(true);
    expect(s.registered.assemble).toBe(false);
    expect(s.registered.compose).toBe(false);
    expect(s.missingLanes).toEqual(["assemble", "compose"]);
    expect(s.coveragePercent).toBe(33.3);
  });

  it("two-of-three registration reports 66.7%", () => {
    registerLaneHook("retrieve", async () => ({ succeeded: true }));
    registerLaneHook("assemble", async () => ({ succeeded: true }));
    const s = summarizeLaneHookRegistry();
    expect(s.totalRegistered).toBe(2);
    expect(s.coveragePercent).toBe(66.7);
    expect(s.missingLanes).toEqual(["compose"]);
  });

  it("full registration reports 100% with no missing lanes", () => {
    registerLaneHook("retrieve", async () => ({ succeeded: true }));
    registerLaneHook("assemble", async () => ({ succeeded: true }));
    registerLaneHook("compose", async () => ({ succeeded: true }));
    const s = summarizeLaneHookRegistry();
    expect(s.totalRegistered).toBe(3);
    expect(s.coveragePercent).toBe(100);
    expect(s.missingLanes).toEqual([]);
    expect(s.registered).toEqual({
      retrieve: true,
      assemble: true,
      compose: true,
    });
  });

  it("re-registering a lane keeps the registered boolean true (idempotent)", () => {
    registerLaneHook("retrieve", async () => ({ succeeded: true }));
    registerLaneHook("retrieve", async () => ({ succeeded: false }));
    const s = summarizeLaneHookRegistry();
    expect(s.totalRegistered).toBe(1);
    expect(s.registered.retrieve).toBe(true);
  });

  it("missingLanes preserves the declared REGISTERABLE_LANE_HOOK_LANES order", () => {
    registerLaneHook("compose", async () => ({ succeeded: true }));
    const s = summarizeLaneHookRegistry();
    // retrieve before assemble before compose; compose is registered → not in list.
    expect(s.missingLanes).toEqual(["retrieve", "assemble"]);
  });

  it("coveragePercent is rounded to 1 decimal (33.3 for 1/3)", () => {
    registerLaneHook("retrieve", async () => ({ succeeded: true }));
    const s = summarizeLaneHookRegistry();
    expect(s.coveragePercent).toBe(33.3);
    // Sanity: ensure it's not 33.333... or 33
    const asString = String(s.coveragePercent);
    expect(asString.length).toBeLessThanOrEqual(4);
  });
});

describe("REGISTERABLE_LANE_HOOK_LANES — closed-taxonomy invariant", () => {
  it("excludes tool from the registerable set", () => {
    expect(REGISTERABLE_LANE_HOOK_LANES).not.toContain("tool");
  });

  it("contains exactly retrieve / assemble / compose", () => {
    expect(REGISTERABLE_LANE_HOOK_LANES).toEqual([
      "retrieve",
      "assemble",
      "compose",
    ]);
  });

  it("registerable ∪ {tool} mirrors EXTENSION_CAPABILITY_LANES exactly", () => {
    const union = new Set<string>([...REGISTERABLE_LANE_HOOK_LANES, "tool"]);
    const all = new Set<string>(EXTENSION_CAPABILITY_LANES);
    expect(union).toEqual(all);
  });
});
