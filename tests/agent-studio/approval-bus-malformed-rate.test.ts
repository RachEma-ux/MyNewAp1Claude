/**
 * Approval-bus malformed rate — PR-V1-229.
 *
 * The status grid shows `messagesReceived` and `malformedReceived`
 * as raw counters but operators care about the ratio. A single
 * malformed in 10k is noise; 100 in 1k is a real broadcast-shape
 * bug. Adds an inline `malformed rate: X%` line below the grid.
 *
 * Suppressed when messagesReceived === 0 (no data yet); >1%
 * destructive — same threshold convention used elsewhere in the
 * workspace-observability surface.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-229 — approval-bus malformed rate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ApprovalBusAdminPanel.tsx",
  );

  it("renders rate with testid + malformed/messages computation", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="approval-bus-malformed-rate"');
    expect(/status\.malformedReceived\s*\/\s*status\.messagesReceived/.test(src)).toBe(
      true,
    );
    expect(/Math\.round[\s\S]{0,80}\*\s*1000[\s\S]{0,40}\/\s*10/.test(src)).toBe(true);
  });

  it("render gate suppresses the line when messagesReceived === 0", () => {
    const src = readFileSync(panel, "utf8");
    expect(/status\.messagesReceived\s*>\s*0/.test(src)).toBe(true);
  });

  it("destructive highlight when rate > 1%", () => {
    const src = readFileSync(panel, "utf8");
    expect(/rate\s*>\s*1[\s\S]{0,40}text-destructive/.test(src)).toBe(true);
  });

  it("title attribute names the ratio explicitly", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "malformedReceived / messagesReceived",
    );
  });
});
