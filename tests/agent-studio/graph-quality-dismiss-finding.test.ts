/**
 * Phase 23 §1 — operator-marked finding dismissal.
 */

import { describe, it, expect, vi } from "vitest";
import {
  dismissFinding,
  AsdbUnavailableError,
  FindingNotFoundError,
  FindingAlreadyResolvedError,
} from "../../server/agent-studio/services/graph-quality/dismiss-finding";

interface SeededFinding {
  id: number;
  status: string;
  details: Record<string, unknown> | null;
}

function makeFakeDb(rows: SeededFinding[]) {
  const state = {
    findings: rows,
    updates: [] as { id: number; patch: Record<string, unknown> }[],
  };

  const tableName = (t: unknown): string => {
    const sym = Object.getOwnPropertySymbols(t as object).find(
      (s) => s.description === "drizzle:Name",
    );
    return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
  };

  const select = vi.fn(() => ({
    from: (_t: unknown) => ({
      where: (_w: unknown) => ({
        limit: async (_n: number) => state.findings,
      }),
    }),
  }));

  const update = vi.fn((t: unknown) => {
    expect(tableName(t)).toBe("ags_graph_quality_findings");
    return {
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ id: state.findings[0]?.id ?? 0, patch });
        },
      }),
    };
  });

  return { db: { select, update }, state };
}

describe("dismissFinding", () => {
  it("throws AsdbUnavailableError when ASDB is null", async () => {
    await expect(
      dismissFinding({ findingId: 1 }, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("throws FindingNotFoundError when finding id is unknown", async () => {
    const { db } = makeFakeDb([]);
    await expect(
      dismissFinding({ findingId: 99 }, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(FindingNotFoundError);
  });

  it("flips status to dismissed + stamps details for an open finding", async () => {
    const { db, state } = makeFakeDb([
      { id: 5, status: "open", details: { sampleTruncated: false } },
    ]);
    const result = await dismissFinding(
      { findingId: 5, reason: "false positive", dismissedByUserId: 1 },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ findingId: 5, priorStatus: "open" });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch.status).toBe("dismissed");
    const newDetails = state.updates[0].patch.details as Record<string, unknown>;
    expect(newDetails.dismissedReason).toBe("false positive");
    expect(newDetails.dismissedByUserId).toBe(1);
    expect(newDetails.priorStatus).toBe("open");
    expect(typeof newDetails.dismissedAt).toBe("string");
    expect(newDetails.sampleTruncated).toBe(false); // preserved
  });

  it("flips status to dismissed for a triaged finding (proposal-in-flight is fine)", async () => {
    const { db, state } = makeFakeDb([
      { id: 6, status: "triaged", details: null },
    ]);
    await dismissFinding(
      { findingId: 6 },
      { getDb: () => db as never },
    );
    expect(state.updates[0].patch.status).toBe("dismissed");
  });

  it("rejects dismissal of an already-dismissed finding", async () => {
    const { db } = makeFakeDb([
      { id: 7, status: "dismissed", details: null },
    ]);
    await expect(
      dismissFinding({ findingId: 7 }, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(FindingAlreadyResolvedError);
  });

  it("rejects dismissal of an applied finding (terminal state)", async () => {
    const { db } = makeFakeDb([
      { id: 8, status: "applied", details: null },
    ]);
    await expect(
      dismissFinding({ findingId: 8 }, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(FindingAlreadyResolvedError);
  });

  it("handles null reason + null user id gracefully", async () => {
    const { db, state } = makeFakeDb([
      { id: 10, status: "open", details: null },
    ]);
    await dismissFinding(
      { findingId: 10 },
      { getDb: () => db as never },
    );
    const patch = state.updates[0].patch.details as Record<string, unknown>;
    expect(patch.dismissedReason).toBeNull();
    expect(patch.dismissedByUserId).toBeNull();
  });
});
