/**
 * Canvas drain workspaces-with-failures count — PR-V1-212.
 *
 * The existing "Last tick processed" line shows total events +
 * total failed, but not the distinct count of workspaces that
 * had failures. Different operator signal: "N events failed"
 * vs "K tenants are blocked".
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-212 — canvas drain workspaces-with-failures count", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/CanvasProjectionEventsDrainStatusPanel.tsx",
  );

  it("renders a destructive-highlighted distinct-workspace count when failures > 0", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="drain-workspaces-with-failures"');
    expect(
      /perWorkspace\.filter\(\s*\(w\)\s*=>\s*w\.failed\s*>\s*0\s*\)\.length/.test(
        src,
      ),
    ).toBe(true);
    // Highlighted destructive, singular/plural handling.
    expect(/className="text-destructive"/.test(src)).toBe(true);
    expect(
      /workspacesWithFailures\s*===\s*1\s*\?\s*""\s*:\s*"s"/.test(src),
    ).toBe(true);
  });

  it("only renders when the distinct count is > 0", () => {
    const src = readFileSync(panel, "utf8");
    // Returns null when zero — keeps the line clean on healthy ticks.
    expect(/if\s*\(workspacesWithFailures\s*===\s*0\)\s*return\s+null/.test(src)).toBe(
      true,
    );
  });
});
