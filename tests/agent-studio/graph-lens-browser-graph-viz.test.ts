/**
 * Graph Lens browser — SVG graph viz toggle (T-F.77).
 *
 * First actual visualization layer on the lens browser. Circular
 * positioning + straight-line edges, capped at GRAPH_VIZ_NODE_CAP
 * filtered nodes. Source-scan integrity test that locks the
 * component shape + the toggle wiring.
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

describe("Graph Lens browser — SVG graph viz toggle (T-F.77)", () => {
  it("panel holds viewMode state with closed 'table' | 'graph' union, default 'table'", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[viewMode,\s*setViewMode\]\s*=\s*useState<"table"\s*\|\s*"graph">\("table"\)/,
    );
  });

  it("selectLens resets the view mode back to 'table'", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+selectLens[\s\S]{0,400}setViewMode\("table"\)/);
  });

  it("RenderEnvelopeView receives viewMode + onViewModeChange props", () => {
    const src = readPanel();
    expect(src).toMatch(/viewMode:\s*"table"\s*\|\s*"graph"/);
    expect(src).toMatch(/onViewModeChange:\s*\(/);
    expect(src).toMatch(/<RenderEnvelopeView[\s\S]{0,1500}viewMode=\{viewMode\}/);
  });

  it("view-mode toggle group renders 2 buttons with per-mode testid", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-view-mode-group"/);
    expect(src).toMatch(/data-testid=\{`graph-lens-view-mode-\$\{mode\}`\}/);
    expect(src).toMatch(/\["table",\s*"graph"\]\s+as\s+const/);
  });

  it("Graph button is disabled when filteredNodes.length > GRAPH_VIZ_NODE_CAP", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+GRAPH_VIZ_NODE_CAP\s*=\s*50/);
    expect(src).toMatch(
      /mode\s*===\s*"graph"\s*&&\s*filteredNodes\.length\s*>\s*GRAPH_VIZ_NODE_CAP/,
    );
  });

  it("graph viz replaces the Nodes + Edges tables when viewMode === 'graph'", () => {
    const src = readPanel();
    // T-F.78 inserted a layout-branch (timeline vs. circular) between
    // the viewMode dispatch and SnapshotGraphViz — both renderers
    // still live inside the `viewMode === "graph"` branch.
    expect(src).toMatch(
      /viewMode\s*===\s*"graph"\s*\?\s*\([\s\S]{0,1200}<SnapshotGraphViz/,
    );
    // The viz consumes the filtered nodes (not the raw snapshot) so
    // composes correctly with the 3-axis drill-in filters.
    expect(src).toMatch(/<SnapshotGraphViz[\s\S]{0,200}nodes=\{filteredNodes\}/);
  });

  it("SnapshotGraphViz suppresses dangling edges (endpoint not in filtered set)", () => {
    const src = readPanel();
    // Same dangling-suppression discipline as the runner builders.
    expect(src).toMatch(
      /edges\.filter\([\s\S]{0,200}positions\.has\(e\.sourceNodeId\)\s*&&\s*positions\.has\(e\.targetNodeId\)/,
    );
  });

  it("hidden nodes get a dashed stroke and transparent fill (permission-leak invariant carries through)", () => {
    const src = readPanel();
    expect(src).toMatch(/fill=\{n\.visible\s*\?\s*"currentColor"\s*:\s*"transparent"\}/);
    expect(src).toMatch(/strokeDasharray=\{n\.visible\s*\?\s*undefined\s*:\s*"2 2"\}/);
    // Hidden nodes' <title> never leaks the label.
    expect(src).toMatch(/n\.visible[\s\S]{0,200}\$\{n\.typeKey\}:\s*\(hidden\)/);
  });

  it("empty filteredNodes renders an italic placeholder, not an empty SVG", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-graph-viz-empty"/);
  });
});
