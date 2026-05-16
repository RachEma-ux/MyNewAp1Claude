/**
 * Bases ζ-preview row-count metadata — a.1-narrow slice
 * (T-F.103 / T-F.2-a.1).
 *
 * First within-Bases NARROW slice after the filter-language arc.
 * Adds total-match-count + truncation reporting to the preview
 * banner so operators see honest cardinality of the filtered set
 * vs the displayed sample.
 *
 * Source-scan integrity test locks: split between previewMatchedAll
 * (pre-display-slice) and previewNotes (post-slice), totalMatchCount
 * + truncation flag derivation, BasePreview prop wiring, banner
 * row-count line + truncation labels (display vs fetch-cap with
 * distinct testids + distinct visual treatment).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/BasesPanel.tsx",
    ),
    "utf8",
  );
}

describe("Bases preview row-count a.1-slice (T-F.103 / T-F.2-a.1)", () => {
  it("previewMatchedAll holds the post-narrow set; previewNotes is the display slice", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+previewMatchedAll[\s\S]{0,800}applyFilterDocument\([\s\S]{0,400}previewQuery\.data[\s\S]{0,300}previewDoc[\s\S]{0,100}\)\s*:\s*\[\]/,
    );
    expect(src).toMatch(
      /const\s+previewNotes\s*=\s*previewMatchedAll\.slice\(0,\s*PREVIEW_LIMIT\)/,
    );
  });

  it("totalMatchCount + truncation flags derived consistently", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+previewTotalMatchCount\s*=\s*previewMatchedAll\.length/,
    );
    expect(src).toMatch(
      /const\s+previewTruncatedByDisplay\s*=[\s\S]{0,200}previewTotalMatchCount\s*>\s*PREVIEW_LIMIT/,
    );
    expect(src).toMatch(
      /const\s+previewTruncatedByFetchCap\s*=[\s\S]{0,300}previewQuery\.data\.length\s*===\s*PREVIEW_FETCH_OVER_SAMPLE/,
    );
  });

  it("BasePreview gains totalMatchCount + truncatedByDisplay + truncatedByFetchCap props", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<BasePreview[\s\S]{0,800}totalMatchCount=\{previewTotalMatchCount\}[\s\S]{0,300}truncatedByDisplay=\{previewTruncatedByDisplay\}[\s\S]{0,300}truncatedByFetchCap=\{previewTruncatedByFetchCap\}/,
    );
  });

  it("banner row-count line names the total + has per-row testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`bases-row-preview-match-count-\$\{base\.id\}`\}/,
    );
    expect(src).toMatch(
      /Matches:\s*<span[^>]*>\{totalMatchCount\}<\/span>/,
    );
  });

  it("display-truncation label gated on truncatedByDisplay + has per-row testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{truncatedByDisplay\s*\?\s*\([\s\S]{0,800}data-testid=\{`bases-row-preview-truncated-display-\$\{base\.id\}`\}/,
    );
    expect(src).toMatch(
      /showing first \{previewNotes\.length\} after narrowing/,
    );
  });

  it("fetch-cap-truncation label gated on truncatedByFetchCap + has per-row testid + destructive visual treatment", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{truncatedByFetchCap\s*\?\s*\([\s\S]{0,800}data-testid=\{`bases-row-preview-truncated-fetch-\$\{base\.id\}`\}/,
    );
    expect(src).toMatch(
      /truncatedByFetchCap[\s\S]{0,800}text-destructive[\s\S]{0,300}data-testid=\{`bases-row-preview-truncated-fetch/,
    );
    expect(src).toMatch(/server cap[\s\S]{0,200}may be missed/);
  });
});
