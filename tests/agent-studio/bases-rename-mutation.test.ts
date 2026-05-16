/**
 * Bases per-row rename mutation — ε-slice (T-F.95 / T-F.2-ε).
 *
 * Second mutation after δ-create. Per-row rename inline editor:
 * "Rename…" button on each row opens an inline input pre-populated
 * with the current name + Confirm/Cancel + char counter.
 *
 * Calls the pre-existing `updateSavedView` tRPC procedure with
 * `id + name` only — no other optional fields. Disable predicate
 * prevents no-op submission when the trimmed draft is empty OR
 * equals the current name. Mirrors the Quality Lens η/ε editor
 * pattern (parallel state slices per lesson 55; per-row pending UX
 * via `mutation.variables.id === b.id`).
 *
 * Source-scan integrity test locks state shape, helper bodies +
 * mutual exclusion with expandedBaseId, mutation wiring, per-row
 * pending pattern, server-input invocation shape, no-op disable
 * predicate, and editor testid namespace.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/BasesPanel.tsx",
    ),
    "utf8",
  );
}

describe("Bases per-row rename ε-slice (T-F.95 / T-F.2-ε)", () => {
  it("panel holds renameBaseId + renameDraft + renameError parallel state slices", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[renameBaseId,\s*setRenameBaseId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
    expect(src).toMatch(
      /const\s+\[renameDraft,\s*setRenameDraft\]\s*=\s*useState<string>/,
    );
    expect(src).toMatch(
      /const\s+\[renameError,\s*setRenameError\]\s*=\s*useState<string\s*\|\s*null>/,
    );
  });

  it("openRenameEditor pre-populates the draft with the current name + clears expandedBaseId for mutual exclusion", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openRenameEditor[\s\S]{0,500}setRenameBaseId\(baseId\)[\s\S]{0,200}setRenameDraft\(currentName\)[\s\S]{0,200}setRenameError\(null\)[\s\S]{0,200}setExpandedBaseId\(null\)/,
    );
    expect(src).toMatch(
      /function\s+closeRenameEditor[\s\S]{0,200}setRenameBaseId\(null\)[\s\S]{0,80}setRenameDraft\(""\)/,
    );
  });

  it("updateSavedView mutation invalidates listVisibleSavedViews + closes editor on success", () => {
    const src = readPanel();
    expect(src).toMatch(
      /renameMutation\s*=\s*[\s\S]{0,300}updateSavedView\.useMutation/,
    );
    expect(src).toMatch(
      /renameMutation[\s\S]{0,500}onSuccess[\s\S]{0,500}closeRenameEditor\(\)/,
    );
    expect(src).toMatch(
      /renameMutation[\s\S]{0,800}utils\.agentStudio\.vault\.listVisibleSavedViews\.invalidate/,
    );
    expect(src).toMatch(
      /renameMutation[\s\S]{0,800}onError[\s\S]{0,200}setRenameError\(err\.message\)/,
    );
  });

  it("isRenamePending resolves per-row via mutation.variables.id", () => {
    const src = readPanel();
    expect(src).toMatch(
      /isRenamePending\s*=[\s\S]{0,200}renameMutation\.isPending\s*&&\s*renameMutation\.variables\?\.id\s*===\s*b\.id/,
    );
  });

  it("Rename button is per-row + hidden when the editor is open for the same row", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{!isRenaming\s*\?\s*\([\s\S]{0,500}data-testid=\{`bases-row-rename-\$\{b\.id\}`\}[\s\S]{0,200}onClick=\{\(\)\s*=>\s*openRenameEditor\(b\.id,\s*b\.name\)\}/,
    );
    expect(src).toMatch(/Rename…/);
  });

  it("inline editor has input + Confirm + Cancel + char-count testids", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=\{`bases-row-rename-row-\$\{b\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-rename-input-\$\{b\.id\}`\}/);
    expect(src).toMatch(
      /data-testid=\{`bases-row-rename-confirm-\$\{b\.id\}`\}/,
    );
    expect(src).toMatch(/data-testid=\{`bases-row-rename-cancel-\$\{b\.id\}`\}/);
    expect(src).toMatch(/renameDraft\.length\}\s*\/\s*255/);
    expect(src).toMatch(/maxLength=\{255\}/);
  });

  it("Confirm passes id + trimmed name only — no other client-fabricated fields", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+trimmed\s*=\s*renameDraft\.trim\(\)[\s\S]{0,800}renameMutation\.mutate\(\{[\s\S]{0,400}id:\s*b\.id[\s\S]{0,200}name:\s*trimmed/,
    );
    expect(src).not.toMatch(/renameMutation\.mutate\([\s\S]{0,500}filters:/);
    expect(src).not.toMatch(/renameMutation\.mutate\([\s\S]{0,500}columns:/);
    expect(src).not.toMatch(/renameMutation\.mutate\([\s\S]{0,500}sort:/);
  });

  it("Confirm button disables on no-op (trimmed empty OR same as current b.name) + isPending", () => {
    const src = readPanel();
    expect(src).toMatch(
      /disabled=\{[\s\S]{0,300}isRenamePending\s*\|\|\s*renameDraft\.trim\(\)\s*===\s*""\s*\|\|\s*renameDraft\.trim\(\)\s*===\s*b\.name/,
    );
  });

  it("per-row renameError surface lives inside the rename row", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=\{`bases-row-rename-error-\$\{b\.id\}`\}/);
  });
});
