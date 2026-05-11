/**
 * Phase 13 §4 — prompt-safe schema summary service tests.
 *
 * Covers `getPromptSafeSchemaSummary()` from
 * `services/graph-agent/schema-summary.ts`. Fake-DB returns rows
 * directly from the orderBy(...).limit() chain (no .where(), so the
 * fake is simpler than the explain-reader / runtime-usage fakes).
 */

import { describe, it, expect, vi } from "vitest";
import { getPromptSafeSchemaSummary } from "../../server/agent-studio/services/graph-agent/schema-summary";

type SelectChain = {
  from: () => SelectChain;
  orderBy: () => SelectChain;
  limit: (n: number) => Promise<Array<Record<string, unknown>>>;
};

interface FakeState {
  /** Queue of return values per select() call, in order:
   *  [nodeRows, edgeRows]. */
  queue: Array<Array<Record<string, unknown>>>;
  capturedLimits: number[];
}

function makeFakeDb(initial: { nodeRows: Array<Record<string, unknown>>; edgeRows: Array<Record<string, unknown>> }) {
  const state: FakeState = {
    queue: [initial.nodeRows, initial.edgeRows],
    capturedLimits: [],
  };
  const select = vi.fn(() => {
    const chain: SelectChain = {
      from: () => chain,
      orderBy: () => chain,
      limit: async (n) => {
        state.capturedLimits.push(n);
        return state.queue.shift() ?? [];
      },
    };
    return chain;
  });
  return { db: { select } as unknown, state };
}

describe("getPromptSafeSchemaSummary — Phase 13 §4", () => {
  it("returns an empty summary when ASDB is unavailable", async () => {
    const summary = await getPromptSafeSchemaSummary({
      getDb: () => null as never,
    });
    expect(summary).toEqual({
      nodeTypes: [],
      edgeTypes: [],
      nodeTypeCountTotal: 0,
      edgeTypeCountTotal: 0,
      truncated: false,
    });
  });

  it("maps row shapes to the prompt-safe surface", async () => {
    const { db } = makeFakeDb({
      nodeRows: [
        {
          typeKey: "Note",
          displayName: "Vault Note",
          description: "A markdown note",
          category: "knowledge",
        },
        {
          typeKey: "Entity",
          displayName: "Entity",
          description: null,
          category: null,
        },
      ],
      edgeRows: [
        {
          typeKey: "LINKS_TO",
          displayName: "Links to",
          description: "Wikilink relation",
          sourceNodeTypeKeys: ["Note"],
          targetNodeTypeKeys: ["Note"],
          cardinality: "many_to_many",
          isDirected: true,
        },
      ],
    });
    const summary = await getPromptSafeSchemaSummary({
      getDb: () => db as never,
    });
    expect(summary.nodeTypes).toHaveLength(2);
    expect(summary.nodeTypes[0]).toEqual({
      typeKey: "Note",
      displayName: "Vault Note",
      description: "A markdown note",
      category: "knowledge",
    });
    expect(summary.nodeTypes[1].description).toBeNull();
    expect(summary.edgeTypes).toHaveLength(1);
    expect(summary.edgeTypes[0]).toMatchObject({
      typeKey: "LINKS_TO",
      sourceNodeTypeKeys: ["Note"],
      targetNodeTypeKeys: ["Note"],
      isDirected: true,
    });
  });

  it("trims long descriptions to the budget with an ellipsis", async () => {
    const longDesc = "x".repeat(500);
    const { db } = makeFakeDb({
      nodeRows: [
        {
          typeKey: "N",
          displayName: "n",
          description: longDesc,
          category: null,
        },
      ],
      edgeRows: [],
    });
    const summary = await getPromptSafeSchemaSummary({
      getDb: () => db as never,
      descriptionBudget: 50,
    });
    expect(summary.nodeTypes[0].description!.length).toBeLessThanOrEqual(50);
    expect(summary.nodeTypes[0].description!.endsWith("…")).toBe(true);
  });

  it("requests N+1 rows from the DB so it can detect truncation cheaply", async () => {
    const { db, state } = makeFakeDb({
      nodeRows: [],
      edgeRows: [],
    });
    await getPromptSafeSchemaSummary({
      getDb: () => db as never,
      nodeLimit: 25,
      edgeLimit: 25,
    });
    expect(state.capturedLimits).toEqual([26, 26]);
  });

  it("flips `truncated: true` when more rows than the limit exist", async () => {
    // Return 3 rows when limit was set to 2 (N+1 = 3).
    const { db } = makeFakeDb({
      nodeRows: [
        { typeKey: "A", displayName: "A", description: null, category: null },
        { typeKey: "B", displayName: "B", description: null, category: null },
        { typeKey: "C", displayName: "C", description: null, category: null },
      ],
      edgeRows: [],
    });
    const summary = await getPromptSafeSchemaSummary({
      getDb: () => db as never,
      nodeLimit: 2,
      edgeLimit: 25,
    });
    expect(summary.nodeTypes).toHaveLength(2); // truncated to limit
    expect(summary.truncated).toBe(true);
    expect(summary.nodeTypeCountTotal).toBe(3); // limit + 1
  });

  it("flags truncation when only edges exceed the limit", async () => {
    const { db } = makeFakeDb({
      nodeRows: [],
      edgeRows: [
        {
          typeKey: "A",
          displayName: "A",
          description: null,
          sourceNodeTypeKeys: [],
          targetNodeTypeKeys: [],
          cardinality: null,
          isDirected: true,
        },
        {
          typeKey: "B",
          displayName: "B",
          description: null,
          sourceNodeTypeKeys: [],
          targetNodeTypeKeys: [],
          cardinality: null,
          isDirected: true,
        },
      ],
    });
    const summary = await getPromptSafeSchemaSummary({
      getDb: () => db as never,
      nodeLimit: 25,
      edgeLimit: 1,
    });
    expect(summary.edgeTypes).toHaveLength(1);
    expect(summary.truncated).toBe(true);
  });

  it("does NOT mark truncated when the result fits within the limit", async () => {
    const { db } = makeFakeDb({
      nodeRows: [
        { typeKey: "A", displayName: "A", description: null, category: null },
      ],
      edgeRows: [
        {
          typeKey: "E",
          displayName: "E",
          description: null,
          sourceNodeTypeKeys: ["A"],
          targetNodeTypeKeys: ["A"],
          cardinality: null,
          isDirected: true,
        },
      ],
    });
    const summary = await getPromptSafeSchemaSummary({
      getDb: () => db as never,
    });
    expect(summary.truncated).toBe(false);
    expect(summary.nodeTypeCountTotal).toBe(1);
    expect(summary.edgeTypeCountTotal).toBe(1);
  });

  it("treats null source/target node type arrays as empty arrays", async () => {
    const { db } = makeFakeDb({
      nodeRows: [],
      edgeRows: [
        {
          typeKey: "E",
          displayName: "E",
          description: null,
          sourceNodeTypeKeys: null,
          targetNodeTypeKeys: null,
          cardinality: null,
          isDirected: true,
        },
      ],
    });
    const summary = await getPromptSafeSchemaSummary({
      getDb: () => db as never,
    });
    expect(summary.edgeTypes[0].sourceNodeTypeKeys).toEqual([]);
    expect(summary.edgeTypes[0].targetNodeTypeKeys).toEqual([]);
  });
});
