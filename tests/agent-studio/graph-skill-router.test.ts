/**
 * Phase 12.5 §8 — Graph Skill tRPC sub-router tests.
 *
 * Validates the thin `graphSkillRouter` wrapper around
 * `services/graph-skill/usage-query.ts`. The underlying helper is
 * unit-tested in `graph-skill-usage-query.test.ts`; this file covers
 * the router-level concerns:
 *
 *   - Input validation (Zod schema rejects bad payloads)
 *   - Service-call passthrough (router forwards args to helper)
 *   - Output shape (returned rows match the documented surface)
 *   - Error mapping (helper throws → INTERNAL_SERVER_ERROR)
 *   - 90-day cap on `sinceMs` (governance / cost guardrail)
 *   - 500-row cap on `limit` (cost guardrail)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const listUsageCountsMock = vi.fn();

vi.mock("../../server/agent-studio/services/graph-skill/public-api", () => ({
  listUsageCounts: (input: unknown) => listUsageCountsMock(input),
}));

import { graphSkillRouter } from "../../server/agent-studio/api/graph-skill-router";

function makeCaller() {
  return graphSkillRouter.createCaller({
    user: { id: 1, openId: "test-user", name: "Test", role: "admin" },
  } as any);
}

beforeEach(() => {
  listUsageCountsMock.mockReset();
});

describe("graphSkillRouter.listUsageCounts — Phase 12.5 §8", () => {
  it("forwards args verbatim to listUsageCounts() and returns mapped rows", async () => {
    const sample = {
      skillKey: "pack-a",
      packId: 1,
      packVersionId: 7,
      version: "1.0.0",
      count: 42,
      latestUsedAt: new Date("2026-05-10T18:00:00Z"),
    };
    listUsageCountsMock.mockResolvedValueOnce([sample]);

    const result = await makeCaller().listUsageCounts({
      skillKey: "pack-a",
      sinceMs: 60_000,
      limit: 10,
    });

    expect(listUsageCountsMock).toHaveBeenCalledWith({
      skillKey: "pack-a",
      sinceMs: 60_000,
      limit: 10,
    });
    expect(result.rows).toEqual([sample]);
  });

  it("forwards an empty payload as undefined args (service uses defaults)", async () => {
    listUsageCountsMock.mockResolvedValueOnce([]);
    await makeCaller().listUsageCounts({});
    expect(listUsageCountsMock).toHaveBeenCalledWith({
      skillKey: undefined,
      sinceMs: undefined,
      limit: undefined,
    });
  });

  it("returns empty rows array when service returns []", async () => {
    listUsageCountsMock.mockResolvedValueOnce([]);
    const result = await makeCaller().listUsageCounts({});
    expect(result).toEqual({ rows: [] });
  });

  it("wraps service errors as INTERNAL_SERVER_ERROR", async () => {
    listUsageCountsMock.mockRejectedValueOnce(new Error("db down"));
    await expect(makeCaller().listUsageCounts({})).rejects.toThrow(
      /graph-skill usage counts failed: db down/,
    );
  });

  it("rejects sinceMs > 90 days (cost guardrail)", async () => {
    const ninetyOneDays = 91 * 24 * 60 * 60 * 1000;
    await expect(
      makeCaller().listUsageCounts({ sinceMs: ninetyOneDays }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });

  it("accepts sinceMs at exactly 90 days", async () => {
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    listUsageCountsMock.mockResolvedValueOnce([]);
    await makeCaller().listUsageCounts({ sinceMs: ninetyDays });
    expect(listUsageCountsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sinceMs: ninetyDays }),
    );
  });

  it("rejects limit > 500 (cost guardrail)", async () => {
    await expect(
      makeCaller().listUsageCounts({ limit: 501 }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive limit (Zod schema)", async () => {
    await expect(
      makeCaller().listUsageCounts({ limit: 0 }),
    ).rejects.toThrow();
    await expect(
      makeCaller().listUsageCounts({ limit: -1 }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });

  it("rejects empty skillKey (Zod min(1))", async () => {
    await expect(
      makeCaller().listUsageCounts({ skillKey: "" }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });

  it("rejects skillKey > 100 chars (Zod max(100))", async () => {
    await expect(
      makeCaller().listUsageCounts({ skillKey: "x".repeat(101) }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });
});
