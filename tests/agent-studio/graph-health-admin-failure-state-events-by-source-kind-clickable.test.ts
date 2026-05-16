/**
 * T-I.66 — Clickable source-kind cells on the by-source-kind table
 * + filter-chip indicator.
 *
 * Applies the (j) drill-in pattern to the sourceKind axis, mirroring
 * T-I.65 on the by-kind table. sourceKind is open-ended (no fixed
 * enum), so the UX is "click a row to filter" — no dropdown. The
 * active filter is shown via a chip + Clear button above the events
 * card so operators can dismiss the filter without scrolling back to
 * the row that may now be off-screen after the buffer narrows.
 *
 * Source-scan asserts:
 *   1. New state `sourceKindFilter: useState<string | null>(null)`.
 *   2. useQuery passes `sourceKind: sourceKindFilter ?? undefined`.
 *   3. Per-row testid on the by-source-kind table.
 *   4. Per-button testid on the by-source-kind table.
 *   5. Button onClick toggles `setSourceKindFilter(sourceKindFilter === sourceKind ? null : sourceKind)`.
 *   6. Active row gets `bg-muted/50` highlight.
 *   7. Filter chip renders only when `sourceKindFilter !== null`.
 *   8. Chip has a Clear button.
 *   9. Cell still rendered inside the existing by-source-kind table
 *      (not a new table).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.66 — clickable by-source-kind table + filter chip", () => {
  const src = readFileSync(panelPath, "utf8");

  it("declares sourceKindFilter as useState<string | null>(null)", () => {
    expect(src).toContain("setSourceKindFilter");
    expect(
      /sourceKindFilter[\s\S]{0,200}useState<string \| null>\(\s*\n?\s*null/.test(
        src,
      ),
    ).toBe(true);
  });

  it("useQuery passes sourceKind: sourceKindFilter ?? undefined", () => {
    expect(src).toContain("sourceKind: sourceKindFilter ?? undefined");
  });

  it("per-row testid on the by-source-kind table", () => {
    expect(src).toContain(
      "data-testid={`graph-health-failure-state-events-by-source-kind-row-${sourceKind}`}",
    );
  });

  it("per-button testid on the by-source-kind table", () => {
    expect(src).toContain(
      "data-testid={`graph-health-failure-state-events-by-source-kind-filter-${sourceKind}`}",
    );
  });

  it("button onClick toggles setSourceKindFilter on/off for the active sourceKind", () => {
    // Multiline trailing-comma form, same shape as T-I.65 — use
    // discriminating snippet without the closing paren.
    expect(
      /setSourceKindFilter\(\s*sourceKindFilter\s*===\s*sourceKind\s*\?\s*null\s*:\s*sourceKind/.test(
        src,
      ),
    ).toBe(true);
  });

  it("active row gets a bg-muted highlight (visual filter feedback)", () => {
    expect(
      /sourceKindFilter\s*===\s*sourceKind\s*\?\s*"bg-muted\/50"\s*:\s*""/.test(
        src,
      ),
    ).toBe(true);
  });

  it("filter chip renders only when sourceKindFilter !== null", () => {
    expect(
      /sourceKindFilter\s*!==\s*null\s*\?\s*\([\s\S]{0,1500}graph-health-failure-state-events-source-kind-filter-chip/.test(
        src,
      ),
    ).toBe(true);
  });

  it("chip exposes a Clear button to dismiss the filter", () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-source-kind-filter-clear"',
    );
    expect(
      /onClick=\{\(\)\s*=>\s*setSourceKindFilter\(null\)\}/.test(src),
    ).toBe(true);
  });

  it("clickable cells live inside the existing by-source-kind table (not a new table)", () => {
    const tableStart = src.indexOf(
      'data-testid="graph-health-failure-state-events-by-source-kind-table"',
    );
    const buttonTestidIdx = src.indexOf(
      "graph-health-failure-state-events-by-source-kind-filter-${sourceKind}",
    );
    expect(tableStart).toBeGreaterThan(0);
    expect(buttonTestidIdx).toBeGreaterThan(tableStart);
    const between = src.slice(tableStart, buttonTestidIdx);
    expect(between).not.toMatch(/<table\s/);
  });

  it("composes with the kind filter — both filters thread through the same useQuery", () => {
    // Both `kind:` and `sourceKind:` appear on the listRecentFailureStateEvents.useQuery args.
    const queryStart = src.indexOf(
      "trpc.agentStudio.workspaceObservability.listRecentFailureStateEvents.useQuery",
    );
    expect(queryStart).toBeGreaterThan(0);
    const queryWindow = src.slice(queryStart, queryStart + 800);
    expect(queryWindow).toContain("kind: kindFilter !== null");
    expect(queryWindow).toContain("sourceKind: sourceKindFilter ?? undefined");
  });
});
