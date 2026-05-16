/**
 * Graph Quality Findings bulk-dismiss confirm UX + mutation — ζ.2
 * slice (T-F.90 / T-F.4-ζ.2).
 *
 * Second half of the bulk-dismiss arc — builds on T-F.89's selection
 * model + checkbox column by wiring the `bulkDismissFindings` tRPC
 * mutation through an inline bulk-confirm editor inside the bulk
 * selection bar. The bar gains:
 *   - A `Dismiss N…` button that opens an inline shared-reason
 *     textarea + Confirm/Cancel (mirrors the η editor shape).
 *   - An overflow warning + Confirm-button disable when the selection
 *     exceeds the server-side `findingIds.max(500)` cap.
 *   - Inline error surface inside the bar on mutation failure.
 *   - Above-the-table result surface "dismissed N, skipped M" after
 *     a successful round-trip (uses the server's `{dismissed, skipped}`
 *     payload from `bulkDismissFindings` / `dismiss-finding.ts`).
 *
 * Source-scan integrity test locks the mutation wiring, the editor
 * state slices, the cache invalidation + selection-clear on success,
 * the trim+conditional-spread on the optional bulk reason, the
 * BULK_DISMISS_MAX cap mirroring, and the per-testid namespace for
 * the new bulk-confirm controls.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx",
    ),
    "utf8",
  );
}

describe("Graph Quality Findings bulk-dismiss ζ.2-slice (T-F.90 / T-F.4-ζ.2)", () => {
  it("panel mirrors the server-side BULK_DISMISS_MAX cap (500) from router.ts", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+BULK_DISMISS_MAX\s*=\s*500/);
  });

  it("bulk editor state slices live at the panel level", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[bulkEditorOpen,\s*setBulkEditorOpen\]\s*=\s*useState<boolean>/,
    );
    expect(src).toMatch(
      /const\s+\[bulkReasonDraft,\s*setBulkReasonDraft\]\s*=\s*useState<string>/,
    );
    expect(src).toMatch(
      /const\s+\[bulkDismissError,\s*setBulkDismissError\]\s*=\s*useState<string\s*\|\s*null>/,
    );
    expect(src).toMatch(
      /const\s+\[bulkDismissResult,\s*setBulkDismissResult\]\s*=\s*useState<\{[\s\S]{0,200}dismissed:\s*number[\s\S]{0,200}skipped:\s*number/,
    );
  });

  it("openBulkEditor + closeBulkEditor helpers manage the editor slice", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openBulkEditor[\s\S]{0,400}setBulkEditorOpen\(true\)[\s\S]{0,200}setBulkReasonDraft\(""\)[\s\S]{0,200}setBulkDismissError\(null\)[\s\S]{0,200}setBulkDismissResult\(null\)/,
    );
    expect(src).toMatch(
      /function\s+closeBulkEditor[\s\S]{0,200}setBulkEditorOpen\(false\)[\s\S]{0,80}setBulkReasonDraft\(""\)/,
    );
  });

  it("clearSelection (ζ.1) now ALSO clears the bulk editor state to keep the bar's modes coherent", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+clearSelection[\s\S]{0,400}setSelectedFindingIds\(new\s+Set\(\)\)[\s\S]{0,200}setBulkEditorOpen\(false\)[\s\S]{0,200}setBulkReasonDraft\(""\)[\s\S]{0,200}setBulkDismissError\(null\)/,
    );
  });

  it("bulkDismissFindings mutation wires invalidate + selection-clear + close-editor on success", () => {
    const src = readPanel();
    expect(src).toMatch(
      /bulkDismissMutation\s*=\s*[\s\S]{0,300}bulkDismissFindings\.useMutation/,
    );
    expect(src).toMatch(
      /bulkDismissMutation[\s\S]{0,800}onSuccess[\s\S]{0,800}setSelectedFindingIds\(new\s+Set\(\)\)/,
    );
    expect(src).toMatch(
      /bulkDismissMutation[\s\S]{0,800}onSuccess[\s\S]{0,800}setBulkEditorOpen\(false\)/,
    );
    expect(src).toMatch(
      /bulkDismissMutation[\s\S]{0,1200}utils\.agentStudio\.graphQuality\.listFindings\.invalidate/,
    );
    expect(src).toMatch(
      /bulkDismissMutation[\s\S]{0,1200}utils\.agentStudio\.graphQuality\.getStats\.invalidate/,
    );
  });

  it("server result is captured into bulkDismissResult via length-counting on dismissed + skipped arrays", () => {
    const src = readPanel();
    expect(src).toMatch(
      /setBulkDismissResult\(\{[\s\S]{0,300}dismissed:\s*data\?\.dismissed\?\.length[\s\S]{0,200}skipped:\s*data\?\.skipped\?\.length/,
    );
  });

  it("Dismiss button opens the editor; hidden when the editor is already open (mutual exclusion)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{!bulkEditorOpen\s*\?\s*\([\s\S]{0,600}data-testid="graph-quality-bulk-dismiss-button"[\s\S]{0,400}onClick=\{openBulkEditor\}/,
    );
    // Button label includes the live count so the operator confirms
    // what they're about to dismiss before opening the editor.
    expect(src).toMatch(/Dismiss \{selectedFindingIds\.size\}…/);
  });

  it("inline editor has textarea + Confirm + Cancel + char-count testids", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-quality-bulk-dismiss-editor"/);
    expect(src).toMatch(/data-testid="graph-quality-bulk-dismiss-textarea"/);
    expect(src).toMatch(/data-testid="graph-quality-bulk-dismiss-confirm"/);
    expect(src).toMatch(/data-testid="graph-quality-bulk-dismiss-cancel"/);
    expect(src).toMatch(/bulkReasonDraft\.length\}\s*\/\s*2000/);
    // Textarea respects the server's 2000-char limit.
    expect(src).toMatch(/maxLength=\{2000\}/);
  });

  it("Confirm trims the draft + spreads `reason` only when non-empty + always passes findingIds array", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+trimmed\s*=\s*bulkReasonDraft\.trim\(\)[\s\S]{0,800}bulkDismissMutation\.mutate\(\{[\s\S]{0,400}findingIds:\s*Array\.from\(selectedFindingIds\)[\s\S]{0,400}\.\.\.\(trimmed\s*!==\s*""\s*\?\s*\{\s*reason:\s*trimmed\s*\}\s*:\s*\{\}\)/,
    );
  });

  it("BULK_DISMISS_MAX overflow disables Confirm + shows a testid-tagged warning", () => {
    const src = readPanel();
    expect(src).toMatch(
      /selectedFindingIds\.size\s*>\s*BULK_DISMISS_MAX[\s\S]{0,800}data-testid="graph-quality-bulk-dismiss-overflow"/,
    );
    // Confirm button disable predicate references the same cap.
    // The disabled binding is on the same <button> element as the
    // testid; assert both directions of attribute ordering by anchoring
    // on the disable predicate near the testid token.
    expect(src).toMatch(
      /disabled=\{[\s\S]{0,200}bulkDismissMutation\.isPending\s*\|\|\s*selectedFindingIds\.size\s*>\s*BULK_DISMISS_MAX[\s\S]{0,400}data-testid="graph-quality-bulk-dismiss-confirm"/,
    );
  });

  it("bulkDismissError surface lives inside the bar; bulkDismissResult lives above the table", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-quality-bulk-dismiss-error"/);
    expect(src).toMatch(/data-testid="graph-quality-bulk-dismiss-result"/);
    // Result copy mentions both counts so the operator sees the
    // partial-success breakdown.
    expect(src).toMatch(
      /Bulk dismiss complete:[\s\S]{0,400}dismissed[\s\S]{0,200}skipped/,
    );
  });

  it("textarea + Confirm + Cancel + Clear-selection + Dismiss button all disable while the bulk mutation is pending", () => {
    const src = readPanel();
    // Count the bulkDismissMutation.isPending disable bindings — at
    // least 5 (Dismiss button, Clear-selection, textarea, Confirm,
    // Cancel). Counting catches accidental drops without coupling to
    // surrounding layout.
    const matches = src.match(/bulkDismissMutation\.isPending/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(6);
  });
});
