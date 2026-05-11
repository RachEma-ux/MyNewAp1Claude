/**
 * Phase 12.5 §11 — Graph Skill query-template-run recorder factory tests.
 *
 * Covers `createQueryTemplateRunRecorder()` from
 * `services/graph-skill/template-run-recorder.ts`. Same "active-key"
 * side-channel fake-DB pattern as the §5 runtime-usage recorder
 * tests.
 */

import { describe, it, expect, vi } from "vitest";
import { createQueryTemplateRunRecorder } from "../../server/agent-studio/services/graph-skill/template-run-recorder";

type SelectChain = {
  from: () => SelectChain;
  where: () => SelectChain;
  orderBy: () => SelectChain;
  limit: (n: number) => Promise<Array<Record<string, unknown>>>;
};

interface FakeDb {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
}

interface FakeDbState {
  templateIdByKey: Record<string, number>;
  latestVersionByTemplateId: Record<number, number>;
  inserted: Record<string, unknown>[];
  selectCalls: number;
  queue: Array<"template" | "version">;
  activeKey?: string;
  activeTemplateId?: number;
}

function makeFakeDb(initial: Partial<FakeDbState> = {}) {
  const state: FakeDbState = {
    templateIdByKey: initial.templateIdByKey ?? {},
    latestVersionByTemplateId: initial.latestVersionByTemplateId ?? {},
    inserted: [],
    selectCalls: 0,
    queue: [],
  };

  const select = vi.fn(() => {
    state.selectCalls += 1;
    const chain: SelectChain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => {
        const op = state.queue.shift();
        if (op === "template") {
          const id = state.activeKey
            ? state.templateIdByKey[state.activeKey]
            : undefined;
          return id !== undefined ? [{ id }] : [];
        }
        if (op === "version") {
          const v = state.activeTemplateId
            ? state.latestVersionByTemplateId[state.activeTemplateId]
            : undefined;
          return v !== undefined ? [{ id: v }] : [];
        }
        return [];
      },
    };
    return chain;
  });

  let nextInsertId = 5000;
  const insert = vi.fn(() => ({
    values: (vals: Record<string, unknown>) => {
      state.inserted.push(vals);
      const id = nextInsertId++;
      // Older code paths await values() directly; newer code chains
      // .returning(). Support both shapes.
      const result = {
        returning: async () => [{ id }],
      };
      // Make the values() return both a thenable (for `await
      // db.insert().values(...)`) and a chainable returning().
      return Object.assign(Promise.resolve(undefined), result) as unknown as Promise<void> & {
        returning: () => Promise<Array<{ id: number }>>;
      };
    },
  }));

  return { db: { select, insert } as FakeDb, state };
}

describe("createQueryTemplateRunRecorder — Phase 12.5 §11", () => {
  it("returns null when ASDB is unavailable (no row written)", async () => {
    const recorder = createQueryTemplateRunRecorder({
      getDb: () => null as never,
    });
    const result = await recorder({
      templateKey: "tpl",
      parameters: {},
      status: "success",
      durationMs: 5,
      resultCount: 0,
    });
    // Phase 12.5 §12 changed the contract — recorder now returns the
    // inserted row id (or null when nothing was written). Callers
    // (router) treat null and undefined identically.
    expect(result).toBeNull();
  });

  it("inserts a success row with resolved templateId + latest versionId", async () => {
    const { db, state } = makeFakeDb({
      templateIdByKey: { "tpl-a": 7 },
      latestVersionByTemplateId: { 7: 100 },
    });
    state.queue.push("template", "version");
    state.activeKey = "tpl-a";
    state.activeTemplateId = 7;
    const recorder = createQueryTemplateRunRecorder({
      getDb: () => db as never,
    });
    await recorder({
      templateKey: "tpl-a",
      parameters: { foo: "bar" },
      status: "success",
      resultCount: 42,
      durationMs: 123,
      userId: 5,
      retrievalRunId: 999,
    });
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      templateId: 7,
      templateVersionId: 100,
      retrievalRunId: 999,
      parameters: { foo: "bar" },
      userId: 5,
      durationMs: 123,
      resultCount: 42,
      status: "success",
      errorMessage: null,
    });
  });

  it("inserts an error row with errorMessage and null resultCount", async () => {
    const { db, state } = makeFakeDb({
      templateIdByKey: { "tpl-a": 7 },
      latestVersionByTemplateId: { 7: 100 },
    });
    state.queue.push("template", "version");
    state.activeKey = "tpl-a";
    state.activeTemplateId = 7;
    const recorder = createQueryTemplateRunRecorder({
      getDb: () => db as never,
    });
    await recorder({
      templateKey: "tpl-a",
      parameters: {},
      status: "error",
      durationMs: 50,
      errorMessage: "backend down",
    });
    expect(state.inserted[0]).toMatchObject({
      status: "error",
      errorMessage: "backend down",
      resultCount: null,
    });
  });

  it("skips insert when templateKey doesn't resolve to a templateId", async () => {
    const { db, state } = makeFakeDb();
    state.queue.push("template");
    state.activeKey = "missing";
    const recorder = createQueryTemplateRunRecorder({
      getDb: () => db as never,
    });
    await recorder({
      templateKey: "missing",
      parameters: {},
      status: "success",
      durationMs: 1,
      resultCount: 0,
    });
    expect(state.inserted).toHaveLength(0);
  });

  it("inserts with templateVersionId=null when no versions exist for the template", async () => {
    const { db, state } = makeFakeDb({
      templateIdByKey: { "tpl-a": 7 },
      // no latestVersion entry → "version" select returns []
    });
    state.queue.push("template", "version");
    state.activeKey = "tpl-a";
    state.activeTemplateId = 7;
    const recorder = createQueryTemplateRunRecorder({
      getDb: () => db as never,
    });
    await recorder({
      templateKey: "tpl-a",
      parameters: {},
      status: "success",
      resultCount: 1,
      durationMs: 2,
    });
    expect(state.inserted[0].templateVersionId).toBeNull();
  });

  it("caches templateKey resolutions across calls", async () => {
    const { db, state } = makeFakeDb({
      templateIdByKey: { "tpl-a": 7 },
      latestVersionByTemplateId: { 7: 100 },
    });
    state.activeKey = "tpl-a";
    state.activeTemplateId = 7;
    const recorder = createQueryTemplateRunRecorder({
      getDb: () => db as never,
    });

    state.queue.push("template", "version");
    await recorder({
      templateKey: "tpl-a",
      parameters: {},
      status: "success",
      resultCount: 1,
      durationMs: 2,
    });
    const firstCallSelects = state.selectCalls;

    await recorder({
      templateKey: "tpl-a",
      parameters: {},
      status: "success",
      resultCount: 1,
      durationMs: 2,
    });
    // Second call hit the cache — no new SELECTs.
    expect(state.selectCalls).toBe(firstCallSelects);
    expect(state.inserted).toHaveLength(2);
  });
});
