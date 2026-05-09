/**
 * H4-c7 + M3-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H4-c7, §M3-c7) — patchRacRuntimeTrace partial-update SQL semantics.
 *
 * Pre-cycle-7 buildRacTracePatch normalized every missing field to
 * `null` and patchRacRuntimeTrace called Drizzle's `.set()` with all
 * 3 fields. Drizzle's `.set({foo: null})` writes literal SQL NULL,
 * indistinguishable from `.set({foo: value})` — a partial caller's
 * patch could overwrite an earlier caller's planner fields with NULL.
 *
 * Post-cycle-7 the writer:
 *   1. Builds a patch containing ONLY the keys the caller provided
 *   2. Skips the UPDATE entirely when no keys were provided (avoids
 *      a SQL syntax error on empty SET + a wasted round-trip)
 *   3. Spreads the partial patch into Drizzle's `.set()` so the
 *      generated SQL targets only those columns
 *
 * This file pins the SQL-side behavior under unit-test conditions
 * via `vi.mock` on the connection module + a programmable fake-db.
 * The behavioral integration test (which exercises real Postgres
 * UPDATE semantics) lives in
 * `tests/integration/agent-studio/trace-writer.integration.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
}));

vi.mock("../../server/agent-studio/db/connection", () => ({
  getAsDb: () => mocks.db,
}));

import { patchRacRuntimeTrace } from "../../server/agent-studio/services/runtime/trace-writer";
import { agsRacRuntimeTraces } from "../../drizzle/tables/agent-studio";

interface RecordedUpdate {
  table: unknown;
  set: unknown;
  whereCalled: boolean;
}

function createFakeDb() {
  const updates: RecordedUpdate[] = [];
  const db: any = {
    updates,
    update: (table: unknown) => ({
      set: (set: unknown) => {
        const rec: RecordedUpdate = { table, set, whereCalled: false };
        updates.push(rec);
        return {
          where: () => {
            rec.whereCalled = true;
            return Promise.resolve();
          },
        };
      },
    }),
  };
  return db;
}

describe("M3-c7 + H4-c7 — patchRacRuntimeTrace SQL UPDATE shape", () => {
  beforeEach(() => {
    mocks.db = createFakeDb();
    vi.clearAllMocks();
  });

  it("calls .update() with agsRacRuntimeTraces table when keys provided", async () => {
    await patchRacRuntimeTrace(123, { plannerMode: "hybrid_cag_rag" });
    expect(mocks.db.updates.length).toBe(1);
    expect(mocks.db.updates[0].table).toBe(agsRacRuntimeTraces);
    expect(mocks.db.updates[0].whereCalled).toBe(true);
  });

  it("H4-c7: SET clause contains ONLY the provided keys (no null normalization)", async () => {
    // The race-fix invariant. If the writer sent all 3 keys, the
    // missing 2 would be `null` in the SET — overwriting any prior
    // values. The fix makes the SET contain only what the caller
    // explicitly asked for.
    await patchRacRuntimeTrace(123, { plannerReason: "fresh" });
    expect(mocks.db.updates.length).toBe(1);
    expect(mocks.db.updates[0].set).toEqual({ plannerReason: "fresh" });
    expect("plannerMode" in (mocks.db.updates[0].set as object)).toBe(false);
    expect("cagCompiledHash" in (mocks.db.updates[0].set as object)).toBe(false);
  });

  it("H4-c7: explicit null IS sent in SET (means 'clear this column')", async () => {
    // The explicit-null case — caller wants to wipe a previously-set
    // planner field. Distinct from "key absent" (leave alone).
    await patchRacRuntimeTrace(123, { plannerMode: null });
    expect(mocks.db.updates[0].set).toEqual({ plannerMode: null });
  });

  it("H4-c7: empty patch SHORT-CIRCUITS — no UPDATE issued at all", async () => {
    // An UPDATE with empty SET is a SQL syntax error AND a wasted
    // round-trip. The writer must skip the call entirely.
    await patchRacRuntimeTrace(123, {});
    expect(
      mocks.db.updates.length,
      "H4-c7 violated: patchRacRuntimeTrace must short-circuit when " +
        "the caller provided no keys to update. An UPDATE with empty " +
        "SET is a SQL syntax error in Postgres.",
    ).toBe(0);
  });

  it("H4-c7: all 3 fields provided → all 3 in SET", async () => {
    await patchRacRuntimeTrace(123, {
      plannerMode: "x",
      plannerReason: "y",
      cagCompiledHash: "f".repeat(64),
    });
    expect(mocks.db.updates[0].set).toEqual({
      plannerMode: "x",
      plannerReason: "y",
      cagCompiledHash: "f".repeat(64),
    });
  });

  it("H4-c7: race scenario — second caller's patch does NOT clobber first caller's mode", async () => {
    // The forensic story: caller A sets plannerMode + plannerReason
    // first; caller B then patches just plannerReason. Pre-cycle-7
    // B would have sent `{plannerMode: NULL, plannerReason: "B",
    // cagCompiledHash: NULL}` and wiped A's mode + hash. Post-fix
    // B sends only `{plannerReason: "B"}`.
    await patchRacRuntimeTrace(99, {
      plannerMode: "hybrid_cag_rag",
      plannerReason: "A wrote",
      cagCompiledHash: "a".repeat(64),
    });
    // Reset for B's call (using a fresh fake db for clarity)
    mocks.db = createFakeDb();
    await patchRacRuntimeTrace(99, { plannerReason: "B updated" });
    expect(mocks.db.updates.length).toBe(1);
    expect(mocks.db.updates[0].set).toEqual({ plannerReason: "B updated" });
    // Critical: plannerMode + cagCompiledHash are NOT in the SET, so
    // Postgres leaves them at A's values.
    expect("plannerMode" in (mocks.db.updates[0].set as object)).toBe(false);
    expect("cagCompiledHash" in (mocks.db.updates[0].set as object)).toBe(false);
  });
});
