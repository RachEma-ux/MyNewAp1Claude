/**
 * Track B — B3 — [[wikilink]] autocomplete.
 *
 * Behavioral test of the completion source (the pure function that
 * returns CompletionResult) + a structural lock on the editor
 * wiring. The completion source is exercised against synthetic
 * CompletionContext-shaped inputs; CM6 itself is upstream code.
 *
 * Authority: ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { buildWikilinkCompletionSource } from "../../client/src/modules/agent-studio/components/graph-workspace/wikilink-autocomplete";

const SOURCE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/wikilink-autocomplete.ts",
);
const PANE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/MarkdownEditorPane.tsx",
);
const EDITOR = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/CodeMirrorMdEditor.tsx",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

/**
 * Minimal CompletionContext shim — covers the methods our source
 * actually uses. CM6's real CompletionContext has many more, but
 * since we only call `matchBefore`, this is enough.
 */
function makeContext(textBeforeCursor: string): {
  matchBefore: (rx: RegExp) => { from: number; to: number; text: string } | null;
} {
  return {
    matchBefore(rx: RegExp) {
      const m = rx.exec(textBeforeCursor);
      if (!m) return null;
      // Use last match (closest to cursor).
      const lastIdx = textBeforeCursor.lastIndexOf(m[0]);
      return {
        from: lastIdx,
        to: lastIdx + m[0].length,
        text: m[0],
      };
    },
  };
}

const SAMPLE_NOTES = [
  { slug: "project-alpha", title: "Project Alpha" },
  { slug: "daily-2026-05-18", title: "Daily — 2026-05-18" },
  { slug: "retrospective", title: "Q4 Retrospective" },
  { slug: "research-rag", title: "Research notes on RAG" },
];

describe("B3 — buildWikilinkCompletionSource", () => {
  const source = buildWikilinkCompletionSource({
    getSuggestions: () => SAMPLE_NOTES,
  });

  it("returns null when there's no `[[` token before the cursor", async () => {
    const r = await source(makeContext("plain text no link") as never);
    expect(r).toBeNull();
  });

  it("offers ALL suggestions when prefix is empty (`[[` just typed)", async () => {
    const r = await source(makeContext("foo [[") as never);
    expect(r).not.toBeNull();
    expect(r!.options).toHaveLength(SAMPLE_NOTES.length);
  });

  it("filters by case-insensitive slug match", async () => {
    const r = await source(makeContext("see [[proj") as never);
    expect(r).not.toBeNull();
    const labels = r!.options.map((o) => (o as { label: string }).label);
    expect(labels).toContain("Project Alpha");
    expect(labels).not.toContain("Q4 Retrospective");
  });

  it("filters by case-insensitive title match (fallback path)", async () => {
    const r = await source(makeContext("see [[Retro") as never);
    expect(r).not.toBeNull();
    const labels = r!.options.map((o) => (o as { label: string }).label);
    expect(labels).toContain("Q4 Retrospective");
  });

  it("`apply` inserts `slug]]` (closing bracket included)", async () => {
    const r = await source(makeContext("see [[proj") as never);
    const first = r!.options[0] as { apply: string };
    expect(first.apply).toBe("project-alpha]]");
  });

  it("from-position skips the `[[` characters (matches CM6 semantics)", async () => {
    const r = await source(makeContext("see [[proj") as never);
    expect(r).not.toBeNull();
    // text "see [[proj" — `[[` is at index 4, prefix starts at 6.
    expect(r!.from).toBe(6);
  });

  it("respects maxSuggestions cap", async () => {
    const capped = buildWikilinkCompletionSource({
      getSuggestions: () => SAMPLE_NOTES,
      maxSuggestions: 2,
    });
    const r = await capped(makeContext("[[") as never);
    expect(r!.options).toHaveLength(2);
  });

  it("returns null when no suggestion matches the typed prefix", async () => {
    const r = await source(makeContext("[[doesnotexist") as never);
    expect(r).toBeNull();
  });

  it("supports async getSuggestions (Promise return)", async () => {
    const asyncSource = buildWikilinkCompletionSource({
      getSuggestions: () => Promise.resolve(SAMPLE_NOTES),
    });
    const r = await asyncSource(makeContext("[[daily") as never);
    expect(r).not.toBeNull();
    expect(r!.options[0]).toMatchObject({ apply: "daily-2026-05-18]]" });
  });
});

describe("B3 — module + editor wiring", () => {
  it("wikilink-autocomplete uses @codemirror/autocomplete", () => {
    const src = read(SOURCE);
    expect(src).toMatch(/from\s+["']@codemirror\/autocomplete["']/);
    expect(src).toContain("autocompletion");
  });

  it("CodeMirrorMdEditor accepts extraExtensions prop (additive composition)", () => {
    const src = read(EDITOR);
    expect(src).toContain("extraExtensions");
    expect(src).toMatch(/\.\.\.\(extraExtensions\s*\?\?\s*\[\]\)/);
  });

  it("MarkdownEditorPane mounts the wikilink completion source", () => {
    const src = read(PANE);
    // After B4, the wikilink + tag sources are bundled into ONE
    // autocompletion() instance (CM6 allows only one per state).
    // Lock the source-import + composition shape.
    expect(src).toMatch(
      /import\s+\{\s*buildWikilinkCompletionSource\s*\}\s+from\s+["']\.\/wikilink-autocomplete["']/,
    );
    expect(src).toContain("buildWikilinkCompletionSource({");
    // Sources from the vault's listNotes (existing tRPC query).
    expect(src).toContain("agentStudio.vault.listNotes");
    // Excludes the current note from its own suggestion list.
    expect(src).toMatch(/n\.id\s*!==\s*noteId/);
    // The extension list is memoized so the editor doesn't tear down
    // on every parent render.
    expect(src).toContain("editorExtraExtensions");
    expect(src).toMatch(/useMemo\(\(\)\s*=>\s*\{[\s\S]*?autocompletion/);
  });
});
