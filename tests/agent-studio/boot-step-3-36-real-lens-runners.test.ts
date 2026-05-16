/**
 * Boot Step 3.36 — real lens runners boot composer (T-F.71).
 *
 * Source-scan integrity test verifying that `boot.ts` calls
 * `maybeInstallAllLensRunnersWithAsdb` after Step 3.35 (the stub
 * installer), so production boots register the real runners when
 * their per-kind envflags are on. Pattern mirrors
 * `boot-step-3-35-lens-stack.test.ts` from T-F.7.
 *
 * Cheap structural test — no boot harness. Just reads `boot.ts` and
 * asserts the call site exists in the correct location.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const BOOT_FILE = resolve(
  __dirname,
  "../../server/agent-studio/boot.ts",
);

function readBoot(): string {
  return readFileSync(BOOT_FILE, "utf8");
}

describe("Boot Step 3.36 — real lens runners (T-F.71)", () => {
  it("imports maybeInstallAllLensRunnersWithAsdb from the graph-lens public-api", () => {
    const src = readBoot();
    expect(src).toContain("maybeInstallAllLensRunnersWithAsdb");
    expect(src).toMatch(
      /maybeInstallAllLensRunnersWithAsdb[\s\S]{0,200}services\/graph-lens\/public-api/,
    );
  });

  it("invokes the composer at boot time and logs the result", () => {
    const src = readBoot();
    expect(src).toMatch(/maybeInstallAllLensRunnersWithAsdb\(\s*\)/);
    expect(src).toMatch(/installedCount[\s\S]{0,400}fullyInstalled/);
    expect(src).toContain("[ags-graph-lens] real lens runners installed");
  });

  it("step 3.36 sits AFTER step 3.35 (stub install) in the file", () => {
    const src = readBoot();
    const step335Idx = src.indexOf("Step 3.35");
    const step336Idx = src.indexOf("Step 3.36");
    expect(step335Idx).toBeGreaterThan(0);
    expect(step336Idx).toBeGreaterThan(0);
    expect(step336Idx).toBeGreaterThan(step335Idx);
  });

  it("wraps the composer call in a try-catch — fail-soft on registration collision", () => {
    const src = readBoot();
    // Capture the Step 3.36 block (from "Step 3.36" until the next
    // top-level "Step" marker) and assert it contains both try and
    // catch.
    const start = src.indexOf("Step 3.36");
    const next = src.indexOf("Step 3.25", start);
    expect(start).toBeGreaterThan(0);
    expect(next).toBeGreaterThan(start);
    const block = src.slice(start, next);
    expect(block).toMatch(/try\s*\{[\s\S]*maybeInstallAllLensRunnersWithAsdb/);
    expect(block).toMatch(/catch\s*\([\s\S]*\)\s*\{/);
    expect(block).toContain("real runners install skipped");
  });

  it("documents the stub+real conflict caveat in the step preamble", () => {
    const src = readBoot();
    const start = src.indexOf("Step 3.36");
    const next = src.indexOf("Step 3.25", start);
    const block = src.slice(start, next);
    // The preamble must call out that operators must pick one strategy
    // (stubs OR real) per kind to avoid registration collisions. The
    // comment may wrap across lines; strip "//" + whitespace before
    // matching to get a robust substring assertion.
    const flattened = block.replace(/\/\/\s*/g, " ").replace(/\s+/g, " ");
    expect(flattened).toContain("strategy per kind");
    expect(flattened).toContain("LensRunnerAlreadyRegisteredForKindError");
  });
});
