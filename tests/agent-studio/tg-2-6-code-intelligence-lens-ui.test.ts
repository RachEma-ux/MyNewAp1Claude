/**
 * T-G.2.6 — Code Intelligence lens UI surface.
 *
 * The Graph Lens browser panel is fully metadata-driven: it groups
 * by typeKey, filters by typeKey/visibility/search, and renders any
 * `LensSnapshot` shape. So adding the code_intelligence lens kind
 * (T-G.2.5) made it operator-visible in the existing UI without
 * any panel changes.
 *
 * T-G.2.6 (this PR) adds the one operator affordance that's
 * code_intelligence-specific: a source-locator badge under each
 * node row's label when meta carries `filePath` (+ optional
 * `startLine` / `endLine`). Generic by design — keyed on meta
 * shape, not on lens kind — so any future lens that emits source
 * locators gets the affordance for free.
 *
 * Source-scan integrity test — locks the helpers + the badge
 * rendering against panel-refactor regression.
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

describe("T-G.2.6 — Code Intelligence lens UI surface", () => {
  it("CodeGraphSourceLocator type exported from the panel", () => {
    const src = readPanel();
    expect(src).toMatch(
      /export\s+interface\s+CodeGraphSourceLocator\s*\{[\s\S]*?readonly\s+filePath:\s*string[\s\S]*?startLine\?:\s*number[\s\S]*?endLine\?:\s*number[\s\S]*?\}/,
    );
  });

  it("getCodeGraphSourceLocator helper exported + handles missing meta", () => {
    const src = readPanel();
    expect(src).toMatch(
      /export\s+function\s+getCodeGraphSourceLocator\(\s*meta:[\s\S]*?\):\s*CodeGraphSourceLocator\s*\|\s*null/,
    );
    // Guards: no-meta + non-string filePath + empty filePath
    expect(src).toMatch(/if\s*\(!meta\)\s*return\s+null/);
    expect(src).toMatch(/typeof\s+filePath\s*!==\s*"string"/);
    expect(src).toMatch(/filePath\.length\s*===\s*0/);
  });

  it("getCodeGraphSourceLocator validates startLine/endLine as finite numbers", () => {
    const src = readPanel();
    expect(src).toMatch(/Number\.isFinite\(startLineRaw\)/);
    expect(src).toMatch(/Number\.isFinite\(endLineRaw\)/);
  });

  it("formatCodeGraphSourceLocator handles all three shapes (no lines / one line / range)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /export\s+function\s+formatCodeGraphSourceLocator\(\s*loc:\s*CodeGraphSourceLocator,?\s*\):\s*string/,
    );
    // Range form: `${filePath}:${start}-${end}` when start !== end
    expect(src).toMatch(/\$\{loc\.filePath\}:\$\{loc\.startLine\}-\$\{loc\.endLine\}/);
    // Single-line form: `${filePath}:${start}`
    expect(src).toMatch(/\$\{loc\.filePath\}:\$\{loc\.startLine\}["'`]/);
  });

  it("node table renders the source-locator badge under the label cell", () => {
    const src = readPanel();
    // The badge lives inside the label <td>: an IIFE calls
    // getCodeGraphSourceLocator on n.meta + returns a div with
    // the formatted string + a stable data-testid prefix.
    expect(src).toMatch(/getCodeGraphSourceLocator\(\s*n\.meta\s+as\s+Readonly/);
    expect(src).toMatch(/data-testid=\{`graph-lens-node-source-locator-\$\{n\.id\}`\}/);
    expect(src).toMatch(/formatCodeGraphSourceLocator\(loc\)/);
  });

  it("badge returns null when no locator (preserves layout for non-code lenses)", () => {
    const src = readPanel();
    expect(src).toMatch(/if\s*\(!loc\)\s*return\s+null/);
  });

  it("comment block documents the generic-by-design choice (not code_intelligence-specific)", () => {
    const src = readPanel();
    expect(src).toMatch(/Generic by design[\s\S]*?keyed on shape, not on lens kind/);
  });
});

// ============================================================================
// Behavioral tests on the exported helpers
// ============================================================================

describe("T-G.2.6 — helper behavior", () => {
  // Note: these run against the panel module via dynamic import.
  // If your test environment doesn't support the panel import (e.g.
  // React-specific peer deps), the source-scan above already locks
  // the helpers' shape.

  it("getCodeGraphSourceLocator returns null for missing/empty filePath", async () => {
    const mod = await import(
      "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel"
    );
    expect(mod.getCodeGraphSourceLocator(undefined)).toBeNull();
    expect(mod.getCodeGraphSourceLocator({})).toBeNull();
    expect(mod.getCodeGraphSourceLocator({ filePath: "" })).toBeNull();
    expect(mod.getCodeGraphSourceLocator({ filePath: 42 })).toBeNull();
  });

  it("getCodeGraphSourceLocator extracts filePath alone when no lines", async () => {
    const mod = await import(
      "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel"
    );
    const loc = mod.getCodeGraphSourceLocator({ filePath: "src/a.ts" });
    expect(loc).toEqual({
      filePath: "src/a.ts",
      startLine: undefined,
      endLine: undefined,
    });
  });

  it("getCodeGraphSourceLocator extracts start+end when both numeric", async () => {
    const mod = await import(
      "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel"
    );
    const loc = mod.getCodeGraphSourceLocator({
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 20,
    });
    expect(loc).toEqual({ filePath: "src/a.ts", startLine: 10, endLine: 20 });
  });

  it("formatCodeGraphSourceLocator renders range when start !== end", async () => {
    const mod = await import(
      "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel"
    );
    expect(
      mod.formatCodeGraphSourceLocator({
        filePath: "src/a.ts",
        startLine: 1,
        endLine: 5,
      }),
    ).toBe("src/a.ts:1-5");
  });

  it("formatCodeGraphSourceLocator collapses to single line when start === end", async () => {
    const mod = await import(
      "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel"
    );
    expect(
      mod.formatCodeGraphSourceLocator({
        filePath: "src/a.ts",
        startLine: 7,
        endLine: 7,
      }),
    ).toBe("src/a.ts:7");
  });

  it("formatCodeGraphSourceLocator omits line suffix entirely when startLine missing", async () => {
    const mod = await import(
      "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel"
    );
    expect(
      mod.formatCodeGraphSourceLocator({ filePath: "src/a.ts" }),
    ).toBe("src/a.ts");
  });
});
