/**
 * Bases bulk-delete — T-F.118 (T-F.2-ζ.2).
 *
 * Stacked on T-F.117 ζ.1 (selection model). Closes the within-Bases
 * bulk arc with server `deleteSavedViews` (plural) + two-step
 * confirm UX. Mirrors Quality Lens T-F.90 + Inbox T-F.111 bulk
 * shapes (composite state for one-bulk-gesture-at-a-time per
 * lesson 83).
 *
 * Source-scan covers BOTH halves:
 * - server: tRPC procedure + Zod input cap + service function shape
 * - client: composite state + mutation wiring + button gating +
 *   two-step confirm + result/error surfaces + selection-clear on
 *   success
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(rel: string): string {
  return readFileSync(resolve(__dirname, "../..", rel), "utf8");
}

describe("Bases bulk-delete ζ.2-slice (T-F.118 / T-F.2-ζ.2)", () => {
  it("server: deleteSavedViews service function exists with inArray-based bulk delete + empty short-circuit", () => {
    const src = read("server/agent-studio/services/vault/saved-views.ts");
    expect(src).toMatch(
      /export\s+async\s+function\s+deleteSavedViews\(\s*viewIds:\s*readonly\s+number\[\],/,
    );
    expect(src).toMatch(/Promise<\{\s*deletedCount:\s*number\s*\}>/);
    expect(src).toMatch(
      /if\s*\(viewIds\.length\s*===\s*0\)\s+return\s+\{\s*deletedCount:\s*0\s*\}/,
    );
    expect(src).toMatch(
      /\.delete\(agsVaultSavedViews\)[\s\S]{0,300}inArray\(agsVaultSavedViews\.id,\s*viewIds\s+as\s+number\[\]\)/,
    );
    expect(src).toMatch(
      /\.returning\(\{\s*id:\s*agsVaultSavedViews\.id\s*\}\)/,
    );
  });

  it("server: deleteSavedViews tRPC procedure capped at 200 IDs", () => {
    const src = read("server/agent-studio/services/vault/router.ts");
    expect(src).toMatch(/deleteSavedViews,\s*\n\s*SavedViewNotFoundError/);
    expect(src).toMatch(
      /deleteSavedViews:\s*protectedProcedure[\s\S]{0,500}viewIds:\s*z\.array\(z\.number\(\)\.int\(\)\.positive\(\)\)\.min\(0\)\.max\(200\)/,
    );
  });

  it("client: composite state slices (bulkDeleteConfirmOpen + bulkDeleteError + bulkDeleteResult)", () => {
    const src = read(
      "client/src/modules/agent-studio/components/BasesPanel.tsx",
    );
    expect(src).toMatch(
      /const\s+\[bulkDeleteConfirmOpen,\s*setBulkDeleteConfirmOpen\][\s\S]{0,200}useState<boolean>\(false\)/,
    );
    expect(src).toMatch(
      /const\s+\[bulkDeleteError,\s*setBulkDeleteError\][\s\S]{0,150}useState<string\s*\|\s*null>\(null\)/,
    );
    expect(src).toMatch(
      /const\s+\[bulkDeleteResult,\s*setBulkDeleteResult\][\s\S]{0,150}useState<string\s*\|\s*null>\(null\)/,
    );
  });

  it("client: bulkDeleteMutation onSuccess invalidates listVisibleSavedViews + clears selection + reports deletedCount", () => {
    const src = read(
      "client/src/modules/agent-studio/components/BasesPanel.tsx",
    );
    expect(src).toMatch(
      /trpc\.agentStudio\.vault\.deleteSavedViews\.useMutation/,
    );
    expect(src).toMatch(
      /bulkDeleteMutation[\s\S]{0,800}onSuccess[\s\S]{0,600}setBulkDeleteResult\(`Deleted \$\{res\.deletedCount\} base\(s\)\.`\)[\s\S]{0,200}clearBaseSelection\(\)[\s\S]{0,300}utils\.agentStudio\.vault\.listVisibleSavedViews\.invalidate\(\)/,
    );
  });

  it("client: Delete-N… button gated on !confirmOpen + names the selection count", () => {
    const src = read(
      "client/src/modules/agent-studio/components/BasesPanel.tsx",
    );
    expect(src).toMatch(
      /\{!bulkDeleteConfirmOpen\s*\?\s*\([\s\S]{0,800}data-testid=["']bases-bulk-delete["']/,
    );
    expect(src).toMatch(/Delete \{selectedBaseIds\.size\}…/);
  });

  it("client: confirm panel has destructive Confirm + Cancel + names the count + cannot-be-undone copy", () => {
    const src = read(
      "client/src/modules/agent-studio/components/BasesPanel.tsx",
    );
    expect(src).toMatch(
      /\{bulkDeleteConfirmOpen\s*\?\s*\([\s\S]{0,500}data-testid=["']bases-bulk-delete-confirm["']/,
    );
    expect(src).toMatch(
      /Delete \{selectedBaseIds\.size\} base\(s\)\? This cannot/,
    );
    expect(src).toMatch(
      /data-testid=["']bases-bulk-delete-confirm-button["']/,
    );
    expect(src).toMatch(/data-testid=["']bases-bulk-delete-cancel["']/);
    expect(src).toMatch(
      /bulkDeleteMutation\.mutate\(\{[\s\S]{0,200}viewIds:\s*Array\.from\(selectedBaseIds\)[\s\S]{0,100}\}\)/,
    );
  });

  it("client: result + error surfaces have distinct testids + onError nulls result; onSuccess nulls error", () => {
    const src = read(
      "client/src/modules/agent-studio/components/BasesPanel.tsx",
    );
    expect(src).toMatch(/data-testid=["']bases-bulk-delete-result["']/);
    expect(src).toMatch(/data-testid=["']bases-bulk-delete-error["']/);
    expect(src).toMatch(
      /onSuccess[\s\S]{0,400}setBulkDeleteError\(null\)/,
    );
    expect(src).toMatch(
      /onError[\s\S]{0,200}setBulkDeleteError\(err\.message\)[\s\S]{0,150}setBulkDeleteResult\(null\)/,
    );
  });

  it("client: bulk-selection bar UI updated from honesty-banner ('land in follow-up') to live action", () => {
    const src = read(
      "client/src/modules/agent-studio/components/BasesPanel.tsx",
    );
    expect(src).not.toMatch(
      /Bulk actions land in a follow-up slice/,
    );
  });
});
