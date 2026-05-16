/**
 * Graph Lens — tRPC router (T-F.61).
 *
 * Exercises `agentStudio.graphLens.list` / `summary` / `render` via
 * a router caller; the runner registry is reset per-test so each
 * case sees a deterministic registration state.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { graphLensRouter } from "../../server/agent-studio/services/graph-lens/graph-lens-router";
import {
  __resetGraphLensRegistryForTests,
  __resetLensRunnerRegistryForTests,
  createStubLensRunnerForKind,
  createRuntimeLensRunner,
  maybeInstallDefaultGraphLenses,
  registerLensRunner,
  type RuntimeLensReadFn,
} from "../../server/agent-studio/services/graph-lens/public-api";

const ADMIN_CTX = { user: { id: 42, role: "admin" } } as never;

beforeEach(() => {
  __resetGraphLensRegistryForTests();
  __resetLensRunnerRegistryForTests();
  maybeInstallDefaultGraphLenses({
    env: { AGS_GRAPH_LENS_DEFAULTS_INSTALL: "on" },
  });
});

// ============================================================================
// list
// ============================================================================

describe("graphLensRouter.list", () => {
  it("returns every registered definition with hasRunner=false initially", async () => {
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.list();
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(entry.hasRunner).toBe(false);
      expect(entry.definition.id).toBeTruthy();
      expect(entry.definition.kind).toBeTruthy();
    }
  });

  it("marks hasRunner=true for kinds whose runner is installed", async () => {
    registerLensRunner("rag", createStubLensRunnerForKind("rag"));
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.list();
    const rag = result.find((e) => e.definition.kind === "rag");
    expect(rag?.hasRunner).toBe(true);
    const gov = result.find((e) => e.definition.kind === "governance");
    expect(gov?.hasRunner).toBe(false);
  });

  it("rejects non-admin callers", async () => {
    const caller = graphLensRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(caller.list()).rejects.toThrow();
  });
});

// ============================================================================
// summary
// ============================================================================

describe("graphLensRouter.summary", () => {
  it("returns 0% coverage when no runners are installed", async () => {
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.summary();
    expect(result.coverage.totalKinds).toBeGreaterThan(0);
    expect(result.coverage.registeredKinds).toBe(0);
    expect(result.coverage.coveragePercent).toBe(0);
    expect(result.coverage.missingKinds.length).toBe(result.coverage.totalKinds);
  });

  it("reflects partial coverage when one kind has a runner", async () => {
    registerLensRunner("runtime", createStubLensRunnerForKind("runtime"));
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.summary();
    expect(result.coverage.registeredKinds).toBe(1);
    expect(result.coverage.missingKinds).not.toContain("runtime");
    expect(result.coverage.coveragePercent).toBeGreaterThan(0);
  });

  it("returns operator-facing labels for every kind", async () => {
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.summary();
    expect(result.kindLabels.runtime).toBeTruthy();
    expect(result.kindLabels.rag).toBe("RAG");
  });

  it("rejects non-admin callers", async () => {
    const caller = graphLensRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(caller.summary()).rejects.toThrow();
  });
});

// ============================================================================
// render
// ============================================================================

describe("graphLensRouter.render", () => {
  it("returns status='not_found' when lensId is unknown", async () => {
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.render({
      workspaceId: 1,
      lensId: "nonexistent",
    });
    expect(result.status).toBe("not_found");
    if (result.status === "not_found") {
      expect(result.lensId).toBe("nonexistent");
    }
  });

  it("returns status='no_runner_for_kind' when the lens's kind has no runner", async () => {
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    // Default lenses installed in beforeEach; no runners registered.
    const list = await caller.list();
    const lensId = list[0].definition.id;
    const result = await caller.render({ workspaceId: 1, lensId });
    expect(result.status).toBe("no_runner_for_kind");
  });

  it("returns status='ok' + snapshot when a runner is registered", async () => {
    const read: RuntimeLensReadFn = async () => ({
      runs: [],
      agentsById: new Map(),
      truncated: false,
    });
    registerLensRunner(
      "runtime",
      createRuntimeLensRunner({ read, now: () => new Date("2026-05-16") }),
    );
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const list = await caller.list();
    const runtimeLens = list.find((e) => e.definition.kind === "runtime");
    expect(runtimeLens).toBeDefined();
    const result = await caller.render({
      workspaceId: 1,
      lensId: runtimeLens!.definition.id,
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.snapshot.kind).toBe("runtime");
      expect(result.snapshot.nodes).toEqual([]);
    }
  });

  it("forwards viewer.userId from the admin session context", async () => {
    const captured: number[] = [];
    const read: RuntimeLensReadFn = async () => ({
      runs: [],
      agentsById: new Map(),
      truncated: false,
    });
    // Wrap the runner so we can capture the viewer the router passes.
    const inner = createRuntimeLensRunner({ read, now: () => new Date() });
    registerLensRunner("runtime", async (def, viewer) => {
      if (viewer.userId != null) captured.push(viewer.userId);
      return inner(def, viewer);
    });
    const caller = graphLensRouter.createCaller({
      user: { id: 777, role: "admin" },
    } as never);
    const list = await caller.list();
    const runtimeLens = list.find((e) => e.definition.kind === "runtime");
    await caller.render({
      workspaceId: 5,
      lensId: runtimeLens!.definition.id,
    });
    expect(captured).toEqual([777]);
  });

  it("forwards limit + asOf to the runner via viewer context", async () => {
    const captured: Array<{ workspaceId: number; limit?: number; asOf?: Date }> = [];
    const fakeRunner = createRuntimeLensRunner({
      read: async (params) => {
        captured.push({
          workspaceId: params.workspaceId,
          limit: params.limit,
          before: params.before,
        } as never);
        return { runs: [], agentsById: new Map(), truncated: false };
      },
    });
    registerLensRunner("runtime", fakeRunner);
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const list = await caller.list();
    const runtimeLens = list.find((e) => e.definition.kind === "runtime");
    const asOf = new Date("2026-05-01T00:00:00Z");
    await caller.render({
      workspaceId: 5,
      lensId: runtimeLens!.definition.id,
      limit: 25,
      asOf,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ workspaceId: 5, limit: 25 });
  });

  it("rejects non-admin callers", async () => {
    const caller = graphLensRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.render({ workspaceId: 1, lensId: "x" }),
    ).rejects.toThrow();
  });

  it("rejects invalid input shape", async () => {
    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    await expect(
      caller.render({ workspaceId: 0, lensId: "x" }),
    ).rejects.toThrow();
    await expect(
      caller.render({ workspaceId: 1, lensId: "" }),
    ).rejects.toThrow();
    await expect(
      caller.render({ workspaceId: 1, lensId: "x", limit: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.render({ workspaceId: 1, lensId: "x", limit: 9999 }),
    ).rejects.toThrow();
  });
});

// ============================================================================
// Source-scan: hard-rule boundary
// ============================================================================

describe("Source-scan: graph-lens-router boundary", () => {
  it("router file has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/graph-lens-router.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("router is mounted at agentStudio.graphLens.*", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(__dirname, "../../server/agent-studio/api/router.ts"),
      "utf8",
    );
    expect(src).toMatch(/graphLens:\s*graphLensRouter/);
  });

  it("router uses adminProcedure for every procedure", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/graph-lens-router.ts",
      ),
      "utf8",
    );
    // 3 procedures, all adminProcedure.
    expect(src.match(/adminProcedure/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // No publicProcedure / protectedProcedure leakage.
    expect(src).not.toMatch(/publicProcedure/);
    expect(src).not.toMatch(/protectedProcedure/);
  });
});
