/**
 * Graph health cron status field fix — PR-V1-200.
 *
 * Correctness fix on #941: the panel referenced
 * `lastResult.scanned` but the actual `HealthAlertCronResult`
 * field is `decisionCount`. Plus surfacing the previously-
 * unrendered `scope` / `scannedAt` / `status` / `latencyMs`
 * fields. Source-scan asserts the correct field names.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-200 — graph health cron field correctness", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
  );
  const cronType = resolve(
    __dirname,
    "../../server/agent-studio/services/graph/health-alert-cron.ts",
  );

  it("panel references the actual HealthAlertCronResult fields", () => {
    const src = readFileSync(panel, "utf8");
    // The 7 actual fields on HealthAlertCronResult.
    expect(src).toContain("lastResult.decisionCount");
    expect(src).toContain("lastResult.raised");
    expect(src).toContain("lastResult.resolved");
    expect(src).toContain("lastResult.scope");
    expect(src).toContain("lastResult.status");
    expect(src).toContain("lastResult.latencyMs");
    expect(src).toContain("lastResult.scannedAt");
    // The wrong field name (the bug we're fixing) is gone.
    expect(/lastResult\.scanned\b/.test(src)).toBe(false);
  });

  it("the server-side type carries the fields we just wired up", () => {
    const src = readFileSync(cronType, "utf8");
    // Sanity check the contract still matches what the UI now
    // expects (this is the bug-prevention assertion — if the
    // server-side rename happens, this test fails first).
    expect(/decisionCount:\s*number/.test(src)).toBe(true);
    expect(/raised:\s*number/.test(src)).toBe(true);
    expect(/resolved:\s*number/.test(src)).toBe(true);
    expect(/scope:\s*string/.test(src)).toBe(true);
    expect(/scannedAt:\s*string/.test(src)).toBe(true);
    expect(/latencyMs\?:\s*number/.test(src)).toBe(true);
  });
});
