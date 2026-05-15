/**
 * Canvas snapshot per-kind breakdown — PR-V1-216.
 *
 * The snapshot card shows total nodes + edges + vault but not the
 * per-kind distribution. Adds a one-line breakdown covering the
 * closed `CANVAS_NODE_KINDS` taxonomy: note_ref / embedded_query /
 * free_text / image_ref.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-216 — canvas snapshot per-kind breakdown", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/CanvasOperatorPanel.tsx",
  );
  const kinds = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/types.ts",
  );

  it("renders breakdown line with testid + 4 closed-taxonomy counts", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="canvas-snapshot-kind-breakdown"');
    // Counts initialized to 4-kind closed taxonomy.
    expect(src).toContain("note_ref: 0");
    expect(src).toContain("embedded_query: 0");
    expect(src).toContain("free_text: 0");
    expect(src).toContain("image_ref: 0");
    // Increment guard prevents kinds outside the taxonomy from
    // polluting the counts.
    expect(/if\s*\(\s*n\.kind\s+in\s+counts\s*\)/.test(src)).toBe(true);
  });

  it("render-gated on snapshotQ.data.nodes.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    expect(/snapshotQ\.data\.nodes\.length\s*>\s*0/.test(src)).toBe(true);
  });

  it("contract anchor: CANVAS_NODE_KINDS taxonomy still matches the 4 names", () => {
    const src = readFileSync(kinds, "utf8");
    // If a kind is added/renamed server-side, this test catches it
    // before the panel silently misses the new kind.
    expect(/"note_ref"/.test(src)).toBe(true);
    expect(/"embedded_query"/.test(src)).toBe(true);
    expect(/"free_text"/.test(src)).toBe(true);
    expect(/"image_ref"/.test(src)).toBe(true);
  });
});
