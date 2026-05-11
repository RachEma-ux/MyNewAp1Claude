/**
 * Phase 14 §3 — runtime-trace retention service tests.
 *
 * Covers `pruneRuntimeTraces()` from
 * `services/graph-agent/retention.ts`. Drizzle fake stores deletion
 * results by table-id sentinel so the test can assert which table
 * was pruned without trying to decode the `lt(...)` predicate.
 */

import { describe, it, expect, vi } from "vitest";
import { pruneRuntimeTraces } from "../../server/agent-studio/services/graph-agent/retention";

interface FakeState {
  /** Each delete call records its table tag + returns the configured
   *  array (one item per "deleted row"). */
  deletes: string[];
  returnsByTable: Record<string, Array<{ id: number }>>;
}

function makeFakeDb(initial: FakeState["returnsByTable"]) {
  const state: FakeState = {
    deletes: [],
    returnsByTable: initial,
  };

  // Drizzle table objects carry the SQL name on a symbol-keyed
  // property (`Symbol("drizzle:Name")`). Read it directly so the
  // fake can route by table name.
  function tableName(table: unknown): string {
    const sym = Object.getOwnPropertySymbols(table as object).find(
      (s) => s.description === "drizzle:Name",
    );
    return sym ? String((table as Record<symbol, unknown>)[sym]) : "?";
  }

  const deleteFn = vi.fn((table: unknown) => {
    const name = tableName(table);
    state.deletes.push(name);
    return {
      where: () => ({
        returning: async () => state.returnsByTable[name] ?? [],
      }),
    };
  });

  return { db: { delete: deleteFn }, state };
}

const NOW = new Date("2026-05-11T12:00:00Z").getTime();

describe("pruneRuntimeTraces — Phase 14 §3", () => {
  it("returns an empty summary when ASDB is unavailable", async () => {
    const result = await pruneRuntimeTraces({
      getDb: () => null as never,
      nowMs: NOW,
    });
    expect(result.graphSkillRuntimeUsages).toBe(0);
    expect(result.queryTemplateRuns).toBe(0);
    expect(result.graphAgentSteps).toBe(0);
    expect(result.graphAgentRuns).toBe(0);
    expect(result.cutoff).toBeInstanceOf(Date);
  });

  it("computes cutoff = now - horizon (default 90 days)", async () => {
    const result = await pruneRuntimeTraces({
      getDb: () => null as never,
      nowMs: NOW,
    });
    const expected = NOW - 90 * 24 * 60 * 60 * 1000;
    expect(result.cutoff.getTime()).toBe(expected);
  });

  it("respects caller-supplied olderThanMs", async () => {
    const result = await pruneRuntimeTraces({
      getDb: () => null as never,
      nowMs: NOW,
      olderThanMs: 60_000,
    });
    expect(result.cutoff.getTime()).toBe(NOW - 60_000);
  });

  it("clamps olderThanMs below the 60s floor", async () => {
    const result = await pruneRuntimeTraces({
      getDb: () => null as never,
      nowMs: NOW,
      olderThanMs: 1, // unreasonably small
    });
    // Floor is 60_000ms (MIN_HORIZON_MS).
    expect(result.cutoff.getTime()).toBe(NOW - 60_000);
  });

  it("counts deleted rows per table", async () => {
    const { db, state } = makeFakeDb({
      ags_graph_skill_runtime_usages: [{ id: 1 }, { id: 2 }, { id: 3 }],
      ags_query_template_runs: [{ id: 10 }],
      ags_graph_agent_steps: [{ id: 100 }, { id: 101 }],
      ags_graph_agent_runs: [{ id: 200 }],
    });
    const result = await pruneRuntimeTraces({
      getDb: () => db as never,
      nowMs: NOW,
    });
    expect(result.graphSkillRuntimeUsages).toBe(3);
    expect(result.queryTemplateRuns).toBe(1);
    expect(result.graphAgentSteps).toBe(2);
    expect(result.graphAgentRuns).toBe(1);
    // Step deletion MUST happen before run deletion (FK constraint).
    const stepIdx = state.deletes.indexOf("ags_graph_agent_steps");
    const runIdx = state.deletes.indexOf("ags_graph_agent_runs");
    expect(stepIdx).toBeGreaterThanOrEqual(0);
    expect(runIdx).toBeGreaterThan(stepIdx);
  });

  it("returns zero counts when nothing matches the cutoff", async () => {
    const { db } = makeFakeDb({});
    const result = await pruneRuntimeTraces({
      getDb: () => db as never,
      nowMs: NOW,
    });
    expect(result.graphSkillRuntimeUsages).toBe(0);
    expect(result.queryTemplateRuns).toBe(0);
    expect(result.graphAgentSteps).toBe(0);
    expect(result.graphAgentRuns).toBe(0);
  });

  it("attempts deletion on all four tables exactly once per call", async () => {
    const { db, state } = makeFakeDb({});
    await pruneRuntimeTraces({ getDb: () => db as never, nowMs: NOW });
    // 4 distinct tables pruned in one call.
    expect(state.deletes).toHaveLength(4);
    expect(new Set(state.deletes).size).toBe(4);
  });
});
