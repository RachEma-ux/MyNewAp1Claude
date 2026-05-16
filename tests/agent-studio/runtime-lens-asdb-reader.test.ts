/**
 * Runtime lens — ASDB read-seam adapter (T-F.60).
 *
 * Tests the DB-touching half of the runtime lens via a fake Drizzle
 * shape that the adapter calls into. The pure builder lives in
 * `runtime-lens-runner.test.ts` (T-F.59); this file only exercises
 * the adapter's query construction + truncation + agent-fetch
 * batching + fail-soft contract.
 */

import { describe, it, expect } from "vitest";

import {
  createRuntimeLensAsdbReader,
  maybeInstallRuntimeLensRunnerWithAsdb,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
} from "../../server/agent-studio/services/graph-lens/public-api";

// ============================================================================
// Fake Drizzle — captures the chain calls and returns scripted rows
// ============================================================================

interface ScriptedQuery {
  table: "runtime_runs" | "agents";
  result: unknown[];
}

interface FakeDbState {
  readonly script: ScriptedQuery[];
  readonly observed: Array<{
    table: string;
    hasWhere: boolean;
    hasOrderBy: boolean;
    limit: number | null;
  }>;
}

function makeFakeDb(script: ScriptedQuery[]) {
  const state: FakeDbState = { script, observed: [] };

  function makeChain(table: "runtime_runs" | "agents") {
    let hasWhere = false;
    let hasOrderBy = false;
    let limitValue: number | null = null;

    const chain = {
      from() {
        return chain;
      },
      where() {
        hasWhere = true;
        return chain;
      },
      orderBy() {
        hasOrderBy = true;
        return chain;
      },
      limit(n: number) {
        limitValue = n;
        return chain;
      },
      then(resolve: (rows: unknown[]) => void) {
        state.observed.push({
          table,
          hasWhere,
          hasOrderBy,
          limit: limitValue,
        });
        const next = state.script.shift();
        if (!next || next.table !== table) {
          throw new Error(
            `unexpected ${table} query (script exhausted or mismatched: next=${next?.table ?? "<empty>"})`,
          );
        }
        resolve(next.result);
        return Promise.resolve();
      },
    };
    return chain;
  }

  const db = {
    select(_cols: unknown) {
      // The adapter calls db.select(cols).from(table) — we route based
      // on which table the FROM landed on. Since the script is ordered,
      // we trust the script's `table` field; the chain re-asserts on
      // resolution.
      const peeked = state.script[0];
      if (!peeked) {
        throw new Error("select() called but script exhausted");
      }
      return makeChain(peeked.table);
    },
  };
  return { db, state };
}

// ============================================================================
// createRuntimeLensAsdbReader — fail-soft when DB lookup is null
// ============================================================================

