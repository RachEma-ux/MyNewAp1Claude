/**
 * Canvas projection events drain — per-workspace breakdown UI. PR-V1-192.
 *
 * Source-scan that the drain status panel now renders the
 * `lastTickResult.perWorkspace[]` breakdown so operators can see
 * which workspace failed when `totalFailed > 0`, without writing SQL.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-192 — canvas drain per-workspace breakdown UI", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/CanvasProjectionEventsDrainStatusPanel.tsx",
  );

  it("renders a per-workspace breakdown table when perWorkspace has rows", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="drain-per-workspace-table"');
    expect(src).toContain("perWorkspace");
    // 4 columns: workspaceId, processed, failed, cursor.
    expect(src).toContain(">Workspace<");
    expect(src).toContain(">Processed<");
    expect(src).toContain(">Failed<");
    expect(src).toContain(">Cursor<");
    // Failed > 0 highlighted in text-destructive; idle (0/0) muted.
    expect(/w\.failed\s*>\s*0\s*\?\s*"text-destructive"/.test(src)).toBe(true);
    expect(/idle\s*\?\s*"text-muted-foreground"/.test(src)).toBe(true);
    // Conditional: only renders when perWorkspace.length > 0.
    expect(
      /status\.lastTickResult\.perWorkspace\.length\s*>\s*0/.test(src),
    ).toBe(true);
  });
});
