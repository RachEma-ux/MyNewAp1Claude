/**
 * Track B — B2 — CodeMirror 6 live-preview editor.
 *
 * Locks the structural invariants of the new CodeMirrorMdEditor
 * wrapper + its mount inside MarkdownEditorPane's `edit` mode.
 * Behavioral testing of CM6 itself is the responsibility of the
 * upstream library; this test ensures we wire it correctly.
 *
 * ADR: Track B — Obsidian-style editor parity per
 *      ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const EDITOR = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/CodeMirrorMdEditor.tsx",
);
const PANE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/MarkdownEditorPane.tsx",
);
const BARREL = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/index.ts",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("B2 — CodeMirrorMdEditor", () => {
  const src = read(EDITOR);

  it("imports the canonical CM6 packages (no shadow library)", () => {
    expect(src).toMatch(/from\s+["']@codemirror\/state["']/);
    expect(src).toMatch(/from\s+["']@codemirror\/view["']/);
    expect(src).toMatch(/from\s+["']@codemirror\/commands["']/);
    expect(src).toMatch(/from\s+["']@codemirror\/lang-markdown["']/);
  });

  it("composes the markdown language extension", () => {
    expect(src).toContain("markdown()");
  });

  it("enables undo/redo history + the default keymap", () => {
    expect(src).toContain("history()");
    expect(src).toContain("historyKeymap");
    expect(src).toContain("defaultKeymap");
  });

  it("enables line wrapping (Obsidian prose default — no horizontal scroll)", () => {
    expect(src).toContain("EditorView.lineWrapping");
  });

  it("readOnly is reconfigurable via Compartment (no view teardown on toggle)", () => {
    expect(src).toMatch(/new\s+Compartment\(\)/);
    expect(src).toContain("reconfigure");
  });

  it("update-listener fires onChange ONLY when doc changed (no spam on selection)", () => {
    expect(src).toMatch(
      /updateListener[\s\S]*?if\s*\(\s*!update\.docChanged\s*\)\s*return/,
    );
  });

  it("syncs incoming `value` prop without wiping cursor state", () => {
    // Look for the value→dispatch effect with the same-string short-
    // circuit (avoid feedback loops + cursor reset on echo).
    expect(src).toMatch(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(current\s*===\s*value\)\s*return[\s\S]*?\}, \[value\]\);/,
    );
  });

  it("destroys the EditorView on unmount (no DOM leak)", () => {
    expect(src).toMatch(/view\.destroy\(\)/);
    expect(src).toMatch(/return\s*\(\)\s*=>\s*\{/);
  });
});

describe("B2 — MarkdownEditorPane wires CodeMirrorMdEditor in edit mode", () => {
  const src = read(PANE);

  it("imports CodeMirrorMdEditor", () => {
    expect(src).toMatch(
      /import\s+CodeMirrorMdEditor\s+from\s+["']\.\/CodeMirrorMdEditor["']/,
    );
  });

  it("renders CodeMirrorMdEditor in edit mode (the old textarea is gone)", () => {
    expect(src).toContain("<CodeMirrorMdEditor");
    expect(src).toContain('testId="markdown-editor-cm-edit"');
    // The old edit-mode textarea (with testid markdown-editor-
    // textarea-edit) is no longer present.
    expect(src).not.toContain("markdown-editor-textarea-edit");
  });

  it("source mode keeps the textarea (power-user raw view)", () => {
    expect(src).toContain("markdown-editor-textarea-source");
  });

  it("CodeMirror value is bound to liveText (the dirty-aware draft)", () => {
    expect(src).toMatch(/<CodeMirrorMdEditor[\s\S]*?value=\{liveText\}/);
  });

  it("CodeMirror onChange routes through setDraftMd (preserves auto-save wiring)", () => {
    expect(src).toMatch(
      /<CodeMirrorMdEditor[\s\S]*?onChange=\{[\s\S]*?setDraftMd\(next\)[\s\S]*?\}/,
    );
  });
});

describe("B2 — barrel", () => {
  it("re-exports CodeMirrorMdEditor", () => {
    const src = read(BARREL);
    expect(src).toMatch(
      /export \{ default as CodeMirrorMdEditor \} from "\.\/CodeMirrorMdEditor"/,
    );
  });
});