describe("createRuntimeLensAsdbReader — fail-soft", () => {
  it("returns empty result when getDbForWorkspace returns null", async () => {
    const read = createRuntimeLensAsdbReader({
      getDbForWorkspace: () => null as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.runs).toEqual([]);
    expect(result.agentsById.size).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("returns empty result when getDbForWorkspace returns undefined", async () => {
    const read = createRuntimeLensAsdbReader({
      getDbForWorkspace: () => undefined as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.runs).toEqual([]);
  });
});

// ============================================================================
// createRuntimeLensAsdbReader — query construction
// ============================================================================

describe("createRuntimeLensAsdbReader — query construction", () => {
  it("selects limit+1 from runtime_runs WITHOUT where when no `before`", async () => {
    const { db, state } = makeFakeDb([
      { table: "runtime_runs", result: [] },
    ]);
    const read = createRuntimeLensAsdbReader({
      getDbForWorkspace: () => db as never,
    });
    await read({ workspaceId: 1, limit: 50 });
    expect(state.observed).toHaveLength(1);
    expect(state.observed[0]).toEqual({
      table: "runtime_runs",
      hasWhere: false,
      hasOrderBy: true,
      limit: 51,
    });
  });

  it("selects limit+1 from runtime_runs WITH where when `before` provided", async () => {
    const { db, state } = makeFakeDb([
      { table: "runtime_runs", result: [] },
    ]);
    const read = createRuntimeLensAsdbReader({
      getDbForWorkspace: () => db as never,
    });
    await read({ workspaceId: 1, limit: 50, before: new Date("2026-05-01") });
    expect(state.observed[0].hasWhere).toBe(true);
    expect(state.observed[0].limit).toBe(51);
  });

  it("does NOT issue an agents query when no runs were returned", async () => {
    const { db, state } = makeFakeDb([
      { table: "runtime_runs", result: [] },
    ]);
    const read = createRuntimeLensAsdbReader({
      getDbForWorkspace: () => db as never,
    });
    await read({ workspaceId: 1, limit: 50 });
    expect(state.observed).toHaveLength(1);
  });

  it("issues exactly one agents query for the union of agentIds", async () => {
    const t = new Date("2026-05-16T00:00:00Z");
    const { db, state } = makeFakeDb([
      {
        table: "runtime_runs",
        result: [
          makeRawRun({ id: 1, agentId: 10, createdAt: t }),
          makeRawRun({ id: 2, agentId: 11, createdAt: t }),
          makeRawRun({ id: 3, agentId: 10, createdAt: t }),
        ],
      },
      {
        table: "agents",
        result: [
          { id: 10, ownerId: 42, visibility: "private" },
          { id: 11, ownerId: 99, visibility: "public" },
        ],
      },
    ]);
    const read = createRuntimeLensAsdbReader({
      getDbForWorkspace: () => db as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(state.observed.map((o) => o.table)).toEqual([
      "runtime_runs",
      "agents",
    ]);
    expect(result.runs).toHaveLength(3);
    expect(result.agentsById.size).toBe(2);
    expect(result.agentsById.get(10)).toEqual({
      id: 10,
      ownerId: 42,
      visibility: "private",
    });
    expect(result.agentsById.get(11)).toEqual({
      id: 11,
      ownerId: 99,
      visibility: "public",
    });
  });
});

// ============================================================================
// createRuntimeLensAsdbReader — truncation detection
// ============================================================================

describe("createRuntimeLensAsdbReader — truncation detection", () => {
  it("truncated=false when result count <= limit", async () => {
    const t = new Date("2026-05-16T00:00:00Z");
    const { db } = makeFakeDb([
      {
        table: "runtime_runs",
        result: [
          makeRawRun({ id: 1, createdAt: t }),
          makeRawRun({ id: 2, createdAt: t }),
        ],
      },
      { table: "agents", result: [] },
    ]);
    const read = createRuntimeLensAsdbReader({
      getDbForWorkspace: () => db as never,
    });
    const result = await read({ workspaceId: 1, limit: 5 });
    expect(result.runs).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it("truncated=true when result count > limit; extra row dropped", async () => {
    const t = new Date("2026-05-16T00:00:00Z");
    const { db } = makeFakeDb([
      {
        table: "runtime_runs",
        result: [
          makeRawRun({ id: 1, createdAt: t }),
          makeRawRun({ id: 2, createdAt: t }),
          makeRawRun({ id: 3, createdAt: t }),
        ],
      },
      { table: "agents", result: [] },
    ]);
    const read = createRuntimeLensAsdbReader({
      getDbForWorkspace: () => db as never,
    });
    // limit=2 + 1 fetch = 3 rows; truncated=true; keeps the first 2.
    const result = await read({ workspaceId: 1, limit: 2 });
    expect(result.runs).toHaveLength(2);
    expect(result.runs.map((r) => r.id)).toEqual([1, 2]);
    expect(result.truncated).toBe(true);
  });
});

// ============================================================================
// createRuntimeLensAsdbReader — row shape preservation
// ============================================================================

describe("createRuntimeLensAsdbReader — row shape preservation", () => {
  it("preserves every lineage column on the run row", async () => {
    const t = new Date("2026-05-16T00:00:00Z");
    const { db } = makeFakeDb([
      {
        table: "runtime_runs",
        result: [
          {
            id: 7,
            agentId: 10,
            status: "running",
            parentRunId: 6,
            resumedFromRunId: 5,
            compactedFromRunId: 4,
            triggeredBy: 42,
            summary: "ok",
            durationMs: 1234,
            errorReason: null,
            createdAt: t,
          },
        ],
      },
      { table: "agents", result: [] },
    ]);
    const read = createRuntimeLensAsdbReader({
      getDbForWorkspace: () => db as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.runs[0]).toEqual({
      id: 7,
      agentId: 10,
      status: "running",
      parentRunId: 6,
      resumedFromRunId: 5,
      compactedFromRunId: 4,
      triggeredBy: 42,
      summary: "ok",
      durationMs: 1234,
      errorReason: null,
      createdAt: t,
    });
  });
});

// ============================================================================
// maybeInstallRuntimeLensRunnerWithAsdb — composes the boot installer
// ============================================================================

describe("maybeInstallRuntimeLensRunnerWithAsdb — composes the boot installer", () => {
  it("no-op when env flag is missing", () => {
    __resetLensRunnerRegistryForTests();
    const result = maybeInstallRuntimeLensRunnerWithAsdb({ env: {} });
    expect(result.installed).toBe(false);
    expect(getLensRunner("runtime")).toBeUndefined();
  });

  it("installs the runtime runner when flag is 'on'", () => {
    __resetLensRunnerRegistryForTests();
    const result = maybeInstallRuntimeLensRunnerWithAsdb({
      env: { AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: "on" },
      readerOptions: { getDbForWorkspace: () => null as never },
    });
    expect(result.installed).toBe(true);
    expect(getLensRunner("runtime")).toBeDefined();
  });

  it("registrar test-seam bypasses the real registry", () => {
    __resetLensRunnerRegistryForTests();
    const calls: number[] = [];
    const result = maybeInstallRuntimeLensRunnerWithAsdb({
      env: { AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: "on" },
      register: () => {
        calls.push(1);
      },
      readerOptions: { getDbForWorkspace: () => null as never },
    });
    expect(result.installed).toBe(true);
    expect(calls).toEqual([1]);
    expect(getLensRunner("runtime")).toBeUndefined();
  });
});

// ============================================================================
// Source-scan: hard-rule boundary on adapter file
// ============================================================================

describe("Source-scan: runtime-lens-asdb-reader boundary", () => {
  it("adapter has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/runtime-lens-asdb-reader.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("composer has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/install-runtime-lens-runner-with-asdb.ts",
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

// ============================================================================
// helpers
// ============================================================================

function makeRawRun(overrides: Partial<{
  id: number;
  agentId: number;
  status: string;
  parentRunId: number | null;
  resumedFromRunId: number | null;
  compactedFromRunId: number | null;
  triggeredBy: number | null;
  summary: string | null;
  durationMs: number | null;
  errorReason: string | null;
  createdAt: Date;
}>) {
  return {
    id: overrides.id ?? 1,
    agentId: overrides.agentId ?? 10,
    status: overrides.status ?? "completed",
    parentRunId: overrides.parentRunId ?? null,
    resumedFromRunId: overrides.resumedFromRunId ?? null,
    compactedFromRunId: overrides.compactedFromRunId ?? null,
    triggeredBy: overrides.triggeredBy ?? 42,
    summary: overrides.summary ?? "ok",
    durationMs: overrides.durationMs ?? 1234,
    errorReason: overrides.errorReason ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-05-16T00:00:00Z"),
  };
}
