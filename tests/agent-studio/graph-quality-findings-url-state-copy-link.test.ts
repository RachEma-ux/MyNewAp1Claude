/**
 * GraphQualityFindings URL-state + copy-link — T-F.136.
 *
 * Mechanical replication of the T-F.135 lens-browser deeplink
 * primitive to a second selection axis — `expandedFindingId`
 * (numeric, drill-in row state). Same two-affordance shape:
 *
 *   1. `readFindingIdFromUrl()` helper reads `?findingId=N` from
 *      window.location.search on first render via a lazy useState
 *      initializer. Numeric coercion: rejects empty / NaN / non-
 *      positive values so a malformed param falls back to the
 *      pre-T-F.136 default (null = nothing expanded).
 *   2. Copy Link button (data-testid `graph-quality-copy-link-button`)
 *      writes `${origin}${pathname}?findingId=<id>` to
 *      navigator.clipboard, gated on expandedFindingId being set.
 *
 * Per precedent (n) — second cross-panel URL-deeplink primitive in
 * the agent-studio module; ships receiver + sender together so
 * pasted links land on the expanded row in a fresh browser tab.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx",
    ),
    "utf8",
  );
}

describe("GraphQualityFindingsPanel URL-state + copy-link (T-F.136)", () => {
  it("readFindingIdFromUrl helper declared with SSR-safe window guard", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+readFindingIdFromUrl\(\)\s*:\s*number\s*\|\s*null\s*\{[\s\S]{0,200}if\s*\(typeof\s+window\s*===\s*"undefined"\)\s*return\s+null/,
    );
  });

  it("readFindingIdFromUrl reads URLSearchParams from window.location.search", () => {
    const src = read();
    expect(src).toMatch(
      /new\s+URLSearchParams\(window\.location\.search\)/,
    );
    expect(src).toMatch(/params\.get\("findingId"\)/);
  });

  it("readFindingIdFromUrl rejects empty/NaN/non-positive (preserves pre-T-F.136 default)", () => {
    const src = read();
    expect(src).toMatch(/if\s*\(!raw\)\s*return\s+null/);
    expect(src).toMatch(/Number\.isFinite\(parsed\)\s*&&\s*parsed\s*>\s*0/);
  });

  it("expandedFindingId useState uses readFindingIdFromUrl as lazy initializer", () => {
    const src = read();
    expect(src).toMatch(
      /useState<\s*number\s*\|\s*null\s*>\(\s*\(\)\s*=>\s*readFindingIdFromUrl\(\)/,
    );
  });

  it("Copy Link button rendered with per-test testid + title hint + gated on expandedFindingId", () => {
    const src = read();
    expect(src).toMatch(
      /\{expandedFindingId\s*!==\s*null\s*\?\s*\(\s*<button[\s\S]{0,800}data-testid="graph-quality-copy-link-button"[\s\S]{0,400}title=\{`Copy a shareable link with \?findingId=\$\{expandedFindingId\}`\}/,
    );
  });

  it("Copy Link button constructs origin + pathname + ?findingId=<id> URL and writes via navigator.clipboard", () => {
    const src = read();
    expect(src).toMatch(
      /window\.location\.origin[\s\S]{0,80}window\.location\.pathname[\s\S]{0,120}\?findingId=\$\{encodeURIComponent\(String\(expandedFindingId\)\)\}/,
    );
    expect(src).toMatch(/navigator\.clipboard\?\.writeText\(url\)/);
  });

  it("Copy Link button does NOT render before a finding is expanded (no shareable target)", () => {
    const src = read();
    expect(src).toMatch(
      /\{expandedFindingId\s*!==\s*null\s*\?\s*\(\s*<button[\s\S]{0,800}data-testid="graph-quality-copy-link-button"[\s\S]{0,800}<\/button>\s*\)\s*:\s*null\}/,
    );
  });
});
