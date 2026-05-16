/**
 * Graph Lens browser — timeline layout renderer (T-F.78).
 *
 * Branches the graph-viz toggle on `snapshot.layout === "timeline"`:
 * picks the new TimelineGraphViz (x-position by node index, y-band by
 * typeKey) instead of the layout-agnostic circular renderer. First
 * layout-specific renderer slice. Source-scan integrity test — locks
 * the dispatch + the banding shape.
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

describe("Graph Lens browser — timeline layout renderer (T-F.78)", () => {
  it("the graph-viz dispatch branches on snapshot.layout === 'timeline'", () => {
    const src = readPanel();
    expect(src).toMatch(
      /viewMode\s*===\s*"graph"\s*\?\s*\([\s\S]{0,400}snapshot\.layout\s*===\s*"timeline"/,
    );
    expect(src).toMatch(/<TimelineGraphViz/);
    expect(src).toMatch(/<SnapshotGraphViz/);
  });

  it("TimelineGraphViz receives the same nodes + edges shape as the circular viz", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<TimelineGraphViz[\s\S]{0,300}nodes=\{filteredNodes\}[\s\S]{0,300}edges=\{snapshot\.edges\}/,
    );
  });

  it("TimelineGraphViz is defined as its own component with the documented banding shape", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+TimelineGraphViz\s*\(/);
    // Component must derive the unique typeKey bands from the node list.
    expect(src).toMatch(
      /const\s+typeKeyBands\s*=[\s\S]{0,200}new\s+Set/,
    );
  });

  it("TimelineGraphViz positions nodes by index along the x-axis", () => {
    const src = readPanel();
    // x is a fraction of width by node index (i / max(N-1,1)) → margin-padded.
    expect(src).toMatch(/i\s*\/\s*Math\.max\(nodes\.length\s*-\s*1,\s*1\)/);
  });

  it("TimelineGraphViz bands y by the typeKey's index in the sorted band list", () => {
    const src = readPanel();
    // y derives from typeKey band index, not from raw node index.
    expect(src).toMatch(/typeKeyBands[\s\S]{0,300}indexOf\(n\.typeKey\)/);
  });

  it("empty-state row uses a timeline-specific testid", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-timeline-viz-empty"/);
  });

  it("container + per-node testids are namespaced under graph-lens-timeline-viz", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-timeline-viz"/);
    expect(src).toMatch(/data-testid="graph-lens-timeline-viz-svg"/);
    expect(src).toMatch(
      /data-testid=\{`graph-lens-timeline-viz-node-\$\{n\.id\}`\}/,
    );
  });
});
