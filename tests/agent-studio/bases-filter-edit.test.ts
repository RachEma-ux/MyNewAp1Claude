/**
 * Bases inline filter editor — γ-slice (T-F.101 / T-F.2-filter-γ).
 *
 * Wires the typed FilterDocumentSchema into the β detail view as a
 * JSON-textarea editor with Zod validation on Save. Operator can
 * author + persist typed filters via the existing
 * `updateSavedView` tRPC without any new server work. Rich
 * per-condition form is a follow-up polish slice — γ ships the
 * minimum viable "operators can edit filters now" surface.
 *
 * Source-scan integrity test locks: filter-language schema import
 * from the shared/ location (server/client safe), state shape,
 * helper bodies + multi-way mutual exclusion extensions, mutation
 * wiring, JSON-parse fallback + schema validation on Save, BaseRowDetail
 * editor wiring + testid namespace, and the mutual exclusion in
 * openRenameEditor / openDeleteConfirm to clear filter-edit state.
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

describe("Bases filter-edit γ-slice (T-F.101 / T-F.2-filter-γ)", () => {
  it("panel imports FilterDocumentSchema from shared/ (not server/) so client + server share the same schema source", () => {
    const src = readPanel();
    expect(src).toMatch(
      /import\s+\{\s*FilterDocumentSchema\s*\}\s+from\s+"@shared\/bases-filter-language"/,
    );
  });

  it("panel holds filterEditBaseId + filterEditDraft + filterEditError state slices", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[filterEditBaseId,\s*setFilterEditBaseId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
    expect(src).toMatch(
      /const\s+\[filterEditDraft,\s*setFilterEditDraft\]\s*=\s*useState<string>/,
    );
    expect(src).toMatch(
      /const\s+\[filterEditError,\s*setFilterEditError\]\s*=\s*useState<string\s*\|\s*null>/,
    );
  });

  it("openFilterEditor + closeFilterEditor helpers manage the slices + extend mutual exclusion to rename/delete", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openFilterEditor[\s\S]{0,700}setFilterEditBaseId\(baseId\)[\s\S]{0,200}setFilterEditDraft\(currentJson\)[\s\S]{0,200}setFilterEditError\(null\)[\s\S]{0,200}setRenameBaseId\(null\)[\s\S]{0,200}setConfirmDeleteBaseId\(null\)/,
    );
    expect(src).toMatch(
      /function\s+closeFilterEditor[\s\S]{0,300}setFilterEditBaseId\(null\)[\s\S]{0,200}setFilterEditDraft\(""\)[\s\S]{0,200}setFilterEditError\(null\)/,
    );
  });

  it("openRenameEditor + openDeleteConfirm now ALSO clear filter-edit state for symmetric mutual exclusion", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openRenameEditor[\s\S]{0,700}setFilterEditBaseId\(null\)/,
    );
    expect(src).toMatch(
      /function\s+openDeleteConfirm[\s\S]{0,700}setFilterEditBaseId\(null\)/,
    );
  });

  it("filterEditMutation uses updateSavedView + invalidates list + closes editor on success", () => {
    const src = readPanel();
    expect(src).toMatch(
      /filterEditMutation\s*=\s*[\s\S]{0,300}updateSavedView\.useMutation/,
    );
    expect(src).toMatch(
      /filterEditMutation[\s\S]{0,500}onSuccess[\s\S]{0,500}closeFilterEditor\(\)/,
    );
    expect(src).toMatch(
      /filterEditMutation[\s\S]{0,800}utils\.agentStudio\.vault\.listVisibleSavedViews\.invalidate/,
    );
    expect(src).toMatch(
      /filterEditMutation[\s\S]{0,800}onError[\s\S]{0,200}setFilterEditError\(err\.message\)/,
    );
  });

  it("Save handler runs JSON.parse → FilterDocumentSchema.safeParse → mutation in that order with per-stage error capture", () => {
    const src = readPanel();
    // JSON.parse failure path
    expect(src).toMatch(
      /JSON\.parse\(filterEditDraft\)[\s\S]{0,400}catch[\s\S]{0,300}setFilterEditError\([\s\S]{0,300}Invalid JSON/,
    );
    // Schema validation failure path
    expect(src).toMatch(
      /FilterDocumentSchema\.safeParse\(parsed\)[\s\S]{0,500}if\s*\(\s*!validated\.success\s*\)[\s\S]{0,300}setFilterEditError\([\s\S]{0,300}Schema validation failed/,
    );
    // Validated data passed to the mutation
    expect(src).toMatch(
      /filterEditMutation\.mutate\(\{[\s\S]{0,300}id:\s*b\.id[\s\S]{0,200}filters:\s*validated\.data/,
    );
  });

  it("Edit filters button on the detail Filters section is gated on !filterEdit.isOpen + has per-row testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{!filterEdit\.isOpen\s*\?\s*\([\s\S]{0,500}data-testid=\{`bases-row-detail-filters-edit-\$\{base\.id\}`\}[\s\S]{0,300}onClick=\{filterEdit\.onOpen\}/,
    );
    expect(src).toMatch(/Edit filters…/);
  });

  it("filter editor renders textarea + Save + Cancel + error surface with per-row testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-editor-\$\{base\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-textarea-\$\{base\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-save-\$\{base\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-cancel-\$\{base\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-error-\$\{base\.id\}`\}/,
    );
  });

  it("textarea + Save + Cancel all disable while the mutation is pending", () => {
    const src = readPanel();
    // The 3 disable bindings inside the editor (textarea + Save +
    // Cancel) all key on filterEdit.isPending. Plus the filterEdit
    // prop's isPending is derived in the parent from
    // filterEditMutation.isPending && variables.id === b.id.
    const inEditor = src.match(/disabled=\{filterEdit\.isPending\}/g);
    expect(inEditor).not.toBeNull();
    expect(inEditor!.length).toBeGreaterThanOrEqual(3);
    expect(src).toMatch(
      /filterEditMutation\.isPending\s*&&\s*filterEditMutation\.variables\?\.id\s*===\s*b\.id/,
    );
  });

  it("openFilterEditor pre-populates draft with JSON.stringify of the current filters (or empty V1 doc fallback)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /openFilterEditor\(\s*b\.id,\s*JSON\.stringify\([\s\S]{0,300}b\.filters\s*\?\?\s*\{\s*version:\s*1,\s*conditions:\s*\[\]\s*\}/,
    );
  });
});
