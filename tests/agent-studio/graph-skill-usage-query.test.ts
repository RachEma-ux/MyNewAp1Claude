/**
 * Phase 12.5 §7 — Graph Skill Pack usage-count read helper tests.
 *
 * Verifies `listUsageCounts()` from
 * `server/agent-studio/services/graph-skill/usage-query.ts` — the
 * read side of the runtime-usage chain. The recorder (§4/§5) writes
 * `ags_graph_skill_runtime_usages` rows; this helper aggregates them
 * for admin-UI consumption.
 *
 * Tests use the injectable `getDb` option to swap a fake DB shaped
 * like drizzle's query builder. Same "active-key" / "rows-by-key"
 * side-channel pattern as §5's `runtime-usage` tests.
 */

import { describe, it, expect, vi } from "vitest";
import { listUsageCounts } from "../../server/agent-studio/services/graph-skill/usage-query";

type SelectChain = {
  from: () => SelectChain;
  innerJoin: () => SelectChain;
  where: (cond: unknown) => SelectChain;
  groupBy: () => SelectChain;
  orderBy: () => SelectChain;
  limit: (n: number) => Promise<Array<Record<string, unknown>>>;
};

interface FakeDb {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
}

interface FakeDbState {
  db: FakeDb;
  capturedWhere: unknown;
  capturedLimit: number | undefined;
}

function makeFakeDb(rows: Array<Record<string, unknown>>): FakeDbState {
  const state: FakeDbState = {
    db: { select: vi.fn(), insert: vi.fn() },
    capturedWhere: undefined,
    capturedLimit: undefined,
  };

  state.db.select = vi.fn(() => {
    const chain: SelectChain = {
      from: () => chain,
      innerJoin: () => chain,
      where: (cond) => {
        state.capturedWhere = cond;
        return chain;
      },
      groupBy: () => chain,
      orderBy: () => chain,
      limit: async (n) => {
        state.capturedLimit = n;
        return rows;
      },
    };
    return chain;
  });

  return state;
}

const NOW = new Date("2026-05-11T12:00:00Z").getTime();

describe("listUsageCounts — Phase 12.5 §7", () => {
  it("returns an empty list when ASDB is unavailable", async () => {
    const result = await listUsageCounts({}, { getDb: () => null as never });
    expect(result).toEqual([]);
  });

  it("returns an empty list when there are no usage rows in window", async () => {
    const { db } = makeFakeDb([]);
    const result = await listUsageCounts(
      {},
      { getDb: () => db as never, nowMs: NOW },
    );
    expect(result).toEqual([]);
  });

  it("maps result rows to UsageCount shape (count → number, Date for latestUsedAt)", async () => {
    const { db } = makeFakeDb([
      {
        skillKey: "pack-a",
        packId: 1,
        packVersionId: 7,
        version: "1.0.0",
        count: "42", // drizzle's count() returns bigint-as-string on pg
        latestUsedAt: "2026-05-10T18:00:00Z",
      },
      {
        skillKey: "pack-b",
        packId: 2,
        packVersionId: 11,
        version: "0.9.3",
        count: 5,
        latestUsedAt: null,
      },
    ]);
    const result = await listUsageCounts(
      {},
      { getDb: () => db as never, nowMs: NOW },
    );
    expect(result).toEqual([
      {
        skillKey: "pack-a",
        packId: 1,
        packVersionId: 7,
        version: "1.0.0",
        count: 42,
        latestUsedAt: new Date("2026-05-10T18:00:00Z"),
      },
      {
        skillKey: "pack-b",
        packId: 2,
        packVersionId: 11,
        version: "0.9.3",
        count: 5,
        latestUsedAt: null,
      },
    ]);
  });

  it("honors a caller-supplied limit", async () => {
    const state = makeFakeDb([]);
    await listUsageCounts(
      { limit: 5 },
      {
        getDb: () => state.db as never,
        nowMs: NOW,
      },
    );
    expect(state.capturedLimit).toBe(5);
  });

  it("uses the default limit (100) when none specified", async () => {
    const state = makeFakeDb([]);
    await listUsageCounts(
      {},
      {
        getDb: () => state.db as never,
        nowMs: NOW,
      },
    );
    expect(state.capturedLimit).toBe(100);
  });

  it("captures a WHERE condition (since-window + optional skillKey filter)", async () => {
    const state = makeFakeDb([]);
    await listUsageCounts(
      { skillKey: "pack-a", sinceMs: 60_000 },
      {
        getDb: () => state.db as never,
        nowMs: NOW,
      },
    );
    // The condition is opaque (drizzle's `and(eq(...), gte(...))`),
    // but the recorder must have called .where() once. Coverage check
    // is "captured something" not "decoded condition" — drizzle fakes
    // can't peer inside without a parser. The since/skillKey behavior
    // is validated end-to-end at the integration layer.
    expect(state.capturedWhere).toBeDefined();
  });

  it("returns rows verbatim when skillKey filter is omitted", async () => {
    const { db } = makeFakeDb([
      {
        skillKey: "pack-a",
        packId: 1,
        packVersionId: 7,
        version: "1.0.0",
        count: 3,
        latestUsedAt: "2026-05-10T10:00:00Z",
      },
    ]);
    const result = await listUsageCounts(
      { sinceMs: 60_000 },
      { getDb: () => db as never, nowMs: NOW },
    );
    expect(result).toHaveLength(1);
    expect(result[0].skillKey).toBe("pack-a");
    expect(result[0].count).toBe(3);
  });

  it("coerces drizzle's bigint-as-string count to a JS number", async () => {
    const { db } = makeFakeDb([
      {
        skillKey: "pack-a",
        packId: 1,
        packVersionId: 7,
        version: "1.0.0",
        count: "1000000",
        latestUsedAt: "2026-05-10T10:00:00Z",
      },
    ]);
    const [row] = await listUsageCounts(
      {},
      { getDb: () => db as never, nowMs: NOW },
    );
    expect(row.count).toBe(1_000_000);
    expect(typeof row.count).toBe("number");
  });
});
