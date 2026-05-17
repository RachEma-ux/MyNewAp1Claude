/**
 * Code Intelligence lens runner — ninth real `LensRunnerFn` (T-G.2.5).
 * Brings the lens-stack coverage to 9/9 (post-extension from 8 kinds).
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildCodeIntelligenceLensSnapshot,
  clampCodeIntelligenceLensLimit,
  createCodeIntelligenceLensRunner,
  isCodeIntelligenceNodeVisibleToViewer,
  maybeInstallCodeIntelligenceLensRunner,
  CODE_INTELLIGENCE_LENS_ABSOLUTE_LIMIT,
  CODE_INTELLIGENCE_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type GraphLensDefinition,
  type CodeIntelligenceLensReadFn,
  type CodeIntelligenceLensReadResult,
  type LensRunnerViewerContext,
} from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetLensRunnerRegistryForTests();
});

const NOW = new Date("2026-05-17T12:00:00Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(overrides: Partial<GraphLensDefinition> = {}): GraphLensDefinition {
  return {
    id: "code_intelligence_x",
    kind: "code_intelligence",
    label: "Code Intelligence",
    layout: "force_directed",
    governanceScope: "workspace_members",
    description: "test lens",
    ...overrides,
  };
}

function makeRead(
  overrides: Partial<CodeIntelligenceLensReadResult> = {},
): CodeIntelligenceLensReadResult {
  return {
    ingestionId: "repo:abc::2026-05-17T00:00:00Z",
    repositoryId: "repo:abc",
    nodes: [
      {
        id: "file:src/a.ts",
        typeKey: "file",
        name: "a.ts",
        filePath: "src/a.ts",
      },
      {
        id: "function:src/a.ts::foo",
        typeKey: "function",
        name: "foo",
        filePath: "src/a.ts",
        startLine: 1,
        endLine: 5,
      },
    ],
    edges: [
      {
        id: "file:src/a.ts::declares::function:src/a.ts::foo",
        sourceId: "file:src/a.ts",
        edgeTypeKey: "declares",
        targetId: "function:src/a.ts::foo",
      },
    ],
    truncated: false,
    ...overrides,
  };
}

describe("T-G.2.5 — Code Intelligence lens runner", () => {
  describe("clampCodeIntelligenceLensLimit", () => {
    it("returns DEFAULT when undefined", () => {
      expect(clampCodeIntelligenceLensLimit(undefined)).toBe(
        CODE_INTELLIGENCE_LENS_DEFAULT_LIMIT,
      );
    });
    it("returns DEFAULT when zero or negative", () => {
      expect(clampCodeIntelligenceLensLimit(0)).toBe(
        CODE_INTELLIGENCE_LENS_DEFAULT_LIMIT,
      );
      expect(clampCodeIntelligenceLensLimit(-5)).toBe(
        CODE_INTELLIGENCE_LENS_DEFAULT_LIMIT,
      );
    });
    it("caps at ABSOLUTE", () => {
      expect(
        clampCodeIntelligenceLensLimit(CODE_INTELLIGENCE_LENS_ABSOLUTE_LIMIT * 2),
      ).toBe(CODE_INTELLIGENCE_LENS_ABSOLUTE_LIMIT);
    });
    it("passes through within range", () => {
      expect(clampCodeIntelligenceLensLimit(50)).toBe(50);
    });
  });

  describe("isCodeIntelligenceNodeVisibleToViewer", () => {
    it("returns true when userId is set", () => {
      expect(isCodeIntelligenceNodeVisibleToViewer(VIEWER)).toBe(true);
    });
    it("returns false when userId is null", () => {
      expect(isCodeIntelligenceNodeVisibleToViewer(VIEWER_ANON)).toBe(false);
    });
  });

  describe("buildCodeIntelligenceLensSnapshot", () => {
    it("emits synthetic ingestion node + per-parsed-node lens nodes + edges", () => {
      const snap = buildCodeIntelligenceLensSnapshot({
        def: makeDef(),
        viewer: VIEWER,
        read: makeRead(),
        now: NOW,
      });
      // 1 ingestion + 2 parsed nodes
      expect(snap.nodes).toHaveLength(3);
      expect(snap.edges).toHaveLength(1);
      expect(snap.lensId).toBe("code_intelligence_x");
      expect(snap.kind).toBe("code_intelligence");
      expect(snap.layout).toBe("force_directed");
    });

    it("preserves the closed-taxonomy typeKeys verbatim (file / function / declares)", () => {
      const snap = buildCodeIntelligenceLensSnapshot({
        def: makeDef(),
        viewer: VIEWER,
        read: makeRead(),
        now: NOW,
      });
      const typeKeys = snap.nodes.map((n) => n.typeKey);
      expect(typeKeys).toContain("file");
      expect(typeKeys).toContain("function");
      expect(typeKeys).toContain("code_graph_ingestion");
      expect(snap.edges[0]?.typeKey).toBe("declares");
    });

    it("anon viewer hides all node payloads + counts hiddenNodeCount", () => {
      const snap = buildCodeIntelligenceLensSnapshot({
        def: makeDef(),
        viewer: VIEWER_ANON,
        read: makeRead(),
        now: NOW,
      });
      expect(snap.nodes.every((n) => n.visible === false)).toBe(true);
      expect(snap.hiddenNodeCount).toBe(3);
      // Edges still emitted but marked invisible
      expect(snap.edges.every((e) => e.visible === false)).toBe(true);
    });

    it("skips synthetic ingestion node when read has no ingestionId (empty repo)", () => {
      const snap = buildCodeIntelligenceLensSnapshot({
        def: makeDef(),
        viewer: VIEWER,
        read: makeRead({ ingestionId: null, repositoryId: null, nodes: [], edges: [] }),
        now: NOW,
      });
      expect(snap.nodes).toHaveLength(0);
      expect(snap.edges).toHaveLength(0);
    });

    it("propagates the read's truncated flag", () => {
      const snap = buildCodeIntelligenceLensSnapshot({
        def: makeDef(),
        viewer: VIEWER,
        read: makeRead({ truncated: true }),
        now: NOW,
      });
      expect(snap.truncated).toBe(true);
    });
  });

  describe("createCodeIntelligenceLensRunner", () => {
    it("invokes the read fn with the clamped limit", async () => {
      const calls: Array<{ limit: number }> = [];
      const read: CodeIntelligenceLensReadFn = async (params) => {
        calls.push({ limit: params.limit });
        return makeRead();
      };
      const runner = createCodeIntelligenceLensRunner({ read, now: () => NOW });
      const snap = await runner(makeDef(), { ...VIEWER, limit: 50 });
      expect(calls).toEqual([{ limit: 50 }]);
      expect(snap.producedAt).toEqual(NOW);
    });

    it("clamps over-limit requests", async () => {
      const calls: Array<{ limit: number }> = [];
      const read: CodeIntelligenceLensReadFn = async (params) => {
        calls.push({ limit: params.limit });
        return makeRead();
      };
      const runner = createCodeIntelligenceLensRunner({ read, now: () => NOW });
      await runner(makeDef(), {
        ...VIEWER,
        limit: CODE_INTELLIGENCE_LENS_ABSOLUTE_LIMIT * 3,
      });
      expect(calls[0]?.limit).toBe(CODE_INTELLIGENCE_LENS_ABSOLUTE_LIMIT);
    });

    it("uses the default limit when viewer.limit is undefined", async () => {
      const calls: Array<{ limit: number }> = [];
      const read: CodeIntelligenceLensReadFn = async (params) => {
        calls.push({ limit: params.limit });
        return makeRead();
      };
      const runner = createCodeIntelligenceLensRunner({ read, now: () => NOW });
      await runner(makeDef(), VIEWER);
      expect(calls[0]?.limit).toBe(CODE_INTELLIGENCE_LENS_DEFAULT_LIMIT);
    });
  });

  describe("maybeInstallCodeIntelligenceLensRunner", () => {
    it("envflag off → not installed", () => {
      const read: CodeIntelligenceLensReadFn = async () => makeRead();
      const result = maybeInstallCodeIntelligenceLensRunner({
        env: {},
        read,
      });
      expect(result.installed).toBe(false);
      expect(getLensRunner("code_intelligence")).toBeUndefined();
    });

    it("envflag on → installed + runnable via runLens", async () => {
      const read: CodeIntelligenceLensReadFn = async () => makeRead();
      const result = maybeInstallCodeIntelligenceLensRunner({
        env: { AGS_GRAPH_LENS_CODE_INTELLIGENCE_RUNNER_INSTALL: "on" },
        read,
        now: () => NOW,
      });
      expect(result.installed).toBe(true);
      expect(getLensRunner("code_intelligence")).toBeDefined();
      const snap = await runLens(makeDef(), VIEWER);
      expect(snap).not.toBeNull();
      expect(snap?.kind).toBe("code_intelligence");
    });
  });
});
