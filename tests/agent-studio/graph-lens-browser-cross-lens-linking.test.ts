/**
 * Graph Lens browser — cross-lens linking via shared typeKeys
 * (T-F.76). Validates the cross-lens typeKey discipline named in
 * the V1+ session memory lesson 43 by surfacing a per-row "Open in
 * <other-kind>" affordance.
 *
 * Source-scan integrity test — locks the constant + the row UI.
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

describe("Graph Lens browser — cross-lens linking (T-F.76)", () => {
  it("CROSS_LENS_TYPEKEY_TARGETS constant lists the 2 known shared typeKeys", () => {
    const src = readPanel();
    expect(src).toMatch(/CROSS_LENS_TYPEKEY_TARGETS:\s*Readonly<Record<string,\s*string>>/);
    expect(src).toMatch(/cag_pack:\s*"cag"/);
    expect(src).toMatch(/runtime_run:\s*"runtime"/);
  });

  it("RenderEnvelopeView accepts onJumpToLens + lensList props", () => {
    const src = readPanel();
    expect(src).toMatch(
      /onJumpToLens:\s*\(targetLensId:\s*string,\s*prefilledSearch:\s*string\)\s*=>\s*void/,
    );
    expect(src).toMatch(/lensList:[\s\S]{0,200}ReadonlyArray</);
    expect(src).toMatch(/<RenderEnvelopeView[\s\S]{0,1000}onJumpToLens=\{/);
    expect(src).toMatch(/<RenderEnvelopeView[\s\S]{0,1000}lensList=\{listQ\.data\s*\?\?\s*null\}/);
  });

  it("onJumpToLens handler clears all 3 drill-in filters AND seeds the search with the node id", () => {
    const src = readPanel();
    // The handler is defined inline in the panel — it must reset
    // typeKey + visibility AND set searchQuery to the prefilled value.
    const onJumpStart = src.indexOf("onJumpToLens={(targetLensId, prefilledSearch)");
    expect(onJumpStart).toBeGreaterThan(0);
    const onJumpEnd = src.indexOf("}}", onJumpStart);
    expect(onJumpEnd).toBeGreaterThan(onJumpStart);
    const handler = src.slice(onJumpStart, onJumpEnd + 2);
    expect(handler).toContain("setSelectedLensId(targetLensId)");
    expect(handler).toContain("setTypeKeyFilter(null)");
    expect(handler).toContain('setVisibilityFilter("all")');
    expect(handler).toContain("setSearchQuery(prefilledSearch)");
  });

  it("per-row jump affordance renders ONLY when the target kind differs from the current lens kind", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+targetKind\s*=\s*CROSS_LENS_TYPEKEY_TARGETS\[n\.typeKey\]/);
    expect(src).toMatch(/const\s+isCurrentLens\s*=\s*targetKind\s*===\s*snapshot\.kind/);
    // The lookup uses `!isCurrentLens` so the affordance is suppressed
    // when the operator is already on the canonical lens.
    expect(src).toMatch(/targetKind\s*&&\s*!isCurrentLens\s*&&\s*lensList\s*!=\s*null/);
  });

  it("affordance only renders for kinds whose canonical lens has a runner installed", () => {
    const src = readPanel();
    // The find() predicate guards on hasRunner so a placeholder kind
    // doesn't surface a jump that lands on a no_runner_for_kind page.
    expect(src).toMatch(
      /lensList\.find\([\s\S]{0,200}hasRunner/,
    );
  });

  it("jump button uses a per-target-kind testid and labels 'Open in <kind>'", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=\{`graph-lens-jump-to-\$\{targetKind\}-\$\{n\.id\}`\}/);
    expect(src).toMatch(/Open in \{targetKind\}/);
  });

  it("nodes preview table has a 5th column header for the jump affordance", () => {
    const src = readPanel();
    // Header has 5 <th> rows now (id / typeKey / visible / label / blank).
    expect(src).toMatch(
      /<thead>[\s\S]{0,400}<th[^>]*>id<\/th>[\s\S]{0,400}<th[^>]*>typeKey<\/th>[\s\S]{0,400}<th[^>]*>visible<\/th>[\s\S]{0,400}<th[^>]*>label<\/th>[\s\S]{0,400}<th[^>]*><\/th>/,
    );
    // Empty-state row's colSpan grew to 5.
    expect(src).toMatch(/colSpan=\{5\}/);
  });
});
