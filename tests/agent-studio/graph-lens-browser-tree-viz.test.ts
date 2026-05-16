/**
 * Graph Lens browser — tree layout renderer (T-F.80).
 *
 * Branches the graph-viz toggle on `snapshot.layout === "tree"`:
 * picks the new TreeGraphViz (parent→child layered layout, roots at
 * depth 0, BFS depth assignment, orphans pinned to a synthetic
 * floor lane) instead of the circular fallback. Third layout-
 * specific renderer after T-F.78 timeline + T-F.79 matrix.
 *
 * The RAC Context Plan View + Graph Skill Pack View lenses both
 * declare `layout: "tree"` in install-default-lenses.ts, so this
 * dispatch is operator-reachable on the first two lens kinds.
 *
 * Source-scan integrity test — locks the dispatch + the depth
 * derivation shape.
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

describe("Graph Lens browser — tree layout renderer (T-F.80)", () => {
  it("the graph-viz dispatch branches on snapshot.layout === 'tree'", () => {
    const src = readPanel();
    expect(src).toMatch(
      /viewMode\s*===\s*"graph"\s*\?\s*\([\s\S]{0,800}snapshot\.layout\s*===\s*"tree"/,
    );
    expect(src).toMatch(/<TreeGraphViz/);
    // Timeline + matrix + tree + circular all live under viewMode === "graph".
    expect(src).toMatch(/<TimelineGraphViz/);
    expect(src).toMatch(/<MatrixGraphViz/);
    expect(src).toMatch(/<SnapshotGraphViz/);
  });

  it("TreeGraphViz receives the same nodes + edges shape as the other viz components", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<TreeGraphViz[\s\S]{0,300}nodes=\{filteredNodes\}[\s\S]{0,300}edges=\{snapshot\.edges\}/,
    );
  });

  it("TreeGraphViz is defined as its own component and derives roots from in-degree=0", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+TreeGraphViz\s*\(/);
    // In-degree map seeded from the edge list.
    expect(src).toMatch(/inDegree\s*=\s*new\s+Map/);
    // Root selection guards on in-degree === 0.
    expect(src).toMatch(/inDegree\.get\([\s\S]{0,80}\)\s*===\s*0/);
  });

  it("TreeGraphViz BFS assigns depth across the parent→child edges", () => {
    const src = readPanel();
    // BFS uses a depth map + a queue of next-frontier ids; the
    // adjacency map is derived from edges so a non-tree (cycle)
    // input stays bounded.
    expect(src).toMatch(/depth\s*=\s*new\s+Map/);
    expect(src).toMatch(/adjacency\s*=\s*new\s+Map/);
  });

  it("orphan nodes (unreachable from any root) get pinned to a floor lane below max depth", () => {
    const src = readPanel();
    // Floor lane = maxDepth + 1; explicit fallback for nodes the BFS
    // never visited (cycle-only subgraphs, dangling).
    expect(src).toMatch(/maxDepth\s*\+\s*1/);
  });

  it("container + per-node testids are namespaced under graph-lens-tree-viz", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-tree-viz"/);
    expect(src).toMatch(/data-testid="graph-lens-tree-viz-svg"/);
    expect(src).toMatch(
      /data-testid=\{`graph-lens-tree-viz-node-\$\{n\.id\}`\}/,
    );
  });

  it("empty-state row uses a tree-specific testid", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-tree-viz-empty"/);
  });
});
