/**
 * Phase 22 — Workspace observability: background jobs service tests.
 *
 * Covers `services/workspace-observability/background-jobs.ts`.
 * Uses the active-key fake-DB pattern.
 */

import { describe, it, expect, vi } from "vitest";
import {
  enqueueJob,
  getJobById,
  listJobs,
  markJobStarted,
  markJobCompleted,
  markJobFailed,
  markJobCancelled,
  retryJob,
  pruneOldBackgroundJobs,
  AsdbUnavailableError,
  JobNotFoundError,
  JobNotRetryableError,
} from "../../server/agent-studio/services/workspace-observability/background-jobs";

interface FakeRow {
  id: number;
  jobKind: string;
  payload: Record<string, unknown> | null;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeState {
  rows: FakeRow[];
  nextId: number;
  selectQueue: Array<"byId" | "list">;
  active: {
    jobId?: number;
    status?: string;
    jobKind?: string;
    createdSince?: Date;
    updatedSince?: Date;
  };
}

function makeFakeDb(initial?: Partial<FakeState>) {
  const state: FakeState = {
    rows: initial?.rows ?? [],
    nextId: initial?.nextId ?? 1000,
    selectQueue: [],
    active: {},
  };

  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => {
        const op = state.selectQueue.shift();
        if (op === "list") {
          let rows = state.rows;
          if (state.active.status !== undefined) {
            rows = rows.filter((r) => r.status === state.active.status);
          }
          if (state.active.jobKind !== undefined) {
            rows = rows.filter((r) => r.jobKind === state.active.jobKind);
          }
          if (state.active.createdSince !== undefined) {
            const cutoff = state.active.createdSince.getTime();
            rows = rows.filter((r) => r.createdAt.getTime() >= cutoff);
          }
          if (state.active.updatedSince !== undefined) {
            const cutoff = state.active.updatedSince.getTime();
            rows = rows.filter((r) => r.updatedAt.getTime() >= cutoff);
          }
          return {
            limit: async () =>
              rows.sort(
                (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
              ),
          };
        }
        return chain;
      },
      limit: async () => {
        const op = state.selectQueue.shift();
        if (op === "byId") {
          const found = state.rows.find((r) => r.id === state.active.jobId);
          return found ? [found] : [];
        }
        return [];
      },
    };
    return chain;
  });

  function tableName(t: unknown): string {
    if (!t) return "?";
    const sym = Object.getOwnPropertySymbols(t).find(
      (s) => s.description === "drizzle:Name",
    );
    if (sym) return String((t as Record<symbol, unknown>)[sym] ?? "?");
    return "?";
  }

  const insert = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          if (name !== "ags_workspace_background_jobs") return [];
          const now = new Date();
          const id = state.nextId++;
          const row: FakeRow = {
            id,
            jobKind: String(vals.jobKind),
            payload:
              (vals.payload as Record<string, unknown> | null | undefined) ??
              null,
            status: String(vals.status ?? "pending"),
            attempts: Number(vals.attempts ?? 0),
            lastError: vals.lastError == null ? null : String(vals.lastError),
            createdAt: now,
            updatedAt: (vals.updatedAt as Date) ?? now,
          };
          state.rows.push(row);
          return [row];
        },
      }),
    };
  });

  const update = vi.fn((_table: unknown) => ({
    set: (vals: Record<string, unknown>) => ({
      where: async () => {
        const id = state.active.jobId;
        if (id == null) return;
        const target = state.rows.find((r) => r.id === id);
        if (!target) return;
        if ("status" in vals) target.status = String(vals.status);
        if ("attempts" in vals) target.attempts = Number(vals.attempts);
        if ("lastError" in vals) {
          target.lastError = vals.lastError == null ? null : String(vals.lastError);
        }
        if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
      },
    }),
  }));

  const db = { select, insert, update } as unknown;
  return { db, state };
}

