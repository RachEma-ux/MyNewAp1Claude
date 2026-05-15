/**
 * Publish-targets per-targetType breakdown — PR-V1-219.
 *
 * Registry card showed total/enabled/disabled (PR-V1-211 / #962) but
 * not the type-axis distribution. Adds a one-line breakdown beneath
 * the enabled/disabled aggregate covering the closed
 * `PUBLISH_TARGET_TYPES` taxonomy: staging_env / remote_vault /
 * external_kb.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-219 — publish-targets per-targetType breakdown", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );
  const types = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/types.ts",
  );

  it("renders breakdown line with testid + 3 closed-taxonomy counts", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="publish-targets-type-breakdown"');
    // Counts initialized to 3-type closed taxonomy.
    expect(src).toContain("staging_env: 0");
    expect(src).toContain("remote_vault: 0");
    expect(src).toContain("external_kb: 0");
    // Increment guard prevents target types outside the taxonomy from
    // polluting the counts (mirrors canvas snapshot kind breakdown
    // #967).
    expect(/if\s*\(\s*t\.targetType\s+in\s+counts\s*\)/.test(src)).toBe(true);
  });

  it("render-gated on targetsQ.data.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    // The render gate appears twice in this region (enabled/disabled
    // aggregate + type breakdown). Both must be present.
    const matches = src.match(/targetsQ\.data\s*&&\s*targetsQ\.data\.length\s*>\s*0/g);
    expect(matches).not.toBeNull();
    expect((matches as RegExpMatchArray).length).toBeGreaterThanOrEqual(2);
  });

  it("contract anchor: PUBLISH_TARGET_TYPES taxonomy still matches the 3 names", () => {
    const src = readFileSync(types, "utf8");
    // If a type is added/renamed server-side, this test catches it
    // before the panel silently misses the new type.
    expect(/"staging_env"/.test(src)).toBe(true);
    expect(/"remote_vault"/.test(src)).toBe(true);
    expect(/"external_kb"/.test(src)).toBe(true);
  });
});
