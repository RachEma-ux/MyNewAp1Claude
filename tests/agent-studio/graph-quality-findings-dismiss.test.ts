/**
 * Graph Quality Findings dismiss button — δ-slice (T-F.85 / T-F.4-δ).
 *
 * Adds the first per-row mutation: Dismiss button on `status="open"`
 * rows wired to the pre-existing `dismissFinding` tRPC procedure
 * (server work was done months ago). On success the panel
 * invalidates listFindings + getStats so both the table and the
 * by-status bucket card refresh. On failure the error message
 * surfaces inline above the table.
 *
 * Source-scan integrity test locks the mutation wiring + the row-
 * gating predicate (only "open" status is dismissable) + the
 * isPending UX + the cache invalidation chain.
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

describe("Graph Quality Findings dismiss δ-slice (T-F.85 / T-F.4-δ)", () => {
  it("panel uses dismissFinding mutation + trpc.useUtils for cache invalidation", () => {
    const src = readPanel();
    expect(src).toMatch(
      /trpc\.agentStudio\.graphQuality\.dismissFinding\.useMutation/,
    );
    expect(src).toMatch(/const\s+utils\s*=\s*trpc\.useUtils\(\)/);
  });

  it("onSuccess invalidates BOTH listFindings AND getStats so by-status bucket card refreshes too", () => {
    const src = readPanel();
    expect(src).toMatch(
      /onSuccess[\s\S]{0,300}utils\.agentStudio\.graphQuality\.listFindings\.invalidate/,
    );
    expect(src).toMatch(
      /onSuccess[\s\S]{0,400}utils\.agentStudio\.graphQuality\.getStats\.invalidate/,
    );
  });

  it("Dismiss button only renders when status === 'open' (per-row gating)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+isDismissable\s*=\s*f\.status\s*===\s*"open"/,
    );
    // The cell is empty for non-dismissable rows (already triaged /
    // applied / dismissed) — guards against double-dismiss + keeps
    // the table tidy. After T-F.87 the predicate is
    // `isDismissable && !isReasonOpen` so the button hides while the
    // inline reason editor is open for the same row.
    expect(src).toMatch(/isDismissable\s*(?:\?|&&)/);
  });

  it("isPending UX: per-row resolution + disabled binding (label flip moved to reason editor at T-F.87)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /isPending\s*=[\s\S]{0,200}dismissMutation\.isPending\s*&&\s*dismissMutation\.variables\?\.findingId\s*===\s*f\.id/,
    );
    // After T-F.87 the inline dismiss button no longer carries the
    // "Dismissing…" label (it now opens an editor); the label flip
    // lives on the Confirm button inside the editor. Just assert
    // `disabled={isPending}` is wired up.
    expect(src).toMatch(/disabled=\{isPending\}/);
  });

  it("per-row Dismiss button has a per-id testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-dismiss-\$\{f\.id\}`\}/,
    );
  });

  it("dismissError surface renders above the table on mutation failure", () => {
    const src = readPanel();
    expect(src).toMatch(
      /onError:\s*\(err\)\s*=>\s*setDismissError\(err\.message\)/,
    );
    expect(src).toMatch(/data-testid="graph-quality-dismiss-error"/);
  });

  it("table header has a trailing empty <th> for the action button column (T-F.89 added a leading checkbox col ahead of id)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<thead>[\s\S]{0,1200}<th[^>]*>id<\/th>[\s\S]{0,200}<th[^>]*>class<\/th>[\s\S]{0,200}<th[^>]*>severity<\/th>[\s\S]{0,200}<th[^>]*>status<\/th>[\s\S]{0,200}<th[^>]*>source<\/th>[\s\S]{0,200}<th[^>]*><\/th>/,
    );
  });
});
