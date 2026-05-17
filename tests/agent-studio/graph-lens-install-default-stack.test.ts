/**
 * Default lens-stack boot installer — Phase 24 §T-F.7.
 *
 * Tests the composer that installs default lenses + stub runners
 * in one boot step.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  maybeInstallDefaultLensStack,
  listGraphLenses,
  listLensRunnerKinds,
  __resetGraphLensRegistryForTests,
  __resetLensRunnerRegistryForTests,
  GRAPH_LENS_KINDS,
} from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetGraphLensRegistryForTests();
  __resetLensRunnerRegistryForTests();
});

describe("maybeInstallDefaultLensStack — both env flags on", () => {
  it("installs lenses AND runners when both flags are 'on'", () => {
    const result = maybeInstallDefaultLensStack({
      env: {
        AGS_GRAPH_LENS_DEFAULTS_INSTALL: "on",
        AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL: "on",
      },
    });
    expect(result.fullyInstalled).toBe(true);
    expect(result.lenses.installed).toBe(true);
    expect(result.runners.installed).toBe(true);
    expect(listGraphLenses()).toHaveLength(10);
    expect(listLensRunnerKinds()).toHaveLength(GRAPH_LENS_KINDS.length);
  });
});

describe("maybeInstallDefaultLensStack — only one flag on", () => {
  it("only lenses install when LENS_DEFAULTS=on + STUB_RUNNERS unset", () => {
    const result = maybeInstallDefaultLensStack({
      env: { AGS_GRAPH_LENS_DEFAULTS_INSTALL: "on" },
    });
    expect(result.fullyInstalled).toBe(false);
    expect(result.lenses.installed).toBe(true);
    expect(result.runners.installed).toBe(false);
    expect(listGraphLenses()).toHaveLength(10);
    expect(listLensRunnerKinds()).toEqual([]);
  });

  it("only runners install when STUB_RUNNERS=on + LENS_DEFAULTS unset", () => {
    const result = maybeInstallDefaultLensStack({
      env: { AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL: "on" },
    });
    expect(result.fullyInstalled).toBe(false);
    expect(result.lenses.installed).toBe(false);
    expect(result.runners.installed).toBe(true);
    expect(listGraphLenses()).toEqual([]);
    expect(listLensRunnerKinds()).toHaveLength(GRAPH_LENS_KINDS.length);
  });
});

describe("maybeInstallDefaultLensStack — both flags off", () => {
  it("no-op when no flags set", () => {
    const result = maybeInstallDefaultLensStack({ env: {} });
    expect(result.fullyInstalled).toBe(false);
    expect(result.lenses.installed).toBe(false);
    expect(result.runners.installed).toBe(false);
    expect(listGraphLenses()).toEqual([]);
    expect(listLensRunnerKinds()).toEqual([]);
  });

  it("no-op when both flags set to non-'on' values", () => {
    const result = maybeInstallDefaultLensStack({
      env: {
        AGS_GRAPH_LENS_DEFAULTS_INSTALL: "off",
        AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL: "false",
      },
    });
    expect(result.fullyInstalled).toBe(false);
    expect(result.lenses.installed).toBe(false);
    expect(result.runners.installed).toBe(false);
  });
});

describe("Result shape integrity", () => {
  it("preserves both halves' result shape for boot logging", () => {
    const result = maybeInstallDefaultLensStack({
      env: {
        AGS_GRAPH_LENS_DEFAULTS_INSTALL: "on",
        AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL: "on",
      },
    });
    expect(result.lenses.installedIds).toHaveLength(10);
    expect(result.runners.installedKinds).toHaveLength(
      GRAPH_LENS_KINDS.length,
    );
  });
});
