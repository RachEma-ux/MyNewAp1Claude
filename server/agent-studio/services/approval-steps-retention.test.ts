import { describe, expect, it } from "vitest";

import { pruneApprovalStepsRetention } from "./approval-steps-retention";

describe("pruneApprovalStepsRetention — fail-soft + short-circuit", () => {
  const RETENTION_CUTOFF = new Date("2026-04-13T00:00:00Z");

  it("returns zero-counts when ASDB is null", async () => {
    const result = await pruneApprovalStepsRetention(
      { olderThan: RETENTION_CUTOFF },
      { getDb: () => null as unknown as ReturnType<typeof import("../db/connection").getAsDb> },
    );
    expect(result.deletedCount).toBe(0);
    expect(result.preservedCount).toBe(0);
    expect(result.blockerCounts).toEqual({});
  });

  it("short-circuits BEFORE the ASDB probe on empty publishRequestId array", async () => {
    let dbProbed = false;
    const result = await pruneApprovalStepsRetention(
      { olderThan: RETENTION_CUTOFF, publishRequestId: [] },
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

  it("scalar publishRequestId reaches the ASDB probe", async () => {
    let dbProbed = false;
    await pruneApprovalStepsRetention(
      { olderThan: RETENTION_CUTOFF, publishRequestId: 1 },
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
