/**
 * Graph Lens browser — edges-preview drill-in composition (T-F.81).
 *
 * The 3-axis drill-in (typeKey / visibility / search) narrows the
 * nodes table but the edges table currently still renders ALL
 * `snapshot.edges.slice(0, 15)` — including edges whose endpoints
 * have been filtered out. The graph-viz components already suppress
 * dangling edges (T-F.77 + T-F.78 + T-F.79 + T-F.80), so the table
 * surface lagged behind the viz surface on this invariant.
 *
 * This slice extends the drill-in axes to the edges preview:
 *   - Compute a `filteredEdges` list whose endpoints are both in
 *     `filteredNodes`.
 *   - Header copy reflects "matching filters" when any axis is active.
 *   - Empty-state row appears when no edges survive the filter.
 *   - The hidden-by-filter count surfaces to the operator.
 *
 * Source-scan integrity test.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PANEL_FILE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
);

function readPanel(): string {
  return readFileSync(PANEL_FILE, "utf8");
}

describe("Graph Lens browser — edges-preview drill-in composition (T-F.81)", () => {
  it("filteredEdges is computed from snapshot.edges + the filteredNodes set", () => {
    const src = readPanel();
    // Must derive a set of allowed node ids from filteredNodes, then
    // gate each edge on both endpoints being in that set.
    expect(src).toMatch(/const\s+filteredNodeIds\s*=\s*new\s+Set/);
    expect(src).toMatch(
      /const\s+filteredEdges\s*=\s*snapshot\.edges\.filter\(/,
    );
    expect(src).toMatch(
      /filteredNodeIds\.has\(e\.sourceNodeId\)\s*&&\s*filteredNodeIds\.has\(e\.targetNodeId\)/,
    );
  });

  it("edges preview table consumes filteredEdges, not snapshot.edges", () => {
    const src = readPanel();
    expect(src).toMatch(/filteredEdges\.slice\(0,\s*15\)\.map/);
  });

  it("edges section delegates the empty-after-filter ternary to filteredEdges.length", () => {
    const src = readPanel();
    // Section-level gate stays on snapshot.edges.length (a snapshot
    // with zero edges total shouldn't render an empty section at
    // all), but the inner empty-state path branches on
    // filteredEdges.length === 0.
    expect(src).toMatch(/filteredEdges\.length\s*===\s*0\s*\?/);
  });

  it("edges header copy reflects 'matching filters' when hasAnyFilter is true", () => {
    const src = readPanel();
    // Mirror the nodes-preview header convention from T-F.73.
    expect(src).toMatch(
      /hasAnyFilter[\s\S]{0,300}first 15 of \$\{filteredEdges\.length\} matching filters/,
    );
    // Unfiltered header keeps the raw snapshot.edges.length count.
    expect(src).toMatch(/first 15 of \$\{snapshot\.edges\.length\}/);
  });

  it("empty-state row surfaces when the filter narrows edges to zero", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-render-edges-empty-after-filter"/);
    expect(src).toMatch(/No edges match the active filters\./);
  });

  it("empty-state row keeps a Clear-all reset linked to the existing handler", () => {
    const src = readPanel();
    // Reuses the onClearAllFilters wired up at T-F.75 — same handler,
    // different testid namespace.
    expect(src).toMatch(
      /data-testid="graph-lens-edges-empty-state-clear-all"[\s\S]{0,300}onClearAllFilters/,
    );
  });
});
