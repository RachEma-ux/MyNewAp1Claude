/**
 * Canvas drain forceTick UI — PR-V1-175.
 *
 * Adds a "Force tick now" button + feedback line to
 * CanvasProjectionEventsDrainStatusPanel, wired to the #925
 * `forceTick` admin mutation. Source-scan verifies wiring +
 * status-invalidation + feedback shape.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-175 — canvas drain forceTick UI", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/CanvasProjectionEventsDrainStatusPanel.tsx",
  );

  it("wires the forceTick mutation + useUtils for invalidation", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain('import { useState } from "react"');
    expect(src).toContain("trpc.useUtils()");
    expect(src).toContain(
      "trpc.agentStudio.canvasProjectionEventsDrain.forceTick.useMutation",
    );
  });

  it("invalidates getDrainStatus on success so the status card refreshes", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain(
      "utils.agentStudio.canvasProjectionEventsDrain.getDrainStatus.invalidate()",
    );
  });

  it("formats feedback for ran=true with totalProcessed + workspacesScanned", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("data.result.totalProcessed");
    expect(src).toContain("data.result.workspacesScanned");
  });

  it("surfaces ran=false reason verbatim", () => {
    const src = readFileSync(file, "utf8");
    expect(/Tick skipped:\s*\$\{data\.reason\}/.test(src)).toBe(true);
  });

  it("button disabled while mutation pending", () => {
    const src = readFileSync(file, "utf8");
    expect(/disabled=\{\s*forceTickMutation\.isPending\s*\}/.test(src)).toBe(
      true,
    );
  });

  it("buttons + feedback have testid hooks", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain('data-testid="drain-force-tick-button"');
    expect(src).toContain('data-testid="drain-force-tick-feedback"');
  });

  it("error path sets feedback via setForceTickFeedback(err.message)", () => {
    const src = readFileSync(file, "utf8");
    expect(/setForceTickFeedback\(\s*`Force-tick failed:/.test(src)).toBe(
      true,
    );
  });
});
