/**
 * Lens Runner contract — Phase 24 §T-F.5.
 *
 * Tests the runner-registry primitive that future per-lens runners
 * (T-F.6 governance runner, T-F.7 runtime runner, etc.) hang off.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerLensRunner,
  getLensRunner,
  runLens,
  listLensRunnerKinds,
  __resetLensRunnerRegistryForTests,
  LensRunnerAlreadyRegisteredForKindError,
  LensRunnerNotRegisteredForKindError,
  type LensRunnerFn,
  type LensSnapshot,
  type GraphLensDefinition,
  GRAPH_LENS_KINDS,
} from "../../server/agent-studio/services/graph-lens/public-api";

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

function makeRunnerReturning(snap: Partial<LensSnapshot>): LensRunnerFn {
  return async () =>
    ({
      lensId: "ignored",
      kind: "rag",
      layout: "force_directed",
      producedAt: new Date("2026-01-01T00:00:00Z"),
      nodes: [],
      edges: [],
      hiddenNodeCount: 0,
      truncated: false,
      ...snap,
    }) as LensSnapshot;
}

describe("registerLensRunner + lookup", () => {
  it("registers a runner per kind and round-trips via getLensRunner", () => {
    const fn = makeRunnerReturning({ lensId: "rag_x" });
    registerLensRunner("rag", fn);
    expect(getLensRunner("rag")).toBe(fn);
  });

  it("returns undefined for an unregistered kind", () => {
    expect(getLensRunner("governance")).toBeUndefined();
  });

  it("listLensRunnerKinds returns registered kinds", () => {
    registerLensRunner("rag", makeRunnerReturning({}));
    registerLensRunner("governance", makeRunnerReturning({}));
    const kinds = listLensRunnerKinds();
    expect(kinds).toContain("rag");
    expect(kinds).toContain("governance");
    expect(kinds).toHaveLength(2);
  });
});

describe("Idempotency: re-registering same kind throws", () => {
  it("throws LensRunnerAlreadyRegisteredForKindError", () => {
    registerLensRunner("rag", makeRunnerReturning({}));
    expect(() => registerLensRunner("rag", makeRunnerReturning({}))).toThrow(
      LensRunnerAlreadyRegisteredForKindError,
    );
  });

  it("error message names the conflicting kind", () => {
    registerLensRunner("governance", makeRunnerReturning({}));
    try {
      registerLensRunner("governance", makeRunnerReturning({}));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LensRunnerAlreadyRegisteredForKindError);
      expect((err as Error).message).toContain('kind="governance"');
    }
  });
});

describe("runLens — dispatches to registered runner", () => {
  it("calls the runner registered for the definition's kind", async () => {
    const calls: string[] = [];
    registerLensRunner("rag", async (def) => {
      calls.push(def.id);
      return {
        lensId: def.id,
        kind: def.kind,
        layout: def.layout,
        producedAt: new Date(),
        nodes: [],
        edges: [],
        hiddenNodeCount: 0,
        truncated: false,
      };
    });
    const snapshot = await runLens(makeDef("rag_x"), {
      workspaceId: 1,
      userId: 42,
    });
    expect(calls).toEqual(["rag_x"]);
    expect(snapshot.lensId).toBe("rag_x");
  });

  it("throws LensRunnerNotRegisteredForKindError when no runner is registered", async () => {
    await expect(
      runLens(makeDef("rag_x"), { workspaceId: 1, userId: 42 }),
    ).rejects.toBeInstanceOf(LensRunnerNotRegisteredForKindError);
  });

  it("multiple lens definitions of the same kind share the same runner", async () => {
    const seen: string[] = [];
    registerLensRunner("rag", async (def) => {
      seen.push(def.id);
      return {
        lensId: def.id,
        kind: def.kind,
        layout: def.layout,
        producedAt: new Date(),
        nodes: [],
        edges: [],
        hiddenNodeCount: 0,
        truncated: false,
      };
    });
    await runLens(makeDef("rag_default"), { workspaceId: 1, userId: 1 });
    await runLens(makeDef("rag_legal_only"), { workspaceId: 1, userId: 1 });
    expect(seen).toEqual(["rag_default", "rag_legal_only"]);
  });
});

describe("Snapshot shape integrity", () => {
  it("LensSnapshotNode supports visible=false redaction", () => {
    const node = {
      typeKey: "Note",
      id: "n:1",
      visible: false,
      // label omitted when redacted — type allows undefined
    };
    expect(node.visible).toBe(false);
  });

  it("LensSnapshot.hiddenNodeCount surfaces operator-visible redaction total", () => {
    const snap: LensSnapshot = {
      lensId: "x",
      kind: "rag",
      layout: "force_directed",
      producedAt: new Date(),
      nodes: [],
      edges: [],
      hiddenNodeCount: 7,
      truncated: false,
    };
    expect(snap.hiddenNodeCount).toBe(7);
  });

  it("LensSnapshot.truncated flags cap hit", () => {
    const snap: LensSnapshot = {
      lensId: "x",
      kind: "rag",
      layout: "force_directed",
      producedAt: new Date(),
      nodes: [],
      edges: [],
      hiddenNodeCount: 0,
      truncated: true,
    };
    expect(snap.truncated).toBe(true);
  });
});

describe("All 8 lens kinds can register a runner (taxonomy completeness check)", () => {
  it("every closed-taxonomy kind can host a runner", () => {
    for (const kind of GRAPH_LENS_KINDS) {
      const fn = makeRunnerReturning({});
      registerLensRunner(kind, fn);
      expect(getLensRunner(kind)).toBe(fn);
    }
    expect(listLensRunnerKinds()).toHaveLength(GRAPH_LENS_KINDS.length);
  });
});
