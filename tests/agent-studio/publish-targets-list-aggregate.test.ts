/**
 * Publish-targets registry enabled/disabled aggregate — PR-V1-211.
 *
 * Sixth in the aggregate-summary mini-arc (#957-#961/this).
 * Surfaces enabled/disabled split above the registry table so
 * operators see quiesced targets at a glance.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-211 — publish-targets registry enabled/disabled aggregate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );

  it("renders enabled/disabled aggregate line with testid + counters", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      'data-testid="publish-targets-list-aggregate-summary"',
    );
    expect(/if\s*\(\s*t\.enabled\s*\)\s*enabled\s*\+=\s*1/.test(src)).toBe(
      true,
    );
    expect(/else\s*disabled\s*\+=\s*1/.test(src)).toBe(true);
  });

  it("disabled > 0 highlighted in text-destructive", () => {
    const src = readFileSync(panel, "utf8");
    expect(/disabled\s*>\s*0\s*\?\s*"text-destructive"/.test(src)).toBe(true);
  });

  it("render-gated on targetsQ.data.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    expect(/targetsQ\.data\s*&&\s*targetsQ\.data\.length\s*>\s*0/.test(src)).toBe(
      true,
    );
  });
});
