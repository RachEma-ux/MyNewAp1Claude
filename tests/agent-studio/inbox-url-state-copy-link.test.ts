/**
 * InboxPanel URL-state + copy-link — T-F.137.
 *
 * Third cross-panel URL-deeplink primitive in the agent-studio
 * module — mechanical replication of T-F.135 (lens-browser) onto
 * `selectedKind: string | null` (inbox kind-filter axis). Same
 * string-axis shape as T-F.135 (not the numeric T-F.136 variant).
 *
 *   1. `readKindFromUrl()` helper reads `?kind=X` from
 *      window.location.search via a lazy useState initializer.
 *   2. Copy Link button (data-testid `inbox-copy-link-button`)
 *      writes `${origin}${pathname}?kind=<selectedKind>` to
 *      navigator.clipboard, gated on selectedKind being set.
 *
 * Open-taxonomy note (precedent (o)): InboxPanel.notificationKind
 * is a free-form varchar(100) — the URL helper deliberately does
 * NOT gate by a closed enum; receiving end accepts any non-empty
 * raw value so future server emitters work without a code change.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/InboxPanel.tsx",
    ),
    "utf8",
  );
}

describe("InboxPanel URL-state + copy-link (T-F.137)", () => {
  it("readKindFromUrl helper declared with SSR-safe window guard", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+readKindFromUrl\(\)\s*:\s*string\s*\|\s*null\s*\{[\s\S]{0,200}if\s*\(typeof\s+window\s*===\s*"undefined"\)\s*return\s+null/,
    );
  });

  it("readKindFromUrl reads URLSearchParams from window.location.search", () => {
    const src = read();
    expect(src).toMatch(/new\s+URLSearchParams\(window\.location\.search\)/);
    expect(src).toMatch(/params\.get\("kind"\)/);
  });

  it("readKindFromUrl returns null on missing/empty param (preserves pre-T-F.137 default)", () => {
    const src = read();
    expect(src).toMatch(/raw\s*&&\s*raw\.length\s*>\s*0\s*\?\s*raw\s*:\s*null/);
  });

  it("selectedKind useState uses readKindFromUrl as lazy initializer", () => {
    const src = read();
    expect(src).toMatch(
      /useState<\s*string\s*\|\s*null\s*>\(\s*\(\)\s*=>\s*readKindFromUrl\(\)/,
    );
  });

  it("Copy Link button rendered with per-test testid + title hint + gated on selectedKind", () => {
    const src = read();
    expect(src).toMatch(
      /\{selectedKind\s*!=\s*null\s*\?\s*\(\s*<button[\s\S]{0,500}data-testid="inbox-copy-link-button"[\s\S]{0,200}title=\{`Copy a shareable link with \?kind=\$\{selectedKind\}`\}/,
    );
  });

  it("Copy Link button constructs origin + pathname + ?kind=<id> URL and writes via navigator.clipboard", () => {
    const src = read();
    expect(src).toMatch(
      /window\.location\.origin[\s\S]{0,80}window\.location\.pathname[\s\S]{0,80}\?kind=\$\{encodeURIComponent\(selectedKind\)\}/,
    );
    expect(src).toMatch(/navigator\.clipboard\?\.writeText\(url\)/);
  });

  it("Copy Link button does NOT render before a kind is selected (no shareable narrowing)", () => {
    const src = read();
    expect(src).toMatch(
      /\{selectedKind\s*!=\s*null\s*\?\s*\(\s*<button[\s\S]{0,400}data-testid="inbox-copy-link-button"[\s\S]{0,500}<\/button>\s*\)\s*:\s*null\}/,
    );
  });
});
