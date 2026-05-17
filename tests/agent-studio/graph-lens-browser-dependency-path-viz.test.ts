/**
 * GraphLensBrowserPanel DependencyPathGraphViz — T-F.130
 * (precedent (n) taxonomy-driven renderer ladder, 4th of 5).
 *
 * Selected when `snapshot.layout === "dependency_path"`. The Runtime
 * Trace Lens (`runtime_default` from `install-default-lenses.ts`) is
 * the canonical caller; currently falls back to SnapshotGraphViz
 * (force-directed mesh) which loses sequence — DependencyPathGraphViz
 * linearizes the graph left-to-right via longest-path topological
 * depth so the trace reads as a pipeline.
 *
 * Per lesson 45 (close at operator-visible boundary not enum
 * exhaustion), 4/5 layouts now have specialized renderers:
 *   - timeline   → TimelineGraphViz   (T-F.78)
 *   - matrix     → MatrixGraphViz     (T-F.79)
 *   - tree       → TreeGraphViz       (T-F.80)
 *   - dependency_path → DependencyPathGraphViz (T-F.130)
 *   - force_directed  → SnapshotGraphViz fallback (no specialized
 *     renderer ships; the generic snapshot viz IS force-directed-ish
 *     so the fallback is correct without a relabel slice).
 *
 * Algorithmic distinctions from TreeGraphViz (its closest cousin):
 *   - Tree uses BFS shortest-path depth; DependencyPath uses Kahn-
 *     style longest-path depth (a fan-in node lands at its LATEST
 *     contributor's depth).
 *   - Tree lays out top-to-bottom (depth = y, sibling = x);
 *     DependencyPath lays out left-to-right (depth = x, sibling = y),
 *     which is the natural reading order for a trace pipeline.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
    ),
    "utf8",
  );
}

describe("GraphLensBrowserPanel DependencyPathGraphViz (T-F.130 / 4th renderer in the layout ladder)", () => {
  it("layout switch dispatches snapshot.layout === 'dependency_path' to DependencyPathGraphViz", () => {
    const src = read();
    expect(src).toMatch(
      /snapshot\.layout === "dependency_path" \?\s*\(\s*<DependencyPathGraphViz/,
    );
  });

  it("DependencyPathGraphViz declared with nodes + edges signature matching the other renderers", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+DependencyPathGraphViz\(\s*\{\s*nodes,\s*edges,?\s*\}:\s*\{[\s\S]{0,400}readonly\s+nodes:\s*ReadonlyArray<\{[\s\S]{0,200}typeKey:\s*string;[\s\S]{0,200}readonly\s+edges:\s*ReadonlyArray<\{[\s\S]{0,300}sourceNodeId:\s*string;[\s\S]{0,200}targetNodeId:\s*string;/,
    );
  });

  it("empty-state branches with a labeled testid", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid="graph-lens-dependency-path-viz-empty"/,
    );
  });

  it("uses Kahn-style longest-path depth (not BFS shortest-path)", () => {
    const src = read();
    // Longest-path: when a child has multiple parents, its depth is
    // max(parents' depth) + 1, not first-parent-visited's depth.
    expect(src).toMatch(
      /Math\.max\(depth\.get\(child\)\s*\?\?\s*0,\s*currentDepth\s*\+\s*1\)/,
    );
    // Kahn-style: decrement remainingIn and enqueue when it hits 0.
    expect(src).toMatch(
      /remaining\s*===\s*0[\s\S]{0,100}queue\.push\(child\)/,
    );
  });

  it("orphan fallback pins cycle-only nodes to maxDepth + 1", () => {
    const src = read();
    expect(src).toMatch(
      /if\s*\(!depth\.has\(n\.id\)\)\s*depth\.set\(n\.id,\s*maxDepth\s*\+\s*1\)/,
    );
  });

  it("layout is left-to-right (x = depth × dx, y = sibling slot)", () => {
    const src = read();
    // x advances per band index (the depth axis).
    expect(src).toMatch(
      /const\s+x\s*=\s*marginX\s*\+\s*bandIdx\s*\*\s*dx/,
    );
    // y advances per slot index within the band (the sibling axis).
    expect(src).toMatch(
      /y:\s*marginY\s*\+\s*slotH\s*\*\s*\(slotIdx\s*\+\s*1\)/,
    );
  });

  it("renders SVG container + per-node testids + section label with band/edge counts", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid="graph-lens-dependency-path-viz"/,
    );
    expect(src).toMatch(
      /data-testid="graph-lens-dependency-path-viz-svg"/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-lens-dependency-path-viz-node-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(/Dependency path[\s\S]{0,80}depth bands[\s\S]{0,80}edges/);
  });

  it("dangling-edge suppression preserved (same as the other 3 renderers)", () => {
    const src = read();
    // Edge skipped when either endpoint isn't in the filtered nodeIds set.
    expect(src).toMatch(
      /if\s*\(!nodeIds\.has\(e\.sourceNodeId\)\s*\|\|\s*!nodeIds\.has\(e\.targetNodeId\)\)/,
    );
    // And renderableEdges filtered to those with positions.
    expect(src).toMatch(
      /renderableEdges\s*=\s*edges\.filter\([\s\S]{0,200}positions\.has\(e\.sourceNodeId\)\s*&&\s*positions\.has\(e\.targetNodeId\)/,
    );
  });
});
