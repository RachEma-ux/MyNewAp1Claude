/**
 * Phase 14 §6/§7 — CAG runtime-usage recorder tests.
 *
 * Pure unit coverage for `recordCagBlockRuntimeUsage`. Verifies:
 *   - ASDB-null → returns false, no insert
 *   - happy path → returns true with correct row shape
 *   - insert error → swallowed, returns false (caller untouched)
 */

import { describe, it, expect, vi } from "vitest";
import { recordCagBlockRuntimeUsage } from "../../server/agent-studio/services/cag/runtime-usage";

describe("recordCagBlockRuntimeUsage — Phase 14 §6/§7", () => {
  it("returns false and does not insert when ASDB is unavailable", async () => {
    const result = await recordCagBlockRuntimeUsage(
      { runtimeRunId: 1, cagPackId: 7, packVersion: 3 },
      { getDb: () => null as never },
    );
    expect(result).toBe(false);
  });

  it("inserts a row with the expected shape and returns true", async () => {
    const values = vi.fn(async () => undefined);
    const insert = vi.fn(() => ({ values }));
    const db = { insert };
    const result = await recordCagBlockRuntimeUsage(
      { runtimeRunId: 42, cagPackId: 7, packVersion: 3 },
      { getDb: () => db as never },
    );
    expect(result).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      cagPackId: 7,
      packVersion: 3,
      runtimeRunId: 42,
    });
  });

  it("swallows insert errors and returns false (caller is never disrupted)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db = {
        insert: vi.fn(() => ({
          values: async () => {
            throw new Error("ASDB hiccup mid-insert");
          },
        })),
      };
      const result = await recordCagBlockRuntimeUsage(
        { runtimeRunId: 1, cagPackId: 1, packVersion: 1 },
        { getDb: () => db as never },
      );
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/recordCagBlockRuntimeUsage failed/),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
