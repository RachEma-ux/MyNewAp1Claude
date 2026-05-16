/**
 * Graph Lens browser — matrix layout renderer (T-F.79).
 *
 * Branches the graph-viz toggle on `snapshot.layout === "matrix"`:
 * picks the new MatrixGraphViz (N×N grid, rows = source nodes,
 * columns = target nodes, cell filled iff edge source→target exists)
 * instead of the circular fallback. Second layout-specific renderer
 * after T-F.78 timeline. Source-scan integrity test — locks the
 * dispatch + the grid shape.
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

describe("Graph Lens browser — matrix layout renderer (T-F.79)", () => {
  it("the graph-viz dispatch branches on snapshot.layout === 'matrix'", () => {
    const src = readPanel();
    expect(src).toMatch(
      /viewMode\s*===\s*"graph"\s*\?\s*\([\s\S]{0,600}snapshot\.layout\s*===\s*"matrix"/,
    );
    expect(src).toMatch(/<MatrixGraphViz/);
    // Timeline + matrix + circular all live under the viewMode === "graph"
    // branch — assert all three are present.
    expect(src).toMatch(/<TimelineGraphViz/);
    expect(src).toMatch(/<SnapshotGraphViz/);
  });

  it("MatrixGraphViz receives the same nodes + edges shape as the other viz components", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<MatrixGraphViz[\s\S]{0,300}nodes=\{filteredNodes\}[\s\S]{0,300}edges=\{snapshot\.edges\}/,
    );
  });

  it("MatrixGraphViz is defined as its own component and derives an edgeKeys set for O(1) cell lookup", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+MatrixGraphViz\s*\(/);
    expect(src).toMatch(/const\s+edgeKeys\s*=[\s\S]{0,200}new\s+Set/);
    // Cell rendering iterates rows then columns — derived per filtered
    // node, so the matrix respects the 3-axis drill-in filters.
    expect(src).toMatch(/nodes\.map\(\(rowNode[\s\S]{0,800}nodes\.map\(\(colNode/);
  });

  it("cell fill key is the canonical 'source-id|target-id' shape used by the edgeKeys lookup", () => {
    const src = readPanel();
    expect(src).toMatch(/\$\{e\.sourceNodeId\}\|\$\{e\.targetNodeId\}/);
    expect(src).toMatch(/edgeKeys\.has\(/);
  });

  it("empty-state row uses a matrix-specific testid", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-matrix-viz-empty"/);
  });

  it("container + per-cell testids are namespaced under graph-lens-matrix-viz", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-matrix-viz"/);
    expect(src).toMatch(/data-testid="graph-lens-matrix-viz-svg"/);
    expect(src).toMatch(
      /data-testid=\{`graph-lens-matrix-viz-cell-\$\{rowNode\.id\}-\$\{colNode\.id\}`\}/,
    );
  });
});
