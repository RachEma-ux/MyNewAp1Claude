/**
 * Boot wiring tests for region routing — V2 Phase MR-1 Phase-2 fourth
 * slice. PR-V1-151.
 *
 * Covers:
 *   - Env flag unset → not installed, reason="env flag unset".
 *   - Env flag wrong value → not installed.
 *   - Env flag "on" + warm succeeds → installed, summary returned,
 *     installRegionRouter called.
 *   - Env flag "on" + warm throws → not installed, reason carries
 *     the error message; installRegionRouter NOT called.
 *   - Source-scan: boot.ts wires the new helper into the boot
 *     sequence with the env-flag pattern.
 *   - Hard-rule compliance: no env reads beyond the toggle, no
 *     credential-resolver / dispatcher / neo4j-driver imports.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../server/agent-studio/services/region/region-routing-bridge.js",
  () => ({
    installRegionRouter: vi.fn(),
  }),
);

vi.mock(
  "../../server/agent-studio/services/region/workspace-region-cache.js",
  () => ({
    warmRegionRoutingCache: vi.fn(),
  }),
);

import { installRegionRouter } from "../../server/agent-studio/services/region/region-routing-bridge.js";
import { warmRegionRoutingCache } from "../../server/agent-studio/services/region/workspace-region-cache.js";
import { maybeInstallRegionRouting } from "../../server/agent-studio/services/region/install-region-routing.js";

const mockedInstall = vi.mocked(installRegionRouter);
const mockedWarm = vi.mocked(warmRegionRoutingCache);

describe("MR-1 Phase-2 — install-region-routing boot wiring", () => {
  const originalFlag = process.env.AGS_REGION_ROUTING;

  beforeEach(() => {
    mockedInstall.mockReset();
    mockedWarm.mockReset();
    delete process.env.AGS_REGION_ROUTING;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.AGS_REGION_ROUTING;
    } else {
      process.env.AGS_REGION_ROUTING = originalFlag;
    }
  });

  it("env flag unset: not installed, reason='env flag unset'", async () => {
    const result = await maybeInstallRegionRouting();
    expect(result.installed).toBe(false);
    expect(result.reason).toBe("env flag unset");
    expect(mockedWarm).not.toHaveBeenCalled();
    expect(mockedInstall).not.toHaveBeenCalled();
  });

  it("env flag set to wrong value: not installed", async () => {
    process.env.AGS_REGION_ROUTING = "true";
    const result = await maybeInstallRegionRouting();
    expect(result.installed).toBe(false);
    expect(mockedInstall).not.toHaveBeenCalled();
  });

  it("env flag 'on' + warm succeeds: installed with summary", async () => {
    process.env.AGS_REGION_ROUTING = "on";
    mockedWarm.mockResolvedValue({
      activeRegionCount: 3,
      pinCount: 12,
      primaryRegionKey: "default",
      lastWarmedAt: new Date(),
    });
    const result = await maybeInstallRegionRouting();
    expect(result.installed).toBe(true);
    expect(result.activeRegionCount).toBe(3);
    expect(result.pinCount).toBe(12);
    expect(result.primaryRegionKey).toBe("default");
    expect(mockedInstall).toHaveBeenCalledOnce();
  });

  it("env flag 'on' + warm throws: not installed, error message in reason", async () => {
    process.env.AGS_REGION_ROUTING = "on";
    mockedWarm.mockRejectedValue(new Error("ASDB connection refused"));
    const result = await maybeInstallRegionRouting();
    expect(result.installed).toBe(false);
    expect(result.reason).toContain("ASDB connection refused");
    expect(mockedInstall).not.toHaveBeenCalled();
  });

  it("source-scan: boot.ts wires Step 3.32 with the env-flag pattern", () => {
    const bootFile = resolve(__dirname, "../../server/agent-studio/boot.ts");
    const src = readFileSync(bootFile, "utf8");
    expect(src).toContain("Step 3.32");
    expect(src).toContain("AGS_REGION_ROUTING");
    expect(src).toContain(
      'await import(\n      "./services/region/install-region-routing"',
    );
    expect(src).toContain("[ags-region-routing] installed");
    expect(src).toContain("[ags-region-routing] not installed");
  });

  it("source-scan: install-region-routing.ts hard-rule compliance", () => {
    const installFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/install-region-routing.ts",
    );
    const src = readFileSync(installFile, "utf8");
    expect(/process\.env\.AGS_REGION_ROUTING/.test(src)).toBe(true);
    // Only the toggle env read is allowed.
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });

  it("public-api barrel re-exports the boot helper", () => {
    const barrelFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/public-api.ts",
    );
    const src = readFileSync(barrelFile, "utf8");
    expect(src).toContain("maybeInstallRegionRouting");
    expect(src).toContain("./install-region-routing.js");
  });
});
