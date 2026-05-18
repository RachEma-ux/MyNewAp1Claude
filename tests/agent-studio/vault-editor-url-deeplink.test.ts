/**
 * Track B follow-on — URL deep-link for the Graph Workspace.
 *
 * Structural source-scan locking:
 *   - `?vault=N&note=M` is read on mount via the lazy useState
 *     initializer pattern (T-F.135 family).
 *   - The (vaultId, noteId) pair write-back to `window.history.replaceState`
 *     when either axis changes.
 *   - The shareable "Copy link" affordance is gated on BOTH ids being set.
 *
 * Authority: ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const PAGE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/pages/GraphWorkspacePage.tsx",
);

const src = readFileSync(PAGE, "utf8");

describe("URL deep-link — read side", () => {
  it("declares a `readWorkspaceIdsFromUrl` helper", () => {
    expect(src).toMatch(/function readWorkspaceIdsFromUrl\(/);
  });

  it("parses `?vault=` and `?note=` query params", () => {
    expect(src).toContain('params.get("vault")');
    expect(src).toContain('params.get("note")');
  });

  it("SSR-guards on `typeof window`", () => {
    expect(src).toMatch(/typeof window\s*===\s*["']undefined["']/);
  });

  it("rejects non-finite / non-positive ids (NaN, 0, negative)", () => {
    expect(src).toMatch(/Number\.isFinite\(/);
    expect(src).toMatch(/>\s*0/);
  });

  it("seeds the (vaultId, noteId) useState via the lazy initializer", () => {
    expect(src).toMatch(
      /useState<number \| null>\([\s\S]*?readWorkspaceIdsFromUrl\(\)\.vaultId/,
    );
    expect(src).toMatch(
      /useState<number \| null>\([\s\S]*?readWorkspaceIdsFromUrl\(\)\.noteId/,
    );
  });
});

describe("URL deep-link — write side", () => {
  it("uses `history.replaceState` (not pushState — back-button hygiene)", () => {
    expect(src).toContain("window.history.replaceState");
    expect(src).not.toContain("window.history.pushState");
  });

  it("write-back useEffect depends on both selectedVaultId AND selectedNoteId", () => {
    expect(src).toMatch(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?window\.history\.replaceState[\s\S]*?\},\s*\[selectedVaultId,\s*selectedNoteId\]\)/,
    );
  });

  it("deletes the param when the corresponding id is null", () => {
    expect(src).toContain('params.delete("vault")');
    expect(src).toContain('params.delete("note")');
  });

  it("preserves other query params + hash by composing off URLSearchParams + location", () => {
    expect(src).toMatch(
      /new URLSearchParams\(window\.location\.search\)/,
    );
    expect(src).toContain("window.location.hash");
  });
});

describe("URL deep-link — copy-link affordance", () => {
  it("renders a copy-link button with the canonical data-testid", () => {
    expect(src).toContain('data-testid="graph-workspace-copy-link-button"');
  });

  it("gates the button on BOTH selectedVaultId AND selectedNoteId being non-null", () => {
    expect(src).toMatch(
      /selectedVaultId\s*!==\s*null\s*&&\s*selectedNoteId\s*!==\s*null\s*\?[\s\S]*?graph-workspace-copy-link-button/,
    );
  });

  it("composes the URL from origin + pathname + ?vault=&note=", () => {
    expect(src).toMatch(
      /\$\{window\.location\.origin\}\$\{window\.location\.pathname\}\?vault=\$\{selectedVaultId\}&note=\$\{selectedNoteId\}/,
    );
  });

  it("writes the URL to the clipboard", () => {
    expect(src).toContain("navigator.clipboard?.writeText");
  });
});
