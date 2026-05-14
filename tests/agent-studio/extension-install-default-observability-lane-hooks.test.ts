/**
 * V1+ 18-γ env-flag-gated observability lane hooks installer
 * (PR-V1-82) + boot.ts Step 3.31 source-scan.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import { maybeInstallDefaultObservabilityLaneHooks } from "../../server/agent-studio/services/extensions/install-default-observability-lane-hooks.js";

describe("maybeInstallDefaultObservabilityLaneHooks — env-flag matrix", () => {
  it("unset env → no-op, installed=false, installedLanes=[]", () => {
    const install = vi.fn();
    const result = maybeInstallDefaultObservabilityLaneHooks({
      env: {},
      install: install as never,
    });
    expect(result).toEqual({ installed: false, installedLanes: [] });
    expect(install).not.toHaveBeenCalled();
  });

  it("AGS_EXTENSIONS_LANE_HOOKS_OBSERVABILITY=on → installs all 3 contracted lanes", () => {
    const install = vi.fn().mockReturnValue({
      installedLanes: ["retrieve", "assemble", "compose"],
    });
    const result = maybeInstallDefaultObservabilityLaneHooks({
      env: { AGS_EXTENSIONS_LANE_HOOKS_OBSERVABILITY: "on" },
      install: install as never,
    });
    expect(result).toEqual({
      installed: true,
      installedLanes: ["retrieve", "assemble", "compose"],
    });
    expect(install).toHaveBeenCalledTimes(1);
  });

  it.each([
    "ON",
    "on ",
    " on",
    "true",
    "1",
    "yes",
    "off",
    "",
  ])("rejects non-matching env value %j (strict equality)", (raw) => {
    const install = vi.fn();
    const result = maybeInstallDefaultObservabilityLaneHooks({
      env: { AGS_EXTENSIONS_LANE_HOOKS_OBSERVABILITY: raw },
      install: install as never,
    });
    expect(result).toEqual({ installed: false, installedLanes: [] });
    expect(install).not.toHaveBeenCalled();
  });

  it("forwards the log option to the underlying installer", () => {
    const install = vi.fn().mockReturnValue({
      installedLanes: ["retrieve", "assemble", "compose"],
    });
    const log = vi.fn();
    maybeInstallDefaultObservabilityLaneHooks({
      env: { AGS_EXTENSIONS_LANE_HOOKS_OBSERVABILITY: "on" },
      install: install as never,
      log,
    });
    const calls = (install as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    const firstArg = calls[0]?.[0] as { log?: unknown } | undefined;
    expect(firstArg?.log).toBe(log);
  });
});

describe("boot.ts source-scan — Step 3.31 wire-up", () => {
  const file = resolve(__dirname, "../../server/agent-studio/boot.ts");
  const src = readFileSync(file, "utf8");

  it("boot.ts imports maybeInstallDefaultObservabilityLaneHooks", () => {
    expect(
      /maybeInstallDefaultObservabilityLaneHooks/.test(src),
    ).toBe(true);
  });

  it("boot.ts has a Step 3.31 label for the new install step", () => {
    expect(/Step 3\.31/.test(src)).toBe(true);
  });

  it("boot.ts wraps the install call in try/catch", () => {
    const stepStart = src.search(/\/\/\s*Step\s+3\.31\b/);
    expect(stepStart).toBeGreaterThan(-1);
    const after = src.slice(stepStart);
    // Slice until the next "// Step 3.X" header (or end of file).
    const afterHeader = after.slice(20);
    const nextStepIdx = afterHeader.search(/\/\/\s*Step\s+3\.\d{2,}\b/);
    const slice =
      nextStepIdx > 0 ? after.slice(0, 20 + nextStepIdx) : after;
    expect(/\btry\s*\{/.test(slice)).toBe(true);
    expect(/\}\s*catch\s*\(/.test(slice)).toBe(true);
  });

  it("boot.ts logs the installed-case message with the lane list", () => {
    const stepStart = src.search(/\/\/\s*Step\s+3\.31\b/);
    const after = src.slice(stepStart);
    expect(
      /lanes=\$\{result\.installedLanes\.join\(/.test(after),
    ).toBe(true);
  });
});
