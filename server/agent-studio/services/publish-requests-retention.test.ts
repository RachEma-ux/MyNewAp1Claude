import { describe, expect, it } from "vitest";

import { prunePublishRequestsRetention } from "./publish-requests-retention";

// These tests pin the fail-soft + short-circuit invariants. Behavior
// tests against a live ASDB live in the integration suite (a fresh
// ASDB is too expensive to stand up per-test).

describe("prunePublishRequestsRetention — fail-soft + short-circuit", () => {
  const RETENTION_CUTOFF = new Date("2026-04-13T00:00:00Z");

  it("returns zero-counts when ASDB is null", async () => {
    const result = await prunePublishRequestsRetention(
      { olderThan: RETENTION_CUTOFF },
      { getDb: () => null as unknown as ReturnType<typeof import("../db/connection").getAsDb> },
    );
    expect(result.deletedCount).toBe(0);
    expect(result.preservedCount).toBe(0);
    expect(result.blockerCounts).toEqual({});
  });

  it("short-circuits BEFORE the ASDB probe on empty agentId array", async () => {
    let dbProbed = false;
    const result = await prunePublishRequestsRetention(
      { olderThan: RETENTION_CUTOFF, agentId: [] },
      {
        getDb: () => {
          dbProbed = true;
          return null as unknown as ReturnType<typeof import("../db/connection").getAsDb>;
        },
      },
    );
    expect(result.deletedCount).toBe(0);
    expect(dbProbed).toBe(false);
  });

  it("scalar agentId reaches the ASDB probe (does not short-circuit)", async () => {
    let dbProbed = false;
    await prunePublishRequestsRetention(
      { olderThan: RETENTION_CUTOFF, agentId: 1 },
      {
        getDb: () => {
          dbProbed = true;
          return null as unknown as ReturnType<typeof import("../db/connection").getAsDb>;
        },
      },
    );
    expect(dbProbed).toBe(true);
  });

  it("non-empty agentId array reaches the ASDB probe", async () => {
    let dbProbed = false;
    await prunePublishRequestsRetention(
      { olderThan: RETENTION_CUTOFF, agentId: [1, 2] },
      {
        getDb: () => {
          dbProbed = true;
          return null as unknown as ReturnType<typeof import("../db/connection").getAsDb>;
        },
      },
    );
    expect(dbProbed).toBe(true);
  });
});
