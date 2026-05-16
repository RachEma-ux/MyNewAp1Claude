/**
 * RAG lens runner — fifth real `LensRunnerFn` (T-F.66).
 *
 * Continues precedent (l) replication on `kind="rag"`. Tests the
 * pure builder + factory + installer + ASDB adapter.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildRagLensSnapshot,
  clampRagLensLimit,
  createRagLensRunner,
  createRagLensAsdbReader,
  isRagNodeVisibleToViewer,
  maybeInstallRagLensRunner,
  maybeInstallRagLensRunnerWithAsdb,
  RAG_LENS_ABSOLUTE_LIMIT,
  RAG_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type GraphLensDefinition,
  type LensRunnerViewerContext,
  type RagLensReadFn,
  type RagLensReadResult,
  type RagLensSourceRow,
} from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetLensRunnerRegistryForTests();
});

const NOW = new Date("2026-05-16T12:00:00Z");
const T = new Date("2026-05-16T00:00:00Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(overrides: Partial<GraphLensDefinition> = {}): GraphLensDefinition {
  return {
    id: "rag_x",
    kind: "rag",
    label: "RAG",
    layout: "force_directed",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

function makeSource(overrides: Partial<RagLensSourceRow> = {}): RagLensSourceRow {
  return {
    id: 100,
    workspaceId: 1,
    profileId: 5,
    sourceType: "document_collection",
    ownerModule: "agentStudio",
    externalRefId: null,
    displayName: "Docs",
    enabled: true,
    priority: 50,
    embeddingModelRef: null,
    embeddingModelDim: null,
    createdAt: T,
    ...overrides,
  };
}

function makeRead(
  sources: ReadonlyArray<RagLensSourceRow>,
  truncated = false,
): RagLensReadResult {
  return { sources, truncated };
}

// ============================================================================
// clamp + visibility
// ============================================================================

describe("clampRagLensLimit", () => {
  it("returns DEFAULT when undefined", () => {
    expect(clampRagLensLimit(undefined)).toBe(RAG_LENS_DEFAULT_LIMIT);
  });
  it("clamps to ABSOLUTE when over the cap", () => {
    expect(clampRagLensLimit(10_000)).toBe(RAG_LENS_ABSOLUTE_LIMIT);
  });
});

describe("isRagNodeVisibleToViewer", () => {
  it("hidden for anonymous", () => {
    expect(isRagNodeVisibleToViewer(VIEWER_ANON)).toBe(false);
  });
  it("visible for authenticated", () => {
    expect(isRagNodeVisibleToViewer(VIEWER)).toBe(true);
  });
});

// ============================================================================
// Builder shape
// ============================================================================

describe("buildRagLensSnapshot", () => {
  it("empty read returns empty snapshot", () => {
    const snap = buildRagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([]),
      now: NOW,
    });
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
    expect(snap.kind).toBe("rag");
  });

  it("single source produces 2 nodes (rag_profile + rag_source) + 1 belongs_to edge", () => {
    const snap = buildRagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makeSource({ id: 100, profileId: 5 })]),
      now: NOW,
    });
    expect(snap.nodes.map((n) => n.typeKey).sort()).toEqual([
      "rag_profile",
      "rag_source",
    ]);
    expect(snap.edges).toEqual([
      {
        typeKey: "belongs_to_profile",
        sourceNodeId: "source:100",
        targetNodeId: "profile:5",
        visible: true,
      },
    ]);
  });

  it("dedupes rag_profile across multiple sources sharing the same profile", () => {
    const snap = buildRagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makeSource({ id: 100, profileId: 5 }),
        makeSource({ id: 101, profileId: 5 }),
        makeSource({ id: 102, profileId: 6 }),
      ]),
      now: NOW,
    });
    const profiles = snap.nodes.filter((n) => n.typeKey === "rag_profile");
    const sources = snap.nodes.filter((n) => n.typeKey === "rag_source");
    expect(profiles.map((n) => n.id).sort()).toEqual(["profile:5", "profile:6"]);
    expect(sources).toHaveLength(3);
    expect(snap.edges).toHaveLength(3);
  });

  it("anonymous viewer sees redacted nodes with no label/meta", () => {
    const snap = buildRagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read: makeRead([makeSource()]),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(2);
    for (const n of snap.nodes) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    expect(snap.hiddenNodeCount).toBe(2);
  });

  it("source label falls back to typeKey #id when displayName is null", () => {
    const snap = buildRagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makeSource({ id: 100, displayName: null, sourceType: "vector_index" }),
      ]),
      now: NOW,
    });
    const source = snap.nodes.find((n) => n.typeKey === "rag_source");
    expect(source?.label).toBe("vector_index #100");
  });

  it("source meta carries embedding binding when set", () => {
    const snap = buildRagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makeSource({
          id: 100,
          embeddingModelRef: "openai/text-embedding-3-small",
          embeddingModelDim: 1536,
        }),
      ]),
      now: NOW,
    });
    const source = snap.nodes.find((n) => n.typeKey === "rag_source");
    expect(source?.meta).toMatchObject({
      embeddingModelRef: "openai/text-embedding-3-small",
      embeddingModelDim: 1536,
    });
  });

  it("forwards read.truncated to snapshot.truncated", () => {
    const snap = buildRagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([], true),
      now: NOW,
    });
    expect(snap.truncated).toBe(true);
  });
});

// ============================================================================
// Factory
// ============================================================================

describe("createRagLensRunner — factory + DB seam", () => {
  it("calls read seam; clamps limit", async () => {
    const captured: unknown[] = [];
    const read: RagLensReadFn = async (params) => {
      captured.push(params);
      return makeRead([]);
    };
    const runner = createRagLensRunner({ read, now: () => NOW });
    await runner(makeDef(), { workspaceId: 5, userId: 42, limit: 10_000 });
    expect(captured).toEqual([
      { workspaceId: 5, limit: RAG_LENS_ABSOLUTE_LIMIT, before: undefined },
    ]);
  });
});

// ============================================================================
// Installer
// ============================================================================

describe("maybeInstallRagLensRunner — envflag gate", () => {
  const noopRead: RagLensReadFn = async () => makeRead([]);

  it("no-op when env flag missing", () => {
    expect(maybeInstallRagLensRunner({ env: {}, read: noopRead }).installed).toBe(
      false,
    );
    expect(getLensRunner("rag")).toBeUndefined();
  });

  it("installs when 'on'", () => {
    expect(
      maybeInstallRagLensRunner({
        env: { AGS_GRAPH_LENS_RAG_RUNNER_INSTALL: "on" },
        read: noopRead,
      }).installed,
    ).toBe(true);
    expect(getLensRunner("rag")).toBeDefined();
  });

  it("composer with-asdb installs when 'on'", () => {
    expect(
      maybeInstallRagLensRunnerWithAsdb({
        env: { AGS_GRAPH_LENS_RAG_RUNNER_INSTALL: "on" },
        readerOptions: { getDbForWorkspace: () => null as never },
      }).installed,
    ).toBe(true);
    expect(getLensRunner("rag")).toBeDefined();
  });
});

// ============================================================================
// End-to-end
// ============================================================================

describe("runLens dispatches through the real rag runner", () => {
  it("returns a rag snapshot after install", async () => {
    const read: RagLensReadFn = async () =>
      makeRead([makeSource({ id: 100, profileId: 5 })]);
    maybeInstallRagLensRunner({
      env: { AGS_GRAPH_LENS_RAG_RUNNER_INSTALL: "on" },
      read,
      now: () => NOW,
    });
    const snap = await runLens(makeDef(), { workspaceId: 1, userId: 42 });
    expect(snap.kind).toBe("rag");
    expect(snap.nodes).toHaveLength(2);
    expect(snap.edges).toHaveLength(1);
  });
});

// ============================================================================
// ASDB fail-soft
// ============================================================================

describe("createRagLensAsdbReader — fail-soft", () => {
  it("returns empty result when getDbForWorkspace returns null", async () => {
    const read = createRagLensAsdbReader({
      getDbForWorkspace: () => null as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.sources).toEqual([]);
  });
});

// ============================================================================
// Source-scan
// ============================================================================

describe("Source-scan: rag-lens-runner boundary", () => {
  it("runner file: no banned imports + no Drizzle", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/rag-lens-runner.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
    expect(src).not.toMatch(/from\s+["'].*drizzle/);
    expect(src).not.toMatch(/from\s+["'].*\/db\/connection/);
  });

  it("ASDB reader file: no banned imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/rag-lens-asdb-reader.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("installer file: no banned imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/install-rag-lens-runner.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });
});
