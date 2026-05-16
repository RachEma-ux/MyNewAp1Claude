/**
 * Graph Lens browser — substring search drill-in (T-F.74).
 *
 * Third drill-in axis on the lens browser. Pure client-side
 * case-insensitive substring match across `node.id` + `node.label`.
 * Composes with the typeKey (T-F.72) and visibility (T-F.73)
 * filters into a single `filteredNodes` predicate.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PANEL_FILE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
);

function readPanel(): string {
  return readFileSync(PANEL_FILE, "utf8");
}

describe("Graph Lens browser — substring search drill-in (T-F.74)", () => {
  it("panel holds searchQuery state defaulting to empty string", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+\[searchQuery,\s*setSearchQuery\]\s*=\s*useState<string>\(""\)/);
  });

  it("lens-switch resets searchQuery to empty string", () => {
    const src = readPanel();
    // After T-F.75, the per-filter reset lives in `clearAllFilters`
    // and `selectLens` delegates. Assert the helper body clears the
    // search query.
    expect(src).toMatch(
      /function\s+clearAllFilters[\s\S]{0,500}setSearchQuery\(""\)/,
    );
  });

  it("RenderEnvelopeView receives searchQuery + onSearchQueryChange props", () => {
    const src = readPanel();
    expect(src).toMatch(/searchQuery:\s*string/);
    expect(src).toMatch(/onSearchQueryChange:\s*\(next:\s*string\)\s*=>\s*void/);
    expect(src).toMatch(/<RenderEnvelopeView[\s\S]{0,500}searchQuery=\{searchQuery\}/);
  });

  it("search predicate is case-insensitive AND matches id OR label", () => {
    const src = readPanel();
    expect(src).toMatch(/searchQuery\.trim\(\)\.toLowerCase\(\)/);
    expect(src).toMatch(/n\.id\.toLowerCase\(\)\.includes\(trimmedQuery\)/);
    expect(src).toMatch(/n\.label\s*\?\?\s*""[\s\S]{0,40}toLowerCase\(\)\.includes\(trimmedQuery\)/);
    expect(src).toMatch(/!idMatch\s*&&\s*!labelMatch/);
  });

  it("empty trimmed query is a no-op (does not narrow the result set)", () => {
    const src = readPanel();
    expect(src).toMatch(/if\s*\(trimmedQuery\s*!==\s*""\)/);
  });

  it("hasAnyFilter includes the search axis", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+hasAnyFilter\s*=[\s\S]{0,300}trimmedQuery\s*!==\s*""/,
    );
  });

  it("search input renders with testids + Clear button gated on non-empty query", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-search-filter-group"/);
    expect(src).toMatch(/data-testid="graph-lens-search-input"/);
    expect(src).toMatch(/data-testid="graph-lens-search-clear"/);
    // Clear button must be gated on `searchQuery !== ""` so it only
    // renders when there's something to clear.
    expect(src).toMatch(
      /searchQuery\s*!==\s*""\s*\?[\s\S]{0,400}data-testid="graph-lens-search-clear"/,
    );
  });
});
