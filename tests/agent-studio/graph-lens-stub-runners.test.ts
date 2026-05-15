/**
 * Stub lens runners — Phase 24 §T-F.6.
 *
 * Tests the empty-state runners that satisfy the runner contract
 * for all 8 closed-taxonomy lens kinds. Concrete-per-kind runners
 * replace these incrementally without coordinating an N-way drop.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createStubLensRunnerForKind,
  maybeInstallStubLensRunners,
  GRAPH_LENS_KINDS,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  listLensRunnerKinds,
  runLens,
} from "../../server/agent-studio/services/graph-lens/public-api";
import type { GraphLensDefinition } from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetLensRunnerRegistryForTests();
});

function makeDef(
  id: string,
  overrides: Partial<GraphLensDefinition> = {},
): GraphLensDefinition {
  return {
    id,
    kind: "rag",
    label: id,
    layout: "force_directed",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

describe("createStubLensRunnerForKind", () => {
  it("returns a function that produces an empty-state snapshot", async () => {
    const runner = createStubLensRunnerForKind("rag");
    const def = makeDef("rag_x");
    const snapshot = await runner(def, { workspaceId: 1, userId: 42 });
    expect(snapshot).toMatchObject({
      lensId: "rag_x",
      kind: "rag",
      layout: "force_directed",
      nodes: [],
      edges: [],
      hiddenNodeCount: 0,
      truncated: false,
    });
    expect(snapshot.producedAt).toBeInstanceOf(Date);
  });

  it("preserves the definition's kind + layout in the snapshot", async () => {
    const runner = createStubLensRunnerForKind("governance");
    const def = makeDef("gov_x", {
      kind: "governance",
      layout: "timeline",
    });
    const snapshot = await runner(def, { workspaceId: 1, userId: 1 });
    expect(snapshot.kind).toBe("governance");
    expect(snapshot.layout).toBe("timeline");
  });
});

describe("maybeInstallStubLensRunners — envflag gate", () => {
  it("no-op when env flag is missing", () => {
    const result = maybeInstallStubLensRunners({ env: {} });
    expect(result.installed).toBe(false);
    expect(result.installedKinds).toEqual([]);
    expect(listLensRunnerKinds()).toEqual([]);
  });

  it("no-op when env flag is not 'on'", () => {
    for (const value of ["off", "true", "1", ""]) {
      __resetLensRunnerRegistryForTests();
      const result = maybeInstallStubLensRunners({
        env: { AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL: value },
      });
      expect(result.installed).toBe(false);
      expect(result.installedKinds).toEqual([]);
    }
  });

  it("installs a runner for every closed-taxonomy kind when 'on'", () => {
    const result = maybeInstallStubLensRunners({
      env: { AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL: "on" },
    });
    expect(result.installed).toBe(true);
    expect(result.installedKinds).toHaveLength(GRAPH_LENS_KINDS.length);
    for (const kind of GRAPH_LENS_KINDS) {
      expect(getLensRunner(kind)).toBeDefined();
    }
  });

  it("installedKinds matches GRAPH_LENS_KINDS order", () => {
    const result = maybeInstallStubLensRunners({
      env: { AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL: "on" },
    });
    expect([...result.installedKinds]).toEqual([...GRAPH_LENS_KINDS]);
  });

  it("registrar test-seam works (real registry NOT touched when overridden)", () => {
    const calls: string[] = [];
    const result = maybeInstallStubLensRunners({
      env: { AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL: "on" },
      register: (kind) => {
        calls.push(kind);
      },
    });
    expect(result.installed).toBe(true);
    expect(calls).toHaveLength(GRAPH_LENS_KINDS.length);
    expect(listLensRunnerKinds()).toEqual([]);
  });
});

describe("runLens dispatches through stubs after install", () => {
  it("each kind returns an empty snapshot via runLens after stub install", async () => {
    maybeInstallStubLensRunners({
      env: { AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL: "on" },
    });
    for (const kind of GRAPH_LENS_KINDS) {
      const def = makeDef(`${kind}_x`, { kind, layout: "force_directed" });
      const snap = await runLens(def, { workspaceId: 1, userId: 1 });
      expect(snap.kind).toBe(kind);
      expect(snap.nodes).toEqual([]);
      expect(snap.edges).toEqual([]);
      expect(snap.hiddenNodeCount).toBe(0);
      expect(snap.truncated).toBe(false);
    }
  });
});

describe("Source-scan: stub-runners boundary", () => {
  it("stub-runners.ts has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/stub-runners.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });
});
