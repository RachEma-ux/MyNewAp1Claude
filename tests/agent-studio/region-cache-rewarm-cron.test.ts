/**
 * Region cache re-warm cron tests — V2 Phase MR-1 Phase-2 seventh slice.
 * PR-V1-155.
 *
 * Source-scan only. Behavioral coverage of `makeRetentionCron`
 * itself is in the retention-cron factory's own tests; this file
 * verifies the new cron wraps it with the expected log prefix /
 * env prefix / cadence / sweep composition + that boot.ts wires
 * Step 3.33.
 *
 * Covers:
 *   - Cron config: logPrefix, envPrefix, defaultCronExpr ('*/10 * * * *'),
 *     buildSweepInput, runSweep delegates to warmRegionRoutingCache,
 *     formatSweepLogTail shape.
 *   - Exports: tickRegionCacheRewarmCron / getRegionCacheRewarmCronStatus /
 *     ensureRegionCacheRewarmCronStarted / DEFAULT_REGION_CACHE_REWARM_CRON_EXPR.
 *   - Public-api barrel re-exports.
 *   - boot.ts wires Step 3.33 with the standard try/import/ensureStarted shape.
 *   - Hard-rule compliance.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-1 Phase-2 — region cache re-warm cron source-scan", () => {
  const cronFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/region-cache-rewarm-cron.ts",
  );
  const bootFile = resolve(__dirname, "../../server/agent-studio/boot.ts");
  const barrelFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/public-api.ts",
  );

  it("cron file uses makeRetentionCron with the expected config", () => {
    const src = readFileSync(cronFile, "utf8");
    expect(/logPrefix:\s*"ags-region-cache-rewarm-cron"/.test(src)).toBe(true);
    expect(/envPrefix:\s*"AGS_REGION_CACHE_REWARM"/.test(src)).toBe(true);
    expect(/defaultCronExpr:\s*"\*\/10 \* \* \* \*"/.test(src)).toBe(true);
    expect(/defaultRetentionDays:\s*null/.test(src)).toBe(true);
    expect(/runWarm\s*\?\?\s*warmRegionRoutingCache/.test(src)).toBe(true);
    expect(/await\s+runWarm\s*\(\s*\)/.test(src)).toBe(true);
  });

  it("cron file exports the standard cron API", () => {
    const src = readFileSync(cronFile, "utf8");
    expect(src).toContain(
      "export const DEFAULT_REGION_CACHE_REWARM_CRON_EXPR",
    );
    expect(src).toContain("export const tickRegionCacheRewarmCron");
    expect(src).toContain("export const getRegionCacheRewarmCronStatus");
    expect(src).toContain("export const ensureRegionCacheRewarmCronStarted");
    expect(src).toContain("export const _resetRegionCacheRewarmCronForTests");
  });

  it("public-api barrel re-exports the cron API + types", () => {
    const src = readFileSync(barrelFile, "utf8");
    expect(src).toContain("./region-cache-rewarm-cron.js");
    expect(src).toContain("DEFAULT_REGION_CACHE_REWARM_CRON_EXPR");
    expect(src).toContain("tickRegionCacheRewarmCron");
    expect(src).toContain("getRegionCacheRewarmCronStatus");
    expect(src).toContain("ensureRegionCacheRewarmCronStarted");
    expect(src).toContain("RegionCacheRewarmCronInput");
    expect(src).toContain("RegionCacheRewarmCronResult");
    expect(src).toContain("RegionCacheRewarmCronStatus");
  });

  it("boot.ts wires Step 3.33 with the standard try/import/ensureStarted shape", () => {
    const src = readFileSync(bootFile, "utf8");
    expect(src).toContain("Step 3.33");
    expect(src).toContain("region cache re-warm");
    expect(src).toContain(
      'await import(\n      "./services/region/region-cache-rewarm-cron"',
    );
    expect(src).toContain("ensureRegionCacheRewarmCronStarted()");
    expect(src).toContain("[ags-region-cache-rewarm-cron] start skipped");
  });

  it("hard-rule compliance on the cron file", () => {
    const src = readFileSync(cronFile, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
