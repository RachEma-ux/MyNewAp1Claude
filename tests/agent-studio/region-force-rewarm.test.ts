/**
 * Region admin `forceRewarm` mutation + UI — PR-V1-176.
 *
 * Symmetric with #925/#926 canvas drain `forceTick`. Operators can
 * trigger an immediate cache re-warm instead of waiting for the
 * 10-min cron (#906).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-176 — region forceRewarm mutation + UI", () => {
  const routerFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/region-admin-router.ts",
  );
  const panelFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );

  it("router imports warmRegionRoutingCache + exposes forceRewarm mutation", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(src).toContain(
      'import { warmRegionRoutingCache } from "./workspace-region-cache.js"',
    );
    expect(/forceRewarm:\s*adminProcedure\.mutation\(/.test(src)).toBe(true);
    expect(/await\s+warmRegionRoutingCache\(\)/.test(src)).toBe(true);
  });

  it("router returns the 4-field summary shape", () => {
    const src = readFileSync(routerFile, "utf8");
    for (const field of [
      "activeRegionCount",
      "pinCount",
      "primaryRegionKey",
      "lastWarmedAt",
    ]) {
      expect(src).toContain(`${field}:`);
    }
  });

  it("panel wires forceRewarm mutation + invalidates cache/regions/pins on success", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.region.forceRewarm.useMutation",
    );
    expect(src).toContain(
      "utils.agentStudio.region.getCacheStatus.invalidate()",
    );
    expect(src).toContain(
      "utils.agentStudio.region.listActiveRegions.invalidate()",
    );
    expect(src).toContain(
      "utils.agentStudio.region.listPins.invalidate()",
    );
  });

  it("feedback line surfaces counts on success", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(/data\.activeRegionCount/.test(src)).toBe(true);
    expect(/data\.pinCount/.test(src)).toBe(true);
    expect(/data\.primaryRegionKey\s*\?\?/.test(src)).toBe(true);
  });

  it("button has testid + disables while pending", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(src).toContain('data-testid="region-cache-force-rewarm-button"');
    expect(/disabled=\{\s*forceRewarmMutation\.isPending\s*\}/.test(src)).toBe(
      true,
    );
  });

  it("error path sets feedback via Re-warm failed prefix", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(/setRewarmFeedback\(\s*`Re-warm failed:/.test(src)).toBe(true);
  });
});
