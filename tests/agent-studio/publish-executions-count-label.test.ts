/**
 * Publish executions count label — PR-V1-213.
 *
 * Adds a small status label above the executions table so
 * operators know they're looking at a windowed view (the most
 * recent N, capped at 50) rather than the full history.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-213 — publish executions count label", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );

  it("renders Showing-N-most-recent label with singular/plural + capped-at-50 hint", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="publish-executions-count-label"');
    expect(src).toContain("Showing");
    expect(src).toContain("most-recent execution");
    // singular/plural.
    expect(/recentQ\.data\.length\s*===\s*1\s*\?\s*""\s*:\s*"s"/.test(src)).toBe(
      true,
    );
    // capped-at-50 hint.
    expect(
      /recentQ\.data\.length\s*>=\s*50\s*\?\s*"\s*\(capped at 50\)"\s*:\s*""/.test(
        src,
      ),
    ).toBe(true);
  });
});
