/**
 * Region rewarm cron field correctness fix + lastResult surface — PR-V1-202.
 *
 * Same class of bug as #951 (graph-health). The RegionAdminPanel
 * `Re-warm cron` card referenced `cronQ.data.cronExpr` but
 * `RetentionCronStatus` has no such field; the cell silently
 * rendered the `??` fallback `"(default)"` no matter what the
 * actual cron was. Plus surfaces the previously-unrendered
 * `lastResult` aggregate fields (`RegionCacheRewarmCronResult`:
 * `scope` / `warmedAt` / `activeRegionCount` / `pinCount` /
 * `primaryRegionKey`).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-202 — region rewarm cron field correctness + lastResult fields", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );
  const cronType = resolve(
    __dirname,
    "../../server/agent-studio/services/region/region-cache-rewarm-cron.ts",
  );
  const retentionCron = resolve(
    __dirname,
    "../../server/agent-studio/services/retention/make-retention-cron.ts",
  );

  it("panel no longer references the non-existent cronExpr field", () => {
    const src = readFileSync(panel, "utf8");
    // Specifically the rewarm cron card — not other queries.
    expect(/cronQ\.data\.cronExpr/.test(src)).toBe(false);
    expect(src).toContain('data-testid="region-rewarm-cron-grid"');
  });

  it("panel renders all 5 RegionCacheRewarmCronResult fields", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("cronQ.data.lastResult.scope");
    expect(src).toContain("cronQ.data.lastResult.warmedAt");
    expect(src).toContain("cronQ.data.lastResult.activeRegionCount");
    expect(src).toContain("cronQ.data.lastResult.pinCount");
    expect(src).toContain("cronQ.data.lastResult.primaryRegionKey");
  });

  it("contract anchor: RegionCacheRewarmCronResult still has those 5 fields", () => {
    const src = readFileSync(cronType, "utf8");
    expect(/scope:\s*string/.test(src)).toBe(true);
    expect(/warmedAt:\s*string/.test(src)).toBe(true);
    expect(/activeRegionCount:\s*number/.test(src)).toBe(true);
    expect(/pinCount:\s*number/.test(src)).toBe(true);
    expect(/primaryRegionKey:\s*string\s*\|\s*null/.test(src)).toBe(true);
  });

  it("contract anchor: RetentionCronStatus has the 3 fields the UI now references", () => {
    const src = readFileSync(retentionCron, "utf8");
    // The bug: the UI assumed cronExpr existed, but the type
    // surface is just these 3 fields.
    expect(
      /export\s+interface\s+RetentionCronStatus<TResult>\s*\{[\s\S]*?lastRunAt:\s*Date\s*\|\s*null/.test(
        src,
      ),
    ).toBe(true);
    expect(/lastResult:\s*TResult\s*\|\s*null/.test(src)).toBe(true);
    expect(/lastError:\s*string\s*\|\s*null/.test(src)).toBe(true);
  });
});
