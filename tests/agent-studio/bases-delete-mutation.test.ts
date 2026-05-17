/**
 * Bases per-row delete mutation — η-slice (T-F.96 / T-F.2-η).
 *
 * Third mutation after δ-create + ε-rename. Two-step confirm
 * pattern: "Delete…" button opens an inline confirmation prompt
 * (NOT a modal); operator clicks Confirm delete to fire the
 * mutation, Cancel to abort. The two-step gate prevents a single
 * click from losing data.
 *
 * Calls the pre-existing `deleteSavedView` tRPC procedure with
 * `viewId` only. Mutual exclusion with expand / rename via the
 * `openDeleteConfirm` helper clearing the other state slices —
 * the row is always in exactly one of {none, detail, rename,
 * delete-confirm}.
 *
 * Source-scan integrity test locks state shape, helper bodies +
 * four-way mutual exclusion, mutation wiring, per-row pending
 * pattern, button mutual exclusion, confirm prompt content, and
 * the delete row + cancel + error testid namespace.
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

describe("Bases per-row delete η-slice (T-F.96 / T-F.2-η)", () => {
  it("panel holds confirmDeleteBaseId + deleteError state slices", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[confirmDeleteBaseId,\s*setConfirmDeleteBaseId\]\s*=\s*useState<[\s\S]{0,80}number\s*\|\s*null/,
    );
    expect(src).toMatch(
      /const\s+\[deleteError,\s*setDeleteError\]\s*=\s*useState<string\s*\|\s*null>/,
    );
  });

  it("openDeleteConfirm clears expandedBaseId + rename slices via closeAllRowEdits + sets confirm id", () => {
    // T-F.116 refactor: rename/filter/sort/columns clears moved
    // into closeAllRowEdits(). openDeleteConfirm calls
    // closeAllRowEdits() THEN setExpandedBaseId(null) THEN
    // setConfirmDeleteBaseId(baseId). The 4-way mutual exclusion
    // invariant lives on through the helper.
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openDeleteConfirm[\s\S]{0,400}closeAllRowEdits\(\)[\s\S]{0,200}setExpandedBaseId\(null\)[\s\S]{0,200}setConfirmDeleteBaseId\(baseId\)/,
    );
    expect(src).toMatch(
      /function\s+closeDeleteConfirm[\s\S]{0,200}setConfirmDeleteBaseId\(null\)/,
    );
  });

  it("openRenameEditor (ε) clears confirmDeleteBaseId via closeAllRowEdits", () => {
    // T-F.116: the confirmDelete clear is now inside
    // closeAllRowEdits(), which openRenameEditor calls. Test the
    // contract via the helper presence.
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openRenameEditor[\s\S]{0,400}closeAllRowEdits\(\)/,
    );
    expect(src).toMatch(
      /function\s+closeAllRowEdits[\s\S]{0,600}setConfirmDeleteBaseId\(null\)/,
    );
  });

  it("deleteSavedView mutation invalidates listVisibleSavedViews + closes prompt on success", () => {
    const src = readPanel();
    expect(src).toMatch(
      /deleteMutation\s*=\s*[\s\S]{0,300}deleteSavedView\.useMutation/,
    );
    expect(src).toMatch(
      /deleteMutation[\s\S]{0,500}onSuccess[\s\S]{0,500}closeDeleteConfirm\(\)/,
    );
    expect(src).toMatch(
      /deleteMutation[\s\S]{0,800}utils\.agentStudio\.vault\.listVisibleSavedViews\.invalidate/,
    );
    expect(src).toMatch(
      /deleteMutation[\s\S]{0,800}onError[\s\S]{0,200}setDeleteError\(err\.message\)/,
    );
  });

  it("isDeletePending resolves per-row via mutation.variables.viewId", () => {
    const src = readPanel();
    expect(src).toMatch(
      /isDeletePending\s*=[\s\S]{0,200}deleteMutation\.isPending\s*&&\s*deleteMutation\.variables\?\.viewId\s*===\s*b\.id/,
    );
  });

  it("Delete button is per-row + hidden when the confirm prompt is open for the same row", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{!isConfirmingDelete\s*\?\s*\([\s\S]{0,500}data-testid=\{`bases-row-delete-\$\{b\.id\}`\}[\s\S]{0,200}onClick=\{\(\)\s*=>\s*openDeleteConfirm\(b\.id\)\}/,
    );
    expect(src).toMatch(/Delete…/);
  });

  it("confirm prompt names the base by name AND id, with 'cannot be undone' warning", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=\{`bases-row-delete-prompt-\$\{b\.id\}`\}/);
    expect(src).toMatch(
      /Delete base\s*<strong>\{b\.name\}<\/strong>[\s\S]{0,200}\{b\.id\}/,
    );
    expect(src).toMatch(/cannot be undone/);
  });

  it("Confirm delete button + Cancel + Error surface all have per-row testids", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=\{`bases-row-delete-row-\$\{b\.id\}`\}/);
    expect(src).toMatch(
      /data-testid=\{`bases-row-delete-confirm-\$\{b\.id\}`\}/,
    );
    expect(src).toMatch(/data-testid=\{`bases-row-delete-cancel-\$\{b\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-delete-error-\$\{b\.id\}`\}/);
  });

  it("Confirm delete invokes mutation with viewId only — no other fields", () => {
    const src = readPanel();
    expect(src).toMatch(
      /onClick=\{\(\)\s*=>\s*deleteMutation\.mutate\(\{\s*viewId:\s*b\.id\s*\}\)/,
    );
  });

  it("Confirm + Cancel both disable while the delete mutation is pending", () => {
    const src = readPanel();
    // Two disabled={isDeletePending} bindings inside the confirm row
    // (Confirm + Cancel), plus the top-level Delete button has the
    // same predicate. Counting catches accidental drops.
    const matches = src.match(/isDeletePending/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });
});
