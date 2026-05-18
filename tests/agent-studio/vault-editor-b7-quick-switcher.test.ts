/**
 * Track B — B7 — Cmd-P quick switcher.
 *
 * Behavioral tests of the pure `filterQuickSwitcherEntries` matcher
 * + structural locks on the modal, keybinding hook, and
 * GraphWorkspacePage mount.
 *
 * Closes Track B (B2-B7 editor parity) of the autonomous Obsidian-
 * style vault initiative.
 *
 * Authority: ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  filterQuickSwitcherEntries,
  type QuickSwitcherEntry,
} from "../../client/src/modules/agent-studio/components/graph-workspace/QuickSwitcherModal";

const MODAL = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/QuickSwitcherModal.tsx",
);
const PAGE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/pages/GraphWorkspacePage.tsx",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

const ENTRIES: QuickSwitcherEntry[] = [
  { vaultId: 1, vaultName: "Personal", noteId: 1, title: "Project Alpha", slug: "project-alpha" },
  { vaultId: 1, vaultName: "Personal", noteId: 2, title: "Daily 2026-05-18", slug: "daily-2026-05-18" },
  { vaultId: 2, vaultName: "Work", noteId: 3, title: "Q4 Retrospective", slug: "q4-retro" },
  { vaultId: 2, vaultName: "Work", noteId: 4, title: "Research notes", slug: "research-rag" },
  { vaultId: 2, vaultName: "Work", noteId: 5, title: "Notes on AI", slug: "ai-notes" },
];

describe("B7 — filterQuickSwitcherEntries", () => {
  it("empty query returns all entries (capped)", () => {
    const r = filterQuickSwitcherEntries(ENTRIES, "");
    expect(r).toHaveLength(5);
  });

  it("case-insensitive substring matches against the title", () => {
    const r = filterQuickSwitcherEntries(ENTRIES, "retro");
    expect(r.map((e) => e.title)).toEqual(["Q4 Retrospective"]);
  });

  it("matches against the slug too", () => {
    const r = filterQuickSwitcherEntries(ENTRIES, "research-rag");
    expect(r.map((e) => e.title)).toEqual(["Research notes"]);
  });

  it("earlier title-position hits outrank later ones", () => {
    // "Notes on AI" (title hit at 0) should outrank "Research notes"
    // (title hit at 9) even though both contain "notes".
    const r = filterQuickSwitcherEntries(ENTRIES, "notes");
    expect(r[0]!.title).toBe("Notes on AI");
    expect(r.map((e) => e.title)).toContain("Research notes");
  });

  it("returns empty array when no entry matches", () => {
    const r = filterQuickSwitcherEntries(ENTRIES, "definitelynotapresent");
    expect(r).toEqual([]);
  });

  it("query is trimmed (whitespace-only is treated as empty)", () => {
    const r = filterQuickSwitcherEntries(ENTRIES, "   ");
    expect(r).toHaveLength(5);
  });
});

describe("B7 — QuickSwitcherModal structural lock", () => {
  const src = read(MODAL);

  it("exports `useQuickSwitcherKeybinding` hook for the global Cmd+P", () => {
    expect(src).toMatch(/export function useQuickSwitcherKeybinding/);
  });

  it("Cmd+P / Ctrl+P intercepted via metaKey || ctrlKey + key 'p'", () => {
    expect(src).toMatch(/e\.metaKey\s*\|\|\s*e\.ctrlKey/);
    expect(src).toMatch(/e\.key\.toLowerCase\(\)\s*===\s*["']p["']/);
    expect(src).toMatch(/e\.preventDefault\(\)/);
  });

  it("Escape closes the modal", () => {
    expect(src).toMatch(/e\.key\s*===\s*["']Escape["']/);
  });

  it("Arrow keys + Enter on the input handle keyboard navigation", () => {
    expect(src).toContain('"ArrowDown"');
    expect(src).toContain('"ArrowUp"');
    expect(src).toContain('"Enter"');
  });

  it("renders empty-state when no matches", () => {
    expect(src).toContain('data-testid="quick-switcher-empty"');
  });

  it("highlighted row has data-highlighted attribute", () => {
    expect(src).toContain('data-highlighted={idx === highlight');
  });

  it("uses listMyVaults + listNotes (reuses existing tRPC, no new server route)", () => {
    expect(src).toContain("agentStudio.vault.listMyVaults");
    expect(src).toContain("agentStudio.vault.listNotes");
  });
});

describe("B7 — GraphWorkspacePage mount", () => {
  const src = read(PAGE);

  it("imports QuickSwitcherModal + useQuickSwitcherKeybinding from the barrel", () => {
    expect(src).toContain("QuickSwitcherModal");
    expect(src).toContain("useQuickSwitcherKeybinding");
  });

  it("renders the QuickSwitcherModal with onSelect navigating to (vault, note)", () => {
    expect(src).toMatch(/<QuickSwitcherModal[\s\S]*?onSelect=\{\(vaultId, noteId\)/);
    expect(src).toContain("setSelectedVaultId(vaultId)");
    expect(src).toContain("setSelectedNoteId(noteId)");
  });
});
