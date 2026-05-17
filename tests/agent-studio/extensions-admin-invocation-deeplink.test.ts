/**
 * ExtensionsAdminPanel invocation→registry deeplink — T-F.128
 * (T-F.7-j₂ intra-panel).
 *
 * Second scout candidate per the post-T-A.37 scout report (after
 * T-F.127 RegionAdminPanel pin-row Edit prefill). The recent
 * invocations log lists `extensionKeyById.get(r.extensionId)` as
 * plain text; clicking it now sets a per-row highlight on the
 * registry table above + scrollIntoView. Operator workflow:
 * spot an unusual lane/error in the invocations log → click
 * extension name → registry row pulses + scrolls into view, ready
 * for inline config / approval re-check (2 steps vs 3: Ctrl+F →
 * paste extension key → scroll).
 *
 * Per-link only (NOT row-wide click) so the Details "view" button
 * stays unambiguous (lesson 64 destructive-action proximity guard
 * also covers non-destructive but conflicting onClick handlers).
 *
 * Intra-panel state — no cross-tab fusion. The registry refs are a
 * `Map<number, HTMLTableRowElement | null>` populated by the row
 * `ref` callback, looked up in `handleInvocationExtensionClick`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
    ),
    "utf8",
  );
}

describe("ExtensionsAdminPanel invocation→registry deeplink (T-F.128 / T-F.7-j₂ intra-panel)", () => {
  it("declares highlightedExtensionId state + registry row refs map", () => {
    const src = read();
    expect(src).toMatch(
      /useState<\s*number\s*\|\s*null\s*>\(\s*null\s*\)/,
    );
    expect(src).toMatch(/setHighlightedExtensionId/);
    expect(src).toMatch(
      /registryRowRefs\s*=\s*React\.useRef<[\s\S]{0,200}Map<number,\s*HTMLTableRowElement\s*\|\s*null>[\s\S]{0,50}>\(\s*new\s+Map\(\)\s*\)/,
    );
  });

  it("handleInvocationExtensionClick sets highlight + scrollIntoView via the ref map", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+handleInvocationExtensionClick\(\s*extensionId:\s*number\s*\)\s*\{[\s\S]{0,600}setHighlightedExtensionId\(\s*extensionId\s*\)[\s\S]{0,400}registryRowRefs\.current\.get\(\s*extensionId\s*\)[\s\S]{0,400}scrollIntoView\(\{\s*behavior:\s*"smooth",\s*block:\s*"center"\s*\}\)/,
    );
  });

  it("registry <tr> wires the ref callback + conditional highlight class + per-row testid", () => {
    const src = read();
    expect(src).toMatch(
      /ref=\{\(el\)\s*=>\s*\{\s*registryRowRefs\.current\.set\(ext\.id,\s*el\);?\s*\}\}/,
    );
    expect(src).toMatch(
      /className=\{`border-t \$\{highlightedExtensionId === ext\.id \? "bg-amber-100 dark:bg-amber-900\/30" : ""\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`extension-registry-row-\$\{ext\.id\}`\}/,
    );
  });

  it("invocations Extension cell becomes a <button> wired to handleInvocationExtensionClick", () => {
    const src = read();
    expect(src).toMatch(
      /<button[\s\S]{0,400}data-testid=\{`extension-invocation-row-extension-\$\{r\.id\}`\}[\s\S]{0,300}onClick=\{\(\)\s*=>\s*handleInvocationExtensionClick\(r\.extensionId\)\s*\}[\s\S]{0,400}extensionKeyById\.get\(r\.extensionId\)\s*\?\?\s*`#\$\{r\.extensionId\}`/,
    );
  });

  it("button is a per-link click (NOT whole-row <tr> onClick) — Details 'view' button + invocation row stay independent", () => {
    const src = read();
    // The recent-invocations <tr> wrapper must NOT carry an onClick
    // (would race with the per-cell button + the Details toggle).
    expect(src).not.toMatch(
      /<tr[\s\S]{0,500}key=\{r\.id\}[\s\S]{0,300}onClick=/,
    );
  });

  it("Details 'view' button preserved (regression-free; unchanged toggle signature)", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid=\{`extension-invocation-details-toggle-\$\{r\.id\}`\}/,
    );
    expect(src).toMatch(/setExpandedInvocationId\(\s*isInvDetailExpanded \? null : r\.id/);
  });
});