describe("enqueueJob — Phase 22", () => {
  it("throws AsdbUnavailableError on null DB", async () => {
    await expect(
      enqueueJob({ jobKind: "x" }, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("inserts a pending job with attempts=0", async () => {
    const { db, state } = makeFakeDb();
    const job = await enqueueJob(
      { jobKind: "projection.rebuild", payload: { vaultId: 1 } },
      { getDb: () => db as never },
    );
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(0);
    expect(job.jobKind).toBe("projection.rebuild");
    expect(state.rows.length).toBe(1);
  });
});

describe("getJobById — Phase 22", () => {
  it("returns null when ASDB-unavailable", async () => {
    const result = await getJobById(7, { getDb: () => null as never });
    expect(result).toBeNull();
  });

  it("returns the row when found", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "pending",
          attempts: 0,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.jobId = 7;
    const result = await getJobById(7, { getDb: () => db as never });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(7);
  });
});

describe("listJobs — Phase 22", () => {
  it("returns [] on ASDB-null", async () => {
    const result = await listJobs({}, { getDb: () => null as never });
    expect(result).toEqual([]);
  });

  it("filters by createdSince when supplied", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-05-12T00:00:00Z");
    const cutoff = new Date("2026-04-01T00:00:00Z");
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 1,
          jobKind: "x",
          payload: null,
          status: "completed",
          attempts: 0,
          lastError: null,
          createdAt: old,
          updatedAt: old,
        },
        {
          id: 2,
          jobKind: "x",
          payload: null,
          status: "completed",
          attempts: 0,
          lastError: null,
          createdAt: recent,
          updatedAt: recent,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.createdSince = cutoff;
    const result = await listJobs(
      { createdSince: cutoff },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(2);
  });

  it("filters by updatedSince when supplied", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const justUpdated = new Date("2026-05-12T00:00:00Z");
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 1,
          jobKind: "x",
          payload: null,
          status: "running",
          attempts: 1,
          lastError: null,
          createdAt: old,
          updatedAt: old,
        },
        {
          id: 2,
          jobKind: "x",
          payload: null,
          status: "running",
          attempts: 5,
          lastError: null,
          createdAt: old,
          updatedAt: justUpdated,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.updatedSince = new Date("2026-05-01T00:00:00Z");
    const result = await listJobs(
      { updatedSince: new Date("2026-05-01T00:00:00Z") },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(2);
  });

  it("combines createdSince + status filter (AND semantics)", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-05-12T00:00:00Z");
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 1,
          jobKind: "x",
          payload: null,
          status: "failed",
          attempts: 2,
          lastError: "boom",
          createdAt: old,
          updatedAt: old,
        },
        {
          id: 2,
          jobKind: "x",
          payload: null,
          status: "failed",
          attempts: 1,
          lastError: "fresh boom",
          createdAt: recent,
          updatedAt: recent,
        },
        {
          id: 3,
          jobKind: "x",
          payload: null,
          status: "completed",
          attempts: 1,
          lastError: null,
          createdAt: recent,
          updatedAt: recent,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.status = "failed";
    state.active.createdSince = new Date("2026-04-01T00:00:00Z");
    const result = await listJobs(
      { status: "failed", createdSince: new Date("2026-04-01T00:00:00Z") },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(2);
  });

  it("filters by status when supplied", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 1,
          jobKind: "x",
          payload: null,
          status: "pending",
          attempts: 0,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 2,
          jobKind: "x",
          payload: null,
          status: "running",
          attempts: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.status = "running";
    const result = await listJobs(
      { status: "running" },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(2);
  });
});

describe("state transitions — Phase 22", () => {
  it("markJobStarted bumps attempts + flips to running", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "pending",
          attempts: 0,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId", "byId");
    state.active.jobId = 7;
    const result = await markJobStarted(7, { getDb: () => db as never });
    expect(result.status).toBe("running");
    expect(result.attempts).toBe(1);
  });

  it("markJobCompleted clears lastError + flips to completed", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "running",
          attempts: 2,
          lastError: "previous boom",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.jobId = 7;
    const result = await markJobCompleted(7, { getDb: () => db as never });
    expect(result.status).toBe("completed");
    expect(result.lastError).toBeNull();
  });

  it("markJobFailed also records an error_event row (Phase 22 #517 bridge)", async () => {
    const now = new Date();
    const errorEventRows: Record<string, unknown>[] = [];

    function tableName(t: unknown): string {
      if (!t) return "?";
      const sym = Object.getOwnPropertySymbols(t as object).find(
        (s) => s.description === "drizzle:Name",
      );
      return sym ? String((t as Record<symbol, unknown>)[sym] ?? "?") : "?";
    }

    const jobRow: FakeRow = {
      id: 99,
      jobKind: "projection_sync",
      payload: { source: "x" },
      status: "running",
      attempts: 1,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };

    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [jobRow],
            orderBy: () => ({ limit: async () => [jobRow] }),
          }),
        }),
      })),
      update: vi.fn(() => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            if ("status" in vals) jobRow.status = String(vals.status);
            if ("lastError" in vals)
              jobRow.lastError = vals.lastError == null ? null : String(vals.lastError);
          },
        }),
      })),
      insert: vi.fn((table: unknown) => ({
        values: (vals: Record<string, unknown>) => {
          if (tableName(table) === "ags_workspace_error_events") {
            errorEventRows.push(vals);
          }
          return {
            returning: async () => [{ id: 99999, ...vals, createdAt: new Date() }],
            then: (resolve: (v: void) => unknown) => resolve(undefined),
          };
        },
      })),
    };

    const result = await markJobFailed(99, "model crashed", {
      getDb: () => db as never,
    });

    expect(result.status).toBe("failed");
    expect(result.lastError).toBe("model crashed");

    // Give the void-prefixed bridge a chance to flush.
    await new Promise((r) => setImmediate(r));

    expect(errorEventRows).toHaveLength(1);
    expect(errorEventRows[0]).toMatchObject({
      sourceKind: "backgroundJob.projection_sync",
      sourceId: "99",
      errorClass: "BackgroundJobFailed",
      errorMessage: "model crashed",
    });
    expect(
      (errorEventRows[0].metadata as Record<string, unknown>).jobId,
    ).toBe(99);
  });

  it("markJobFailed sets lastError", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "running",
          attempts: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.jobId = 7;
    const result = await markJobFailed(7, "model boom", {
      getDb: () => db as never,
    });
    expect(result.status).toBe("failed");
    expect(result.lastError).toBe("model boom");
  });

  it("markJobCancelled flips to cancelled", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "pending",
          attempts: 0,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.jobId = 7;
    const result = await markJobCancelled(7, { getDb: () => db as never });
    expect(result.status).toBe("cancelled");
  });

  it("retryJob flips a failed job back to pending + clears lastError, attempts unchanged", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "failed",
          attempts: 3,
          lastError: "boom",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId", "byId");
    state.active.jobId = 7;
    const result = await retryJob(7, { getDb: () => db as never });
    expect(result.status).toBe("pending");
    expect(result.lastError).toBeNull();
    // attempts is preserved by retryJob; markJobStarted bumps it on next pickup.
    expect(result.attempts).toBe(3);
  });

  it("retryJob throws JobNotFoundError when row is missing", async () => {
    const { db, state } = makeFakeDb({});
    state.selectQueue.push("byId");
    state.active.jobId = 999;
    await expect(
      retryJob(999, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("retryJob refuses to retry a non-failed job (running)", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "running",
          attempts: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.jobId = 7;
    await expect(
      retryJob(7, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(JobNotRetryableError);
  });

  it("retryJob refuses to retry a completed job", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "completed",
          attempts: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.jobId = 7;
    await expect(
      retryJob(7, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(JobNotRetryableError);
  });

  it("transition throws JobNotFoundError when row is missing", async () => {
    const { db, state } = makeFakeDb({});
    state.selectQueue.push("byId");
    state.active.jobId = 999;
    await expect(
      markJobCompleted(999, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(JobNotFoundError);
  });
});

describe("pruneOldBackgroundJobs — Phase 22 retention", () => {
  it("returns deletedCount=0 on ASDB-null (fail-soft)", async () => {
    const result = await pruneOldBackgroundJobs(
      { olderThan: new Date("2026-01-01") },
      { getDb: () => null as never },
    );
    expect(result.deletedCount).toBe(0);
  });

  it("returns the number of deleted rows from .returning()", async () => {
    const captured: { whereCalled: boolean } = { whereCalled: false };
    const db = {
      delete: vi.fn(() => ({
        where: () => {
          captured.whereCalled = true;
          return {
            returning: async () => [{ id: 11 }, { id: 12 }, { id: 13 }],
          };
        },
      })),
    };

    const result = await pruneOldBackgroundJobs(
      { olderThan: new Date("2026-04-01") },
      { getDb: () => db as never },
    );

    expect(result.deletedCount).toBe(3);
    expect(captured.whereCalled).toBe(true);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("returns deletedCount=0 when no rows match", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [],
        }),
      })),
    };
    const result = await pruneOldBackgroundJobs(
      { olderThan: new Date("2026-04-01") },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(0);
  });

  it("accepts a custom statuses filter (aggressive cleanup)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 1 }],
        }),
      })),
    };
    const result = await pruneOldBackgroundJobs(
      {
        olderThan: new Date("2026-04-01"),
        statuses: ["completed", "failed", "cancelled"],
      },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(1);
  });
});
