/**
 * Region pins by-region-key distribution aggregate — PR-V1-218.
 *
 * Multi-region deployments care about how pins are spread across
 * active regions; an unbalanced map signals a missed rebalance.
 * Sorted by pin count desc so the heaviest region shows first.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-218 — region pins by-region distribution aggregate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );

  it("renders by-region distribution line with testid + sort-desc-by-count", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="region-pins-by-region-aggregate"');
    // Builds a Map<regionKey, count> then sorts entries desc by count.
    expect(/byRegion\.set\(\s*p\.regionKey/.test(src)).toBe(true);
    expect(
      /Array\.from\(byRegion\.entries\(\)\)\.sort\(\s*\(a,\s*b\)\s*=>\s*b\[1\]\s*-\s*a\[1\]\s*\)/.test(
        src,
      ),
    ).toBe(true);
    // Slash-separator only after the first entry.
    expect(/i\s*>\s*0\s*\?\s*"\s*\/\s*"\s*:\s*""/.test(src)).toBe(true);
  });

  it("render-gated on pinsQ.data.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    // Two render-gated aggregates exist on the pins surface — the
    // by-region one comes after the replicated/non-replicated.
    const card = src.slice(src.indexOf("region-pins-by-region-aggregate"));
    // Should be enclosed in a guard, not unconditionally rendered.
    const guardSnippet = src.slice(
      Math.max(
        0,
        src.indexOf("region-pins-by-region-aggregate") - 200,
      ),
      src.indexOf("region-pins-by-region-aggregate"),
    );
    expect(/pinsQ\.data\s*&&\s*pinsQ\.data\.length\s*>\s*0/.test(guardSnippet)).toBe(
      true,
    );
    expect(card).toContain("by-region-aggregate");
  });
});
