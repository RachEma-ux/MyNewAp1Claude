// listActiveHolds — fail-soft contract unit tests.
//
// The integration test at PR #703 exercises this against a live DB.
// These unit tests cover the fail-soft branches that don't surface in
// the integration suite:
//
//   - ASDB unavailable (getDb returns null) → empty array
//   - Query throws → empty array (caller treats "couldn't check" as
//     "no hold," but the surrounding eligibility chain has its own
//     non-hold blockers that prevent unsafe deletion)
//   - Query succeeds → rows passed through unchanged
//
// Method: dependency-injected `getDb` returns a stub that records the
// chained .select().from().where() invocations. The drizzle types are
// loose enough to fake without pulling in the real adapter.

import { describe, expect, it } from "vitest";

import { listActiveHolds } from "./lifecycle-holds-query";

const ENTITY = { entityType: "ags_publish_requests", entityId: 42 } as const;

function dbStub(rowsOrThrow: unknown[] | Error) {
  // Records each method called on the chain so the assertion can
  // verify the SQL builder receives the expected sequence.
  const calls: string[] = [];
  const chain: any = {
    select: (_: unknown) => {
      calls.push("select");
      return chain;
    },
    from: (_: unknown) => {
      calls.push("from");
      return chain;
    },
    where: (_: unknown) => {
      calls.push("where");
      if (rowsOrThrow instanceof Error) {
        return Promise.reject(rowsOrThrow);
      }
      return Promise.resolve(rowsOrThrow);
    },
  };
  return { db: chain, calls };
}

describe("listActiveHolds — fail-soft on ASDB null", () => {
  it("returns empty array when getDb returns null", async () => {
    const result = await listActiveHolds(ENTITY, { getDb: () => null as any });
    expect(result).toEqual([]);
  });

  it("returns empty array when getDb returns undefined", async () => {
    const result = await listActiveHolds(ENTITY, {
      getDb: () => undefined as any,
    });
    expect(result).toEqual([]);
  });
});

describe("listActiveHolds — fail-soft on query error", () => {
  it("returns empty array when the query throws", async () => {
    const { db } = dbStub(new Error("ASDB unreachable"));
    const result = await listActiveHolds(ENTITY, { getDb: () => db });
    expect(result).toEqual([]);
  });

  it("never re-throws the underlying error (caller observes empty array, not exception)", async () => {
    const { db } = dbStub(new Error("connection reset"));
    let threw = false;
    try {
      await listActiveHolds(ENTITY, { getDb: () => db });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

describe("listActiveHolds — happy path", () => {
  it("passes through rows when the query resolves", async () => {
    const rows = [
      {
        id: 1,
        holdType: "legal_hold",
        reason: "audit-2026-Q1",
        setBy: 99,
        setAt: new Date("2026-05-01T00:00:00Z"),
        holdUntil: null,
      },
    ];
    const { db, calls } = dbStub(rows);
    const result = await listActiveHolds(ENTITY, { getDb: () => db });
    expect(result).toEqual(rows);
    // Should have walked the select → from → where chain
    expect(calls).toEqual(["select", "from", "where"]);
  });

  it("returns empty array when DB has no matching rows", async () => {
    const { db } = dbStub([]);
    const result = await listActiveHolds(ENTITY, { getDb: () => db });
    expect(result).toEqual([]);
  });

  it("returns multiple holds when multiple active for an entity", async () => {
    const rows = [
      {
        id: 1,
        holdType: "legal_hold",
        reason: null,
        setBy: null,
        setAt: new Date(),
        holdUntil: null,
      },
      {
        id: 2,
        holdType: "audit_hold",
        reason: "investigation-pending",
        setBy: 42,
        setAt: new Date(),
        holdUntil: new Date(Date.now() + 86_400_000),
      },
    ];
    const { db } = dbStub(rows);
    const result = await listActiveHolds(ENTITY, { getDb: () => db });
    expect(result).toHaveLength(2);
    expect(result[0].holdType).toBe("legal_hold");
    expect(result[1].holdType).toBe("audit_hold");
  });
});

describe("listActiveHolds — options.now propagation", () => {
  it("accepts an injected `now` (used by the gt(holdUntil, now) predicate)", async () => {
    // Since the stub doesn't introspect the WHERE clause, this test
    // only locks that no exception fires when `now` is passed.
    // Real SQL semantics are exercised by the integration test (#703).
    const { db } = dbStub([]);
    const result = await listActiveHolds(ENTITY, {
      getDb: () => db,
      now: new Date("2026-05-13T12:00:00Z"),
    });
    expect(result).toEqual([]);
  });
});
