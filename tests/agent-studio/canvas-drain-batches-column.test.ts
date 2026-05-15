/**
 * Canvas drain per-workspace batches + hitMaxBatches — PR-V1-196.
 *
 * Source-scan that the per-workspace breakdown (#943) now also
 * surfaces `batchesRun` + `hitMaxBatches` so operators can see
 * exactly which workspace is hitting the batch ceiling without
 * scanning the global warning banner.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-196 — canvas drain per-workspace batches column", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/CanvasProjectionEventsDrainStatusPanel.tsx",
  );

  it("renders a Batches column with hitMaxBatches highlight", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(">Batches<");
    expect(src).toContain("drain-per-workspace-batches-");
    // hitMaxBatches=true → amber color + "!" suffix + tooltip.
    expect(/w\.hitMaxBatches\s*\?\s*"text-amber-600"/.test(src)).toBe(true);
    expect(/w\.hitMaxBatches\s*\?\s*"!"\s*:\s*""/.test(src)).toBe(true);
    expect(/Hit per-tick batch ceiling/.test(src)).toBe(true);
    // batchesRun rendered as the cell value.
    expect(/\{w\.batchesRun\}/.test(src)).toBe(true);
  });
});
