/**
 * F2 (2026-05-22) — `computeLensStackMisconfigWarnings` emits an
 * operator-facing warning when the combined lens-stack + real-runner
 * boot state would yield a silent empty surface.
 *
 * The verification run that produced the F1→F6 plan landed on a
 * freshly-deployed instance with NO lens definitions registered and
 * felt like a bug. The root cause was that
 * `AGS_GRAPH_LENS_DEFAULTS_INSTALL` and the per-kind real-runner
 * flags are independent — turning on just one of them yields an
 * unreachable surface. The warning makes the misconfiguration
 * visible at boot.
 */

import { describe, it, expect } from "vitest";

import { computeLensStackMisconfigWarnings } from "../../server/agent-studio/services/graph-lens/install-default-lens-stack";

describe("computeLensStackMisconfigWarnings (F2)", () => {
  it("returns no warnings when nothing is installed (neither half of the stack)", () => {
    const warnings = computeLensStackMisconfigWarnings({
      defaultsInstalled: false,
      stubRunnersInstalled: false,
      realRunnersInstalledCount: 0,
    });
    expect(warnings).toEqual([]);
  });

  it("returns no warnings when the full stack is installed (defaults + stubs)", () => {
    const warnings = computeLensStackMisconfigWarnings({
      defaultsInstalled: true,
      stubRunnersInstalled: true,
      realRunnersInstalledCount: 0,
    });
    expect(warnings).toEqual([]);
  });

  it("returns no warnings when defaults + real runners (no stubs) are installed", () => {
    const warnings = computeLensStackMisconfigWarnings({
      defaultsInstalled: true,
      stubRunnersInstalled: false,
      realRunnersInstalledCount: 3,
    });
    expect(warnings).toEqual([]);
  });

  it("warns when real runners are installed but lens definitions are NOT", () => {
    const warnings = computeLensStackMisconfigWarnings({
      defaultsInstalled: false,
      stubRunnersInstalled: false,
      realRunnersInstalledCount: 1,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/1 real lens runner\(s\) installed/);
    expect(warnings[0]).toMatch(/AGS_GRAPH_LENS_DEFAULTS_INSTALL is unset/);
    expect(warnings[0]).toMatch(/graphLens\.list will be empty/);
  });

  it("warns when lens definitions are installed but NO runners (neither stub nor real)", () => {
    const warnings = computeLensStackMisconfigWarnings({
      defaultsInstalled: true,
      stubRunnersInstalled: false,
      realRunnersInstalledCount: 0,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/lens definitions installed but NO runners/);
    expect(warnings[0]).toMatch(/no_runner_for_kind/);
    expect(warnings[0]).toMatch(/AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL=on/);
  });

  it("does NOT warn 'no runners' when stubs cover the definitions", () => {
    const warnings = computeLensStackMisconfigWarnings({
      defaultsInstalled: true,
      stubRunnersInstalled: true,
      realRunnersInstalledCount: 0,
    });
    expect(warnings).toEqual([]);
  });

  it("includes the F4-aware verbiage (status='not_found') in the runner-without-defs warning", () => {
    const warnings = computeLensStackMisconfigWarnings({
      defaultsInstalled: false,
      stubRunnersInstalled: false,
      realRunnersInstalledCount: 4,
    });
    // The warning calls out the symptom the operator will actually see
    // when they hit the public API: empty list + not_found from render.
    expect(warnings[0]).toMatch(/'not_found'|"not_found"|not_found/);
  });
});
