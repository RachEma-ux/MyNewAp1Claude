/**
 * Bases create-base mutation — δ-slice (T-F.94 / T-F.2-δ).
 *
 * First mutation on the Bases page: "New base" button + inline
 * name-only form + Create/Cancel + pending UX + error surface.
 * Calls the pre-existing `createSavedView` tRPC procedure with
 * `viewKind="base"`; invalidates `listVisibleSavedViews` on success.
 *
 * δ ships name-only to unblock the page for first-use (cannot
 * create a base without it). Filters / columns / visibility
 * editing land in follow-up slices — the β-detail-view already
 * renders these fields when populated.
 *
 * Source-scan integrity test locks: mutation state slices, helper
 * bodies, button + inline form testids, server-input invocation
 * shape (vaultId + name + viewKind, no client-fabricated optional
 * fields), the no-empty-name + no-null-vault disable predicate, and
 * the onSuccess invalidate + close-form + clear-error.
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

describe("Bases create-base δ-slice (T-F.94 / T-F.2-δ)", () => {
  it("panel holds createOpen + createNameDraft + createError state slices", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[createOpen,\s*setCreateOpen\]\s*=\s*useState<boolean>/,
    );
    expect(src).toMatch(
      /const\s+\[createNameDraft,\s*setCreateNameDraft\]\s*=\s*useState<string>/,
    );
    expect(src).toMatch(
      /const\s+\[createError,\s*setCreateError\]\s*=\s*useState<string\s*\|\s*null>/,
    );
  });

  it("openCreateForm + closeCreateForm helpers manage the form state slices", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openCreateForm[\s\S]{0,300}setCreateOpen\(true\)[\s\S]{0,80}setCreateNameDraft\(""\)[\s\S]{0,80}setCreateError\(null\)/,
    );
    expect(src).toMatch(
      /function\s+closeCreateForm[\s\S]{0,200}setCreateOpen\(false\)[\s\S]{0,80}setCreateNameDraft\(""\)/,
    );
  });

  it("createSavedView mutation invalidates listVisibleSavedViews + closes form on success", () => {
    const src = readPanel();
    expect(src).toMatch(
      /createMutation\s*=\s*[\s\S]{0,300}createSavedView\.useMutation/,
    );
    expect(src).toMatch(
      /createMutation[\s\S]{0,500}onSuccess[\s\S]{0,500}closeCreateForm\(\)/,
    );
    expect(src).toMatch(
      /createMutation[\s\S]{0,800}utils\.agentStudio\.vault\.listVisibleSavedViews\.invalidate/,
    );
    expect(src).toMatch(
      /createMutation[\s\S]{0,800}onError[\s\S]{0,200}setCreateError\(err\.message\)/,
    );
  });

  it("New base button opens the form; hidden when the form is already open (mutual exclusion)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{!createOpen\s*\?\s*\([\s\S]{0,600}data-testid="bases-create-button"[\s\S]{0,400}onClick=\{openCreateForm\}/,
    );
    expect(src).toMatch(/New base…/);
  });

  it("inline form has name input + Confirm + Cancel + char-count testids", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="bases-create-form"/);
    expect(src).toMatch(/data-testid="bases-create-name-input"/);
    expect(src).toMatch(/data-testid="bases-create-confirm"/);
    expect(src).toMatch(/data-testid="bases-create-cancel"/);
    expect(src).toMatch(/createNameDraft\.length\}\s*\/\s*255/);
    expect(src).toMatch(/maxLength=\{255\}/);
  });

  it("Create button passes vaultId + trimmed name + viewKind:base only — no client-fabricated optional fields", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+trimmed\s*=\s*createNameDraft\.trim\(\)[\s\S]{0,800}createMutation\.mutate\(\{[\s\S]{0,400}vaultId:\s*effectiveVaultId[\s\S]{0,200}name:\s*trimmed[\s\S]{0,200}viewKind:\s*BASE_VIEW_KIND/,
    );
    // Should NOT spread filters / sort / columns — keep create slice
    // minimal so the diff stays narrowly reviewable.
    expect(src).not.toMatch(/createMutation\.mutate\([\s\S]{0,500}filters:/);
    expect(src).not.toMatch(/createMutation\.mutate\([\s\S]{0,500}columns:/);
  });

  it("Create button disables on empty-trimmed-name + null-vault + isPending", () => {
    const src = readPanel();
    expect(src).toMatch(
      /disabled=\{[\s\S]{0,300}createMutation\.isPending\s*\|\|\s*createNameDraft\.trim\(\)\s*===\s*""\s*\|\|\s*effectiveVaultId\s*===\s*null/,
    );
  });

  it("createError surface renders inside the form on mutation failure", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="bases-create-error"/);
  });

  it("name input + Confirm + Cancel all disable while the mutation is pending", () => {
    const src = readPanel();
    // Count the createMutation.isPending disable bindings — at least
    // 4 (button itself, input, Confirm, Cancel). Catches accidental
    // drops without coupling to surrounding layout.
    const matches = src.match(/createMutation\.isPending/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });
});
