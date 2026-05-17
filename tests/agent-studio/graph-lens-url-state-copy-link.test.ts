/**
 * GraphLensBrowser URL-state + copy-link — T-F.135.
 *
 * Two affordances ship together because they're symmetric — the
 * Copy Link button has no shareable target unless the matching
 * URL-state reader exists to honor `?lensId=X` on the receiving
 * end:
 *
 *   1. `readLensIdFromUrl()` helper reads `?lensId=X` from
 *      window.location.search on first render via a lazy
 *      useState initializer (SSR-safe via `typeof window` guard).
 *   2. Copy Link button (data-testid `graph-lens-copy-link-button`)
 *      writes `${origin}${pathname}?lensId=<selectedLensId>` to
 *      navigator.clipboard, gated on selectedLensId being set.
 *
 * Per lesson 96 — this is the first cross-panel URL-deeplink
 * primitive in the agent-studio module (precedent for menu item
 * (n)). The receiving end (URL → state) ships in this same PR so
 * the copied links resolve correctly when pasted into a fresh
 * browser tab.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
    ),
    "utf8",
  );
}

describe("GraphLensBrowserPanel URL-state + copy-link (T-F.135)", () => {
  it("readLensIdFromUrl helper declared with SSR-safe window guard", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+readLensIdFromUrl\(\)\s*:\s*string\s*\|\s*null\s*\{[\s\S]{0,200}if\s*\(typeof\s+window\s*===\s*"undefined"\)\s*return\s+null/,
    );
  });

  it("readLensIdFromUrl reads URLSearchParams from window.location.search", () => {
    const src = read();
    expect(src).toMatch(
      /new\s+URLSearchParams\(window\.location\.search\)/,
    );
    expect(src).toMatch(/params\.get\("lensId"\)/);
  });

  it("readLensIdFromUrl returns null on missing/empty param (preserves pre-T-F.135 default)", () => {
    const src = read();
    expect(src).toMatch(
      /raw\s*&&\s*raw\.length\s*>\s*0\s*\?\s*raw\s*:\s*null/,
    );
  });

  it("selectedLensId useState uses readLensIdFromUrl as lazy initializer", () => {
    const src = read();
    expect(src).toMatch(
      /useState<\s*string\s*\|\s*null\s*>\(\s*\(\)\s*=>\s*readLensIdFromUrl\(\)/,
    );
  });

  it("Copy Link button rendered with per-test testid + title hint + gated on selectedLensId", () => {
    const src = read();
    expect(src).toMatch(
      /\{selectedLensId\s*\?\s*\(\s*<button[\s\S]{0,500}data-testid="graph-lens-copy-link-button"[\s\S]{0,200}title=\{`Copy a shareable link with \?lensId=\$\{selectedLensId\}`\}/,
    );
  });

  it("Copy Link button constructs origin + pathname + ?lensId=<id> URL and writes via navigator.clipboard", () => {
    const src = read();
    expect(src).toMatch(
      /window\.location\.origin[\s\S]{0,80}window\.location\.pathname[\s\S]{0,80}\?lensId=\$\{encodeURIComponent\(selectedLensId\)\}/,
    );
    expect(src).toMatch(/navigator\.clipboard\?\.writeText\(url\)/);
  });

  it("Copy Link button does NOT render before a lens is selected (no shareable target)", () => {
    const src = read();
    // The button is gated by `{selectedLensId ? (<button…/>) : null}`.
    // We assert the gating expression renders the button only inside
    // the truthy branch.
    expect(src).toMatch(
      /\{selectedLensId\s*\?\s*\(\s*<button[\s\S]{0,400}data-testid="graph-lens-copy-link-button"[\s\S]{0,500}<\/button>\s*\)\s*:\s*null\}/,
    );
  });
});
