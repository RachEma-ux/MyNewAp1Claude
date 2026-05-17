/**
 * GraphSkillUsagePanel URL-state + copy-link — T-F.138.
 *
 * Fourth cross-panel URL-deeplink primitive in the agent-studio
 * module — mechanical replication of T-F.135 (lens-browser) onto
 * `skillKeyFilter: string` (controlled-input, empty-default axis).
 *
 *   1. `readSkillKeyFromUrl()` helper reads `?skillKey=X` from
 *      window.location.search via a lazy useState initializer.
 *      Returns "" (empty default) on missing param so the
 *      `value={skillKeyFilter}` controlled-input contract is
 *      preserved without ternary noise at the call site.
 *   2. Copy Link button (data-testid `graph-skill-usage-copy-link-button`)
 *      writes `${origin}${pathname}?skillKey=<trimmedKey>` to
 *      navigator.clipboard, gated on `trimmedKey.length > 0`.
 *
 * Third axis-shape variant in the deeplink sub-arc:
 *   - T-F.135 / T-F.137 — string | null
 *   - T-F.136          — number | null
 *   - T-F.138 (this)   — string (empty-default controlled input)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphSkillUsagePanel.tsx",
    ),
    "utf8",
  );
}

describe("GraphSkillUsagePanel URL-state + copy-link (T-F.138)", () => {
  it("readSkillKeyFromUrl helper declared with SSR-safe window guard returning string", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+readSkillKeyFromUrl\(\)\s*:\s*string\s*\{[\s\S]{0,200}if\s*\(typeof\s+window\s*===\s*"undefined"\)\s*return\s+""/,
    );
  });

  it("readSkillKeyFromUrl reads URLSearchParams from window.location.search", () => {
    const src = read();
    expect(src).toMatch(/new\s+URLSearchParams\(window\.location\.search\)/);
    expect(src).toMatch(/params\.get\("skillKey"\)/);
  });

  it("readSkillKeyFromUrl returns empty string on missing param (preserves controlled-input contract)", () => {
    const src = read();
    expect(src).toMatch(/return\s+raw\s*\?\?\s*""/);
  });

  it("skillKeyFilter useState uses readSkillKeyFromUrl as lazy initializer", () => {
    const src = read();
    expect(src).toMatch(
      /useState<\s*string\s*>\(\s*\(\)\s*=>\s*readSkillKeyFromUrl\(\)/,
    );
  });

  it("Copy Link button rendered with per-test testid + title hint + gated on trimmedKey", () => {
    const src = read();
    expect(src).toMatch(
      /\{trimmedKey\.length\s*>\s*0\s*\?\s*\([\s\S]{0,800}data-testid="graph-skill-usage-copy-link-button"[\s\S]{0,300}title=\{`Copy a shareable link with \?skillKey=\$\{trimmedKey\}`\}/,
    );
  });

  it("Copy Link button constructs origin + pathname + ?skillKey=<trimmed> URL and writes via navigator.clipboard", () => {
    const src = read();
    expect(src).toMatch(
      /window\.location\.origin[\s\S]{0,80}window\.location\.pathname[\s\S]{0,80}\?skillKey=\$\{encodeURIComponent\(trimmedKey\)\}/,
    );
    expect(src).toMatch(/navigator\.clipboard\?\.writeText\(url\)/);
  });

  it("Copy Link button does NOT render before a skill key is entered (no shareable narrowing)", () => {
    const src = read();
    expect(src).toMatch(
      /\{trimmedKey\.length\s*>\s*0\s*\?\s*\([\s\S]{0,1200}data-testid="graph-skill-usage-copy-link-button"[\s\S]{0,800}<\/button>\s*<\/div>\s*\)\s*:\s*null\}/,
    );
  });
});
