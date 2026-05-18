/**
 * Track B — B5 — Frontmatter Properties panel.
 *
 * Locks the structural invariants of the new NoteFrontmatterPanel +
 * the shared `vault-markdown-profile` module that supports both
 * client + server callers (single source of truth for the markdown
 * profile).
 *
 * The pure parse/render behavior is already covered by the existing
 * vault-markdown-import-export.test.ts (which now exercises the
 * shared module via the server's re-exports). This file:
 *
 *  - Sanity-checks the shared module round-trips correctly when
 *    imported directly from `shared/`.
 *  - Source-scans the panel component for the type-inferred row
 *    branches + the add/delete flow.
 *  - Source-scans the editor mount + the editor-pane wiring.
 *
 * Authority: ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  parseMarkdownBlob,
  renderNoteAsMarkdown,
  sanitizeFilenameSegment,
} from "../../shared/vault-markdown-profile";

const PANEL = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/NoteFrontmatterPanel.tsx",
);
const PANE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/MarkdownEditorPane.tsx",
);
const SHARED = resolve(
  __dirname,
  "../../shared/vault-markdown-profile.ts",
);
const SERVER_MIE = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/markdown-import-export.ts",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("B5 — shared vault-markdown-profile module", () => {
  it("parseMarkdownBlob round-trips via renderNoteAsMarkdown", () => {
    const md = "---\ntitle: My Note\ncount: 42\nactive: true\n---\n\n# Body";
    const { frontmatter, contentMd } = parseMarkdownBlob(md);
    expect(frontmatter).toEqual({
      title: "My Note",
      count: 42,
      active: true,
    });
    expect(contentMd).toBe("# Body");
    const rendered = renderNoteAsMarkdown({ frontmatter, contentMd });
    const reparsed = parseMarkdownBlob(rendered);
    expect(reparsed.frontmatter).toEqual(frontmatter);
    expect(reparsed.contentMd).toBe(contentMd);
  });

  it("parseMarkdownBlob handles blob with no frontmatter (returns empty fm)", () => {
    const { frontmatter, contentMd } = parseMarkdownBlob("# Just body");
    expect(frontmatter).toEqual({});
    expect(contentMd).toBe("# Just body");
  });

  it("sanitizeFilenameSegment strips unsafe chars", () => {
    expect(sanitizeFilenameSegment("My Title!")).toBe("My-Title");
    expect(sanitizeFilenameSegment("a/b")).toBe("a-b");
    expect(sanitizeFilenameSegment("///")).toBe("note");
  });

  it("server markdown-import-export re-exports the shared helpers (single source of truth)", () => {
    const src = read(SERVER_MIE);
    expect(src).toContain(
      'export {\n  parseMarkdownBlob,\n  renderNoteAsMarkdown,\n  sanitizeFilenameSegment,',
    );
    expect(src).toContain("shared/vault-markdown-profile");
  });

  it("shared module has no Node-only imports (safe for client)", () => {
    const src = read(SHARED);
    // No fs / path / DB imports — only ES-standard JSON + regex.
    expect(src).not.toMatch(/from\s+["']node:/);
    expect(src).not.toMatch(/from\s+["']fs["']/);
    expect(src).not.toMatch(/from\s+["'].*?drizzle/);
    expect(src).not.toMatch(/from\s+["'].*?\/repository/);
  });
});

describe("B5 — NoteFrontmatterPanel", () => {
  const src = read(PANEL);

  it("imports parse/render helpers from @shared/", () => {
    expect(src).toMatch(/from\s+["']@shared\/vault-markdown-profile["']/);
    expect(src).toContain("parseMarkdownBlob");
    expect(src).toContain("renderNoteAsMarkdown");
  });

  it("renders five type-specific value editors (boolean, number, string, array, object)", () => {
    expect(src).toContain('data-testid="note-frontmatter-value-boolean"');
    expect(src).toContain('data-testid="note-frontmatter-value-number"');
    expect(src).toContain('data-testid="note-frontmatter-value-string"');
    expect(src).toContain('data-testid="note-frontmatter-value-array"');
    expect(src).toContain('data-testid="note-frontmatter-value-object"');
    expect(src).toContain('data-testid="note-frontmatter-value-null"');
  });

  it("supports add + delete key flows", () => {
    expect(src).toContain('data-testid="note-frontmatter-add"');
    expect(src).toContain('data-testid="note-frontmatter-new-key"');
    expect(src).toMatch(/data-testid=\{`note-frontmatter-delete-\$\{propKey\}`\}/);
  });

  it("validates new keys (non-empty, unique, identifier-shaped)", () => {
    expect(src).toContain('"Key is required"');
    expect(src).toContain('"Key already exists"');
    expect(src).toMatch(/\^\[A-Za-z_\]\[A-Za-z0-9_-\]\*\$/);
  });

  it("type inference covers all five primitive cases", () => {
    expect(src).toMatch(/function inferType\(v: unknown\): PrimitiveType/);
    // null branch is explicit so it doesn't collapse into object.
    expect(src).toMatch(/v === null.*return ["']null["']/);
  });

  it("edits flow through renderNoteAsMarkdown → onChange (auto-save compatible)", () => {
    expect(src).toContain("renderNoteAsMarkdown({");
    expect(src).toContain("onChange(nextMd)");
  });

  it("array editor parses comma-separated input back to string[]", () => {
    expect(src).toContain("parseArrayInput");
    expect(src).toContain('.split(",")');
  });
});

describe("B5 — MarkdownEditorPane mount", () => {
  const src = read(PANE);

  it("imports NoteFrontmatterPanel", () => {
    expect(src).toMatch(
      /import\s+NoteFrontmatterPanel\s+from\s+["']\.\/NoteFrontmatterPanel["']/,
    );
  });

  it("renders the panel above the editor body when NOT in read mode", () => {
    expect(src).toMatch(/mode\s*!==\s*["']read["']\s*&&[\s\S]*?<NoteFrontmatterPanel/);
  });

  it("panel value is bound to liveText (the dirty-aware draft)", () => {
    expect(src).toMatch(/<NoteFrontmatterPanel[\s\S]*?value=\{liveText\}/);
  });

  it("panel onChange routes through setDraftMd (preserves auto-save wiring)", () => {
    expect(src).toMatch(
      /<NoteFrontmatterPanel[\s\S]*?onChange=\{[\s\S]*?setDraftMd\(next\)[\s\S]*?\}/,
    );
  });
});
