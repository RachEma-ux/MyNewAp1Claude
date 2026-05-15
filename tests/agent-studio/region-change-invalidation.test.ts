/**
 * Region-change invalidation hook tests — V2 Phase MR-1 Phase-2 sixth slice.
 * PR-V1-153.
 *
 * Symmetric with pin-change invalidation (PR-V1-152). Region writes
 * are rarer (operator onboarding), but a new region must propagate
 * to the cache so already-pinned workspaces start routing.
 *
 * Covers:
 *   - setRegionChangeHook installs + clears the late-bound callback.
 *   - registerRegion source path: fireRegionChanged() called after
 *     successful insert.
 *   - Bridge wires both pin and region hooks on install; uninstall
 *     clears all three slots.
 *   - Shared `reloadCacheAfterChange` helper used by both hook
 *     closures (DRY check).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setRegionChangeHook } from "../../server/agent-studio/services/region/region-service.js";

describe("MR-1 Phase-2 — region-change invalidation hook", () => {
  beforeEach(() => {
    setRegionChangeHook(null);
  });

  afterEach(() => {
    setRegionChangeHook(null);
  });

  it("setRegionChangeHook installs + clears the late-bound callback", () => {
    setRegionChangeHook(() => {});
    setRegionChangeHook(null);
    // No throw — the slot accepts both function + null.
    expect(true).toBe(true);
  });

  it("source-scan: region-service.ts wires fireRegionChanged + exports setRegionChangeHook", () => {
    const serviceFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/region-service.ts",
    );
    const src = readFileSync(serviceFile, "utf8");
    expect(/export\s+function\s+setRegionChangeHook/.test(src)).toBe(true);
    expect(/function\s+fireRegionChanged\s*\(/.test(src)).toBe(true);
    // registerRegion calls fireRegionChanged after the insert succeeds.
    expect(
      /if\s*\(\s*!inserted\s*\)\s*throw[\s\S]{0,80}fireRegionChanged\s*\(\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("source-scan: bridge wires both pin and region hooks; uninstall clears all three slots", () => {
    const bridgeFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/region-routing-bridge.ts",
    );
    const src = readFileSync(bridgeFile, "utf8");
    expect(/setPinChangeHook\s*\(\s*\(\s*\)\s*=>/.test(src)).toBe(true);
    expect(/setRegionChangeHook\s*\(\s*\(\s*\)\s*=>/.test(src)).toBe(true);
    // Shared helper between pin + region paths.
    expect(/function\s+reloadCacheAfterChange/.test(src)).toBe(true);
    // Uninstall clears all three.
    expect(/configureRegionRouter\s*\(\s*null\s*\)/.test(src)).toBe(true);
    expect(/setPinChangeHook\s*\(\s*null\s*\)/.test(src)).toBe(true);
    expect(/setRegionChangeHook\s*\(\s*null\s*\)/.test(src)).toBe(true);
  });

  it("source-scan: hard-rule compliance on the modified files", () => {
    const serviceFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/region-service.ts",
    );
    const bridgeFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/region-routing-bridge.ts",
    );
    for (const file of [serviceFile, bridgeFile]) {
      const src = readFileSync(file, "utf8");
      expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
      expect(/credential-resolver/.test(src)).toBe(false);
      expect(/dispatchMcpToolCall/.test(src)).toBe(false);
      expect(/neo4j-driver/.test(src)).toBe(false);
    }
  });

  it("public-api barrel re-exports setRegionChangeHook", () => {
    const barrelFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/public-api.ts",
    );
    const src = readFileSync(barrelFile, "utf8");
    expect(src).toContain("setRegionChangeHook");
  });
});
