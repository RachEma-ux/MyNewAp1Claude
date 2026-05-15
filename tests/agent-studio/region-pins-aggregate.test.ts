/**
 * Region pins replicated/non-replicated aggregate — PR-V1-209.
 *
 * Fourth in the aggregate-summary mini-arc (#957/#958/#959/this).
 * The cache status grid shows total pin count but not the
 * replicated vs non-replicated split; this line fills that gap
 * above the pins table.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-209 — region pins replicated/non-replicated aggregate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );

  it("renders pins-aggregate line with testid + replicated/non-replicated split", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="region-pins-aggregate-summary"');
    expect(/p\.isReplicated/.test(src)).toBe(true);
    expect(/replicated\s*\+=\s*1/.test(src)).toBe(true);
    expect(/nonReplicated\s*\+=\s*1/.test(src)).toBe(true);
  });

  it("render-gated on pinsQ.data.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    expect(/pinsQ\.data\s*&&\s*pinsQ\.data\.length\s*>\s*0/.test(src)).toBe(
      true,
    );
  });
});
