/**
 * Graph-skill-usage distinct keys gauge — PR-V1-230.
 *
 * The usage panel renders pack-version granular rows but doesn't
 * surface skill-key uniqueness. A workspace serving 12 calls
 * from 3 distinct skill keys (and 9 pack versions) has a very
 * different shape from 12 calls from 12 distinct keys. Adds a
 * Set-based gauge next to "Total calls" in the page header.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-230 — graph-skill-usage distinct keys", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphSkillUsagePanel.tsx",
  );

  it("renders gauge with testid + Set-based uniqueness via useMemo", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="graph-skill-usage-distinct-keys"');
    expect(/new\s+Set\(rows\.map\(\(r\)\s*=>\s*r\.skillKey\)\)\.size/.test(src)).toBe(
      true,
    );
    expect(/const\s+distinctSkillKeys\s*=\s*useMemo/.test(src)).toBe(true);
  });

  it("render-gated on rows.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    // The gate appears just before the gauge div; allow a larger
    // window because the JSX between them includes a SectionLabel
    // and a `<p>` wrapper.
    expect(
      /rows\.length\s*>\s*0\s*\?[\s\S]{0,500}graph-skill-usage-distinct-keys/.test(
        src,
      ),
    ).toBe(true);
  });

  it("title attribute names duplicate-pack-version interpretation", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "multiple pack versions of the same key served calls",
    );
  });
});
