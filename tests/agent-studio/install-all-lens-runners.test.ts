/**
 * Boot-time composer for ALL real lens runners — T-F.70.
 *
 * Verifies the single-call helper walks every closed kind and
 * honors per-kind envflag gating. After T-F.69 reached 8/8
 * coverage, this composer turns the production boot wiring into
 * one line.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  GRAPH_LENS_KINDS,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  listLensRunnerKinds,
  maybeInstallAllLensRunnersWithAsdb,
} from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetLensRunnerRegistryForTests();
});

const ALL_FLAGS_ON: Record<string, string> = {
  AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: "on",
  AGS_GRAPH_LENS_GOVERNANCE_RUNNER_INSTALL: "on",
  AGS_GRAPH_LENS_MCP_RUNNER_INSTALL: "on",
  AGS_GRAPH_LENS_CAG_RUNNER_INSTALL: "on",
  AGS_GRAPH_LENS_RAG_RUNNER_INSTALL: "on",
  AGS_GRAPH_LENS_RAC_RUNNER_INSTALL: "on",
  AGS_GRAPH_LENS_GRAPH_SKILL_RUNNER_INSTALL: "on",
  AGS_GRAPH_LENS_INSTITUTIONAL_MEMORY_RUNNER_INSTALL: "on",
};

// ============================================================================
// All-off / all-on baselines
// ============================================================================

describe("maybeInstallAllLensRunnersWithAsdb — baselines", () => {
  it("no flags set → nothing installed", () => {
    const result = maybeInstallAllLensRunnersWithAsdb({ env: {} });
    expect(result.installedCount).toBe(0);
    expect(result.fullyInstalled).toBe(false);
    for (const kind of GRAPH_LENS_KINDS) {
      expect(result.perKind[kind]).toBe(false);
      expect(getLensRunner(kind)).toBeUndefined();
    }
  });

  it("all flags 'on' → every kind installed, fullyInstalled=true", () => {
    const result = maybeInstallAllLensRunnersWithAsdb({ env: ALL_FLAGS_ON });
    expect(result.installedCount).toBe(GRAPH_LENS_KINDS.length);
    expect(result.fullyInstalled).toBe(true);
    for (const kind of GRAPH_LENS_KINDS) {
      expect(result.perKind[kind]).toBe(true);
      expect(getLensRunner(kind)).toBeDefined();
    }
    expect(listLensRunnerKinds()).toHaveLength(GRAPH_LENS_KINDS.length);
  });
});

// ============================================================================
// Per-kind isolation — subset envflags install exactly that subset
// ============================================================================

describe("maybeInstallAllLensRunnersWithAsdb — per-kind envflag isolation", () => {
  it("subset of flags installs exactly that subset", () => {
    const result = maybeInstallAllLensRunnersWithAsdb({
      env: {
        AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: "on",
        AGS_GRAPH_LENS_GOVERNANCE_RUNNER_INSTALL: "on",
      },
    });
    expect(result.installedCount).toBe(2);
    expect(result.fullyInstalled).toBe(false);
    expect(result.perKind.runtime).toBe(true);
    expect(result.perKind.governance).toBe(true);
    expect(result.perKind.mcp).toBe(false);
    expect(result.perKind.cag).toBe(false);
    expect(result.perKind.rag).toBe(false);
    expect(result.perKind.rac).toBe(false);
    expect(result.perKind.graph_skill).toBe(false);
    expect(result.perKind.institutional_memory).toBe(false);
  });

  it("each kind has an independent envflag — toggling one does not affect others", () => {
    for (const kind of GRAPH_LENS_KINDS) {
      __resetLensRunnerRegistryForTests();
      const envKey = `AGS_GRAPH_LENS_${kind.toUpperCase()}_RUNNER_INSTALL`;
      const result = maybeInstallAllLensRunnersWithAsdb({
        env: { [envKey]: "on" },
      });
      expect(result.installedCount).toBe(1);
      expect(result.perKind[kind]).toBe(true);
      for (const other of GRAPH_LENS_KINDS) {
        if (other === kind) continue;
        expect(result.perKind[other]).toBe(false);
      }
    }
  });

  it("envflag values other than 'on' are no-ops", () => {
    const result = maybeInstallAllLensRunnersWithAsdb({
      env: {
        AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: "off",
        AGS_GRAPH_LENS_GOVERNANCE_RUNNER_INSTALL: "1",
        AGS_GRAPH_LENS_MCP_RUNNER_INSTALL: "true",
      },
    });
    expect(result.installedCount).toBe(0);
  });
});

// ============================================================================
// Result shape stability
// ============================================================================

describe("maybeInstallAllLensRunnersWithAsdb — result shape", () => {
  it("perKind has exactly the GRAPH_LENS_KINDS keys (no extras / no missing)", () => {
    const result = maybeInstallAllLensRunnersWithAsdb({ env: {} });
    const perKindKeys = Object.keys(result.perKind).sort();
    const taxonomyKeys = [...GRAPH_LENS_KINDS].sort();
    expect(perKindKeys).toEqual(taxonomyKeys);
  });

  it("installedCount agrees with the number of true entries in perKind", () => {
    const result = maybeInstallAllLensRunnersWithAsdb({
      env: {
        AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: "on",
        AGS_GRAPH_LENS_GOVERNANCE_RUNNER_INSTALL: "on",
        AGS_GRAPH_LENS_MCP_RUNNER_INSTALL: "on",
      },
    });
    const trueCount = Object.values(result.perKind).filter(Boolean).length;
    expect(result.installedCount).toBe(trueCount);
  });
});

// ============================================================================
// Source-scan
// ============================================================================

describe("Source-scan: install-all-lens-runners boundary", () => {
  it("composer file has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/install-all-lens-runners.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("composer references every kind in GRAPH_LENS_KINDS so future additions trip the build", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/install-all-lens-runners.ts",
      ),
      "utf8",
    );
    // Every kind shows up in the perKind map literal — adding a new
    // kind to GRAPH_LENS_KINDS without extending this composer would
    // fail the Record<GraphLensKind, boolean> exhaustiveness check at
    // tsc time. Re-asserted by source-scan here as a belt-and-braces
    // discipline.
    for (const kind of [
      "runtime",
      "governance",
      "mcp",
      "cag",
      "rag",
      "rac",
      "graph_skill",
      "institutional_memory",
    ]) {
      expect(src).toMatch(new RegExp(`${kind}:\\s*maybeInstall`));
    }
  });
});
