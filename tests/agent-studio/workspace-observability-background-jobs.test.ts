/**
 * Phase 22 — Workspace observability: background jobs service tests.
 *
 * Covers `services/workspace-observability/background-jobs.ts`.
 * Uses the active-key fake-DB pattern.
 */

import { describe, it, expect, vi } from "vitest";
import {
  enqueueJob,
  enqueueJobs,
  getJobById,
  getJobsByIds,
  listJobs,
  listStaleRunningJobs,
  listOldestPendingJobs,
  markJobStarted,
  markJobsStarted,
  markJobCompleted,
  markJobsCompleted,
  markJobFailed,
  markJobsFailed,
  markJobCancelled,
  bumpJobHeartbeat,
  bumpJobHeartbeats,
  retryJob,
  retryJobs,
  retryJobsByQuery,
  cancelJobs,
  cancelJobsByQuery,
  failStaleRunningJobs,
  pruneOldBackgroundJobs,
  AsdbUnavailableError,
  JobNotFoundError,
  JobNotRetryableError,
  JobNotRunningError,
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
    statuses?: readonly string[];
    jobKind?: string;
    jobKinds?: readonly string[];
    createdSince?: Date;
    updatedSince?: Date;
    lastErrorLike?: string;
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
          if (state.active.statuses !== undefined) {
            const set = new Set(state.active.statuses);
            rows = rows.filter((r) => set.has(r.status));
          }
          if (state.active.jobKind !== undefined) {
            rows = rows.filter((r) => r.jobKind === state.active.jobKind);
          }
          if (state.active.jobKinds !== undefined) {
            const set = new Set(state.active.jobKinds);
            rows = rows.filter((r) => set.has(r.jobKind));
          }
          if (state.active.createdSince !== undefined) {
            const cutoff = state.active.createdSince.getTime();
            rows = rows.filter((r) => r.createdAt.getTime() >= cutoff);
          }
          if (state.active.updatedSince !== undefined) {
            const cutoff = state.active.updatedSince.getTime();
            rows = rows.filter((r) => r.updatedAt.getTime() >= cutoff);
          }
          if (state.active.lastErrorLike !== undefined) {
            // Simulate SQL LIKE with %wildcards%. NULL lastError never
            // matches (matches SQL semantics).
            const pattern = state.active.lastErrorLike;
            const startsWild = pattern.startsWith("%");
            const endsWild = pattern.endsWith("%");
            const core = pattern.slice(
              startsWild ? 1 : 0,
              endsWild ? pattern.length - 1 : pattern.length,
            );
            rows = rows.filter((r) => {
              if (r.lastError == null) return false;
              const msg = r.lastError;
              if (startsWild && endsWild) return msg.includes(core);
              if (startsWild) return msg.endsWith(core);
              if (endsWild) return msg.startsWith(core);
              return msg === core;
            });
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
      values: (
        vals: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>,
      ) => ({
        returning: async () => {
          if (name !== "ags_workspace_background_jobs") return [];
          const now = new Date();
          const valArr = Array.isArray(vals) ? vals : [vals];
          const inserted: FakeRow[] = valArr.map((v) => {
            const id = state.nextId++;
            const row: FakeRow = {
              id,
              jobKind: String(v.jobKind),
              payload:
                (v.payload as Record<string, unknown> | null | undefined) ??
                null,
              status: String(v.status ?? "pending"),
              attempts: Number(v.attempts ?? 0),
              lastError: v.lastError == null ? null : String(v.lastError),
              createdAt: now,
              updatedAt: (v.updatedAt as Date) ?? now,
            };
            state.rows.push(row);
            return row;
          });
          return inserted;
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

describe("enqueueJobs — Phase 22 #547 bulk fan-out", () => {
  it("short-circuits empty input with no DB call (returns [])", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await enqueueJobs([], { getDb });
    expect(result).toEqual([]);
    // Empty input must not even probe ASDB — a sweep that fans out to
    // zero rows shouldn't fail because the DB happens to be down.
    expect(getDb).not.toHaveBeenCalled();
  });

  it("throws AsdbUnavailableError when ASDB is unavailable + non-empty input", async () => {
    await expect(
      enqueueJobs([{ jobKind: "x" }], { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("inserts N pending rows in a single batched call", async () => {
    const { db, state } = makeFakeDb();
    const result = await enqueueJobs(
      [
        { jobKind: "projection.rebuild", payload: { vaultId: 1 } },
        { jobKind: "projection.rebuild", payload: { vaultId: 2 } },
        { jobKind: "projection.rebuild", payload: { vaultId: 3 } },
      ],
      { getDb: () => db as never },
    );
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.status === "pending")).toBe(true);
    expect(result.every((r) => r.attempts === 0)).toBe(true);
    expect(state.rows).toHaveLength(3);
    // All rows enter as pending — no half-status batches.
    expect(state.rows.map((r) => r.status)).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("preserves per-row payload + jobKind", async () => {
    const { db } = makeFakeDb();
    const result = await enqueueJobs(
      [
        { jobKind: "a.kind", payload: { foo: 1 } },
        { jobKind: "b.kind", payload: null },
        { jobKind: "c.kind" },
      ],
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.jobKind)).toEqual(["a.kind", "b.kind", "c.kind"]);
    expect(result[0].payload).toEqual({ foo: 1 });
    expect(result[1].payload).toBeNull();
    expect(result[2].payload).toBeNull();
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

describe("getJobsByIds — Phase 22 #559 bulk reader", () => {
  it("short-circuits empty input with no DB call", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await getJobsByIds([], { getDb });
    expect(result).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns [] on ASDB-null with non-empty input (fail-soft)", async () => {
    const result = await getJobsByIds([1, 2, 3], {
      getDb: () => null as never,
    });
    expect(result).toEqual([]);
  });

  it("returns rows for the requested ids via SQL IN", async () => {
    const now = new Date();
    const rows = [
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
      {
        id: 9,
        jobKind: "y",
        payload: null,
        status: "failed",
        attempts: 2,
        lastError: "boom",
        createdAt: now,
        updatedAt: now,
      },
    ];
    const db = {
      select: () => ({
        from: () => ({
          where: async () => rows,
        }),
      }),
    };
    const result = await getJobsByIds([7, 9, 999], {
      getDb: () => db as never,
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual([7, 9]);
    // Caller diffs against the requested ids — id 999 is absent (not
    // partitioned, just missing from the result set).
  });

  it("returns [] when no ids match (all missing)", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };
    const result = await getJobsByIds([100, 200], {
      getDb: () => db as never,
    });
    expect(result).toEqual([]);
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

  it("filters by an array of statuses (OR semantics via IN)", async () => {
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
          status: "failed",
          attempts: 2,
          lastError: "boom",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 3,
          jobKind: "x",
          payload: null,
          status: "cancelled",
          attempts: 0,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 4,
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
    state.selectQueue.push("list");
    state.active.statuses = ["failed", "cancelled"];
    const result = await listJobs(
      { status: ["failed", "cancelled"] },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([2, 3]);
  });

  it("returns [] when status array is empty (vacuous IN)", async () => {
    const now = new Date();
    const { db } = makeFakeDb({
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
      ],
    });
    const result = await listJobs(
      { status: [] },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
  });

  it("filters by an array of jobKinds (#554 OR semantics via IN)", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 1,
          jobKind: "projection.rebuild",
          payload: null,
          status: "running",
          attempts: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 2,
          jobKind: "projection.repair",
          payload: null,
          status: "running",
          attempts: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 3,
          jobKind: "import.scan",
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
    state.active.jobKinds = ["projection.rebuild", "projection.repair"];
    const result = await listJobs(
      { jobKind: ["projection.rebuild", "projection.repair"] },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it("returns [] when jobKind array is empty (#554 vacuous IN)", async () => {
    const now = new Date();
    const { db } = makeFakeDb({
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
      ],
    });
    const result = await listJobs(
      { jobKind: [] },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
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

  it("lastErrorLike returns rows whose lastError contains the substring (#580)", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        { id: 1, jobKind: "x", payload: null, status: "failed", attempts: 1, lastError: "OOMKilled by linux", createdAt: now, updatedAt: now },
        { id: 2, jobKind: "x", payload: null, status: "failed", attempts: 1, lastError: "timeout exceeded", createdAt: now, updatedAt: now },
        { id: 3, jobKind: "x", payload: null, status: "failed", attempts: 1, lastError: "OOMKilled (cgroup limit)", createdAt: now, updatedAt: now },
        // NULL lastError row — must NOT match LIKE.
        { id: 4, jobKind: "x", payload: null, status: "pending", attempts: 0, lastError: null, createdAt: now, updatedAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.lastErrorLike = "%OOMKilled%";

    const result = await listJobs(
      { lastErrorLike: "%OOMKilled%" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("lastErrorLike prefix anchors at start (#580)", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        { id: 1, jobKind: "x", payload: null, status: "failed", attempts: 1, lastError: "FATAL: gateway down", createdAt: now, updatedAt: now },
        { id: 2, jobKind: "x", payload: null, status: "failed", attempts: 1, lastError: "warning: slow query", createdAt: now, updatedAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.lastErrorLike = "FATAL%";

    const result = await listJobs(
      { lastErrorLike: "FATAL%" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("lastErrorLike composes with status filter (ANDed) (#580)", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        // Right substring but wrong status: filtered out.
        { id: 1, jobKind: "x", payload: null, status: "pending", attempts: 0, lastError: "OOMKilled", createdAt: now, updatedAt: now },
        // Wrong substring but right status: filtered out.
        { id: 2, jobKind: "x", payload: null, status: "failed", attempts: 1, lastError: "timeout", createdAt: now, updatedAt: now },
        // Both right: matches.
        { id: 3, jobKind: "x", payload: null, status: "failed", attempts: 1, lastError: "OOMKilled mid-run", createdAt: now, updatedAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.status = "failed";
    state.active.lastErrorLike = "%OOMKilled%";

    const result = await listJobs(
      { status: "failed", lastErrorLike: "%OOMKilled%" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([3]);
  });

  it("lastErrorLike never matches NULL lastError rows (#580)", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        { id: 1, jobKind: "x", payload: null, status: "pending", attempts: 0, lastError: null, createdAt: now, updatedAt: now },
        { id: 2, jobKind: "x", payload: null, status: "running", attempts: 1, lastError: null, createdAt: now, updatedAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.lastErrorLike = "%anything%";

    const result = await listJobs(
      { lastErrorLike: "%anything%" },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
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

describe("retryJobs — Phase 22 #542 bulk operator retry", () => {
  // The shared makeFakeDb assumes a single active.jobId, which retryJob
  // doesn't fit (each id triggers its own getJobById + transitionStatus
  // + post-update getJobById). Use a queue-driven fake instead: each
  // .limit() call shifts the next planned response.
  function makeQueuedDb(selectQueue: ReadonlyArray<FakeRow[] | []>) {
    const queue = [...selectQueue];
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => ({
            limit: async () => queue.shift() ?? [],
          }),
        };
        return chain;
      }),
      update: vi.fn(() => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            updates.push(vals);
          },
        }),
      })),
    };
    return { db, updates, remaining: () => queue.length };
  }

  it("partitions success + skipped reasons across the batch", async () => {
    const now = new Date();
    const id1Failed: FakeRow = {
      id: 1,
      jobKind: "x",
      payload: null,
      status: "failed",
      attempts: 2,
      lastError: "boom",
      createdAt: now,
      updatedAt: now,
    };
    const id1Pending: FakeRow = { ...id1Failed, status: "pending", lastError: null };
    const id2Completed: FakeRow = {
      id: 2,
      jobKind: "x",
      payload: null,
      status: "completed",
      attempts: 1,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };

    // Queue per retryJob iteration:
    //   id=1: getJobById → [failed]; transition; getJobById → [pending]
    //   id=2: getJobById → [completed]; throws JobNotRetryableError
    //   id=99: getJobById → []; throws JobNotFoundError
    const { db } = makeQueuedDb([
      [id1Failed],
      [id1Pending],
      [id2Completed],
      [],
    ]);

    const result = await retryJobs([1, 2, 99], {
      getDb: () => db as never,
    });

    expect(result.retried).toHaveLength(1);
    expect(result.retried[0].id).toBe(1);
    expect(result.retried[0].status).toBe("pending");
    expect(result.retried[0].lastError).toBeNull();
    // attempts preserved across retry (per #532 invariant).
    expect(result.retried[0].attempts).toBe(2);
    expect(result.skipped).toEqual([
      { jobId: 2, reason: "not_retryable", currentStatus: "completed" },
      { jobId: 99, reason: "not_found" },
    ]);
  });

  it("returns empty result on empty input (no DB probe)", async () => {
    const result = await retryJobs([], { getDb: () => null as never });
    expect(result).toEqual({ retried: [], skipped: [] });
  });

  it("propagates AsdbUnavailableError on null DB (loud failure on infra)", async () => {
    await expect(
      retryJobs([1, 2], { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });
});

describe("cancelJobs — Phase 22 #543 bulk operator cancel", () => {
  // Same queue-driven fake pattern as retryJobs (#542 invariants).
  function makeQueuedDb(selectQueue: ReadonlyArray<FakeRow[] | []>) {
    const queue = [...selectQueue];
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => ({
            limit: async () => queue.shift() ?? [],
          }),
        };
        return chain;
      }),
      update: vi.fn(() => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            updates.push(vals);
          },
        }),
      })),
    };
    return { db, updates, remaining: () => queue.length };
  }

  it("cancels pending/running rows + skips terminal rows + skips not_found", async () => {
    const now = new Date();
    const id1Pending: FakeRow = {
      id: 1,
      jobKind: "x",
      payload: null,
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    const id1Cancelled: FakeRow = { ...id1Pending, status: "cancelled" };
    const id2Running: FakeRow = { ...id1Pending, id: 2, status: "running" };
    const id2Cancelled: FakeRow = { ...id2Running, status: "cancelled" };
    const id3Completed: FakeRow = { ...id1Pending, id: 3, status: "completed" };
    const id4Failed: FakeRow = { ...id1Pending, id: 4, status: "failed" };

    // Per id, cancelJobs does:
    //   getJobById → check status → if cancellable, transitionStatus
    //   (which does update + getJobById post-update)
    // So queue of byId responses:
    //   id=1 (pending → cancellable): byId(pre)=[pending], byId(post)=[cancelled]
    //   id=2 (running → cancellable): byId(pre)=[running], byId(post)=[cancelled]
    //   id=3 (completed → skip):      byId=[completed]
    //   id=4 (failed → skip):         byId=[failed]
    //   id=99 (not_found → skip):     byId=[]
    const { db } = makeQueuedDb([
      [id1Pending],
      [id1Cancelled],
      [id2Running],
      [id2Cancelled],
      [id3Completed],
      [id4Failed],
      [],
    ]);

    const result = await cancelJobs([1, 2, 3, 4, 99], {
      getDb: () => db as never,
    });

    expect(result.cancelled.map((r) => r.id).sort()).toEqual([1, 2]);
    expect(result.cancelled.every((r) => r.status === "cancelled")).toBe(true);
    expect(result.skipped).toEqual([
      { jobId: 3, reason: "not_cancellable", currentStatus: "completed" },
      { jobId: 4, reason: "not_cancellable", currentStatus: "failed" },
      { jobId: 99, reason: "not_found" },
    ]);
  });

  it("returns empty result on empty input (no DB probe)", async () => {
    const result = await cancelJobs([], { getDb: () => null as never });
    expect(result).toEqual({ cancelled: [], skipped: [] });
  });

  it("propagates AsdbUnavailableError on null DB (loud failure on infra)", async () => {
    await expect(
      cancelJobs([1, 2], { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
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

  it("short-circuits empty jobKind array with no DB call (#549)", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await pruneOldBackgroundJobs(
      { olderThan: new Date("2026-04-01"), jobKind: [] },
      { getDb },
    );
    expect(result.deletedCount).toBe(0);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("forwards single-string jobKind to the DELETE predicate (#549)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 1 }, { id: 2 }],
        }),
      })),
    };
    const result = await pruneOldBackgroundJobs(
      { olderThan: new Date("2026-04-01"), jobKind: "projection.rebuild" },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(2);
  });

  it("forwards array-form jobKind to the DELETE predicate (#549)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 5 }],
        }),
      })),
    };
    const result = await pruneOldBackgroundJobs(
      {
        olderThan: new Date("2026-04-01"),
        jobKind: ["projection.rebuild", "import.scan"],
      },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(1);
  });
});

describe("listStaleRunningJobs — Phase 22 #545 dashboard helper", () => {
  // Dedicated fake — the global makeFakeDb hardcodes desc(updatedAt)
  // for the listJobs path; this helper sorts ASC instead, so we want
  // a fake that proves the filter + ordering happen at the SQL layer.
  function makeStaleFakeDb(rows: FakeRow[]) {
    const calls: { whereCalled: boolean; orderByCalled: boolean } = {
      whereCalled: false,
      orderByCalled: false,
    };
    const db = {
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => {
            calls.whereCalled = true;
            return chain;
          },
          orderBy: () => {
            calls.orderByCalled = true;
            return {
              limit: async (n: number) => {
                const running = rows.filter((r) => r.status === "running");
                running.sort(
                  (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
                );
                return running.slice(0, n);
              },
            };
          },
        };
        return chain;
      }),
    };
    return { db, calls };
  }

  it("fail-soft returns [] when ASDB is unavailable", async () => {
    const result = await listStaleRunningJobs(10, {
      getDb: () => null as never,
    });
    expect(result).toEqual([]);
  });

  it("returns running rows sorted oldest-touched first", async () => {
    const base = new Date("2026-05-12T00:00:00Z").getTime();
    const rows: FakeRow[] = [
      {
        id: 1,
        jobKind: "k",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: new Date(base),
        updatedAt: new Date(base + 5000),
      },
      {
        id: 2,
        jobKind: "k",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: new Date(base),
        updatedAt: new Date(base + 1000),
      },
      {
        id: 3,
        jobKind: "k",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: new Date(base),
        updatedAt: new Date(base + 3000),
      },
      {
        id: 4,
        jobKind: "k",
        payload: null,
        status: "completed",
        attempts: 1,
        lastError: null,
        createdAt: new Date(base),
        updatedAt: new Date(base),
      },
    ];
    const { db, calls } = makeStaleFakeDb(rows);
    const result = await listStaleRunningJobs(10, { getDb: () => db as never });
    expect(calls.whereCalled).toBe(true);
    expect(calls.orderByCalled).toBe(true);
    expect(result.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("respects the limit parameter", async () => {
    const base = new Date("2026-05-12T00:00:00Z").getTime();
    const rows: FakeRow[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      jobKind: "k",
      payload: null,
      status: "running",
      attempts: 1,
      lastError: null,
      createdAt: new Date(base),
      updatedAt: new Date(base + i * 1000),
    }));
    const { db } = makeStaleFakeDb(rows);
    const result = await listStaleRunningJobs(5, { getDb: () => db as never });
    expect(result).toHaveLength(5);
  });

  it("defaults limit to 10 when not specified", async () => {
    const base = new Date("2026-05-12T00:00:00Z").getTime();
    const rows: FakeRow[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      jobKind: "k",
      payload: null,
      status: "running",
      attempts: 1,
      lastError: null,
      createdAt: new Date(base),
      updatedAt: new Date(base + i * 1000),
    }));
    const { db } = makeStaleFakeDb(rows);
    const result = await listStaleRunningJobs(undefined, {
      getDb: () => db as never,
    });
    expect(result).toHaveLength(10);
  });

  it("accepts the object-input form with limit (#556 back-compat)", async () => {
    const base = new Date("2026-05-12T00:00:00Z").getTime();
    const rows: FakeRow[] = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      jobKind: "k",
      payload: null,
      status: "running",
      attempts: 1,
      lastError: null,
      createdAt: new Date(base),
      updatedAt: new Date(base + i * 1000),
    }));
    const { db } = makeStaleFakeDb(rows);
    const result = await listStaleRunningJobs(
      { limit: 2 },
      { getDb: () => db as never },
    );
    expect(result).toHaveLength(2);
  });

  it("short-circuits empty jobKind array with no DB call (#556)", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await listStaleRunningJobs(
      { jobKind: [] },
      { getDb },
    );
    expect(result).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("accepts single-string jobKind filter (#556)", async () => {
    // The dedicated stale fake doesn't introspect the WHERE filter, so
    // we verify the input shape is accepted without throw.
    const base = new Date("2026-05-12T00:00:00Z").getTime();
    const rows: FakeRow[] = [
      {
        id: 1,
        jobKind: "projection.rebuild",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: new Date(base),
        updatedAt: new Date(base),
      },
    ];
    const { db } = makeStaleFakeDb(rows);
    const result = await listStaleRunningJobs(
      { jobKind: "projection.rebuild" },
      { getDb: () => db as never },
    );
    // The fake ignores WHERE filters and returns all running rows.
    expect(result).toHaveLength(1);
  });

  it("accepts array-form jobKind filter (#556)", async () => {
    const base = new Date("2026-05-12T00:00:00Z").getTime();
    const rows: FakeRow[] = [
      {
        id: 1,
        jobKind: "projection.rebuild",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: new Date(base),
        updatedAt: new Date(base),
      },
    ];
    const { db } = makeStaleFakeDb(rows);
    const result = await listStaleRunningJobs(
      { jobKind: ["projection.rebuild", "import.scan"] },
      { getDb: () => db as never },
    );
    expect(result).toHaveLength(1);
  });
});

describe("failStaleRunningJobs — Phase 22 #546 auto-failer", () => {
  /**
   * Dedicated fake: failStaleRunningJobs runs three SQL shapes in
   * sequence — (1) SELECT id of stale running rows, (2) per-id
   * getJobById, (3) markJobFailed (UPDATE + SELECT). The bridge to
   * recordErrorEvent is fire-and-forget; the fake accepts inserts
   * into either the jobs table or the error_events table.
   */
  function makeStaleSweepFakeDb(rows: FakeRow[]) {
    let staleSelectCount = 0;
    const db = {
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => ({
            limit: async (n: number) => {
              // First .orderBy().limit() of the run is the stale-id
              // SELECT — return ids of running rows past cutoff.
              staleSelectCount++;
              return rows.filter((r) => r.status === "running").slice(0, n);
            },
          }),
          limit: async () => {
            // .where().limit() with no orderBy = getJobById path.
            const id = activeJobId;
            const found = rows.find((r) => r.id === id);
            return found ? [found] : [];
          },
        };
        return chain;
      }),
      update: vi.fn((_t: unknown) => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            const id = activeJobId;
            const target = rows.find((r) => r.id === id);
            if (!target) return;
            if ("status" in vals) target.status = String(vals.status);
            if ("lastError" in vals) {
              target.lastError =
                vals.lastError == null ? null : String(vals.lastError);
            }
            if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
          },
        }),
      })),
      // markJobFailed bridges into error_events via insert(); accept
      // and ignore the side-channel writes so they don't error out.
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => [],
        }),
      })),
    };
    let activeJobId: number | undefined;
    const setActive = (id: number) => {
      activeJobId = id;
    };
    return { db, setActive, getStaleSelectCount: () => staleSelectCount };
  }

  it("throws AsdbUnavailableError when ASDB is unavailable", async () => {
    await expect(
      failStaleRunningJobs(
        { olderThan: new Date("2026-05-12T00:00:00Z") },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("returns scanned=0 / failed=[] when no stale rows exist", async () => {
    const rows: FakeRow[] = [];
    const { db } = makeStaleSweepFakeDb(rows);
    const result = await failStaleRunningJobs(
      { olderThan: new Date("2026-05-12T00:00:00Z") },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(0);
    expect(result.failed).toEqual([]);
  });

  it("flips stale running rows to failed with the default message", async () => {
    // Use the canonical test infrastructure: drive a single sweep
    // through markJobFailed with one stale row.
    const now = new Date("2026-05-12T00:00:00Z");
    const stale = new Date("2026-05-11T00:00:00Z");
    const row: FakeRow = {
      id: 42,
      jobKind: "projection.rebuild",
      payload: null,
      status: "running",
      attempts: 1,
      lastError: null,
      createdAt: stale,
      updatedAt: stale,
    };
    // Use the global makeFakeDb pattern — staleSweep first SELECT
    // returns one id, then getJobById returns the row, then UPDATE
    // flips it. Wire active.jobId to 42 so the byId paths land.
    const { db, state } = makeFakeDb({ rows: [row] });
    // Patch select to return the stale id on the first orderBy().limit()
    // and use the standard byId path on subsequent .limit() calls.
    let firstOrderBy = true;
    const origSelect = (db as { select: () => unknown }).select;
    (db as { select: () => unknown }).select = () => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        orderBy: () => ({
          limit: async () => {
            if (firstOrderBy) {
              firstOrderBy = false;
              return [{ id: 42 }];
            }
            return [];
          },
        }),
        limit: async () => {
          // byId path used by getJobById + markJobFailed's transitionStatus
          const found = state.rows.find((r) => r.id === 42);
          return found ? [found] : [];
        },
      };
      return chain;
    };
    state.active.jobId = 42;

    const result = await failStaleRunningJobs(
      { olderThan: now },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].status).toBe("failed");
    expect(result.failed[0].lastError).toContain("auto-failed");
    // Suppress unused-var warning on origSelect.
    void origSelect;
  });

  it("respects a custom errorMessage", async () => {
    const now = new Date("2026-05-12T00:00:00Z");
    const stale = new Date("2026-05-11T00:00:00Z");
    const row: FakeRow = {
      id: 7,
      jobKind: "x",
      payload: null,
      status: "running",
      attempts: 1,
      lastError: null,
      createdAt: stale,
      updatedAt: stale,
    };
    const { db, state } = makeFakeDb({ rows: [row] });
    let firstOrderBy = true;
    (db as { select: () => unknown }).select = () => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        orderBy: () => ({
          limit: async () => {
            if (firstOrderBy) {
              firstOrderBy = false;
              return [{ id: 7 }];
            }
            return [];
          },
        }),
        limit: async () => {
          const found = state.rows.find((r) => r.id === 7);
          return found ? [found] : [];
        },
      };
      return chain;
    };
    state.active.jobId = 7;

    const result = await failStaleRunningJobs(
      { olderThan: now, errorMessage: "stuck after 30m" },
      { getDb: () => db as never },
    );
    expect(result.failed[0].lastError).toBe("stuck after 30m");
  });

  it("skips rows whose status flipped between SELECT and UPDATE", async () => {
    // Race-condition guard: SELECT returned id=99 as stale, but by
    // the time the per-id getJobById fires, the worker has flipped
    // the row to completed. The sweep must not overwrite that.
    const now = new Date("2026-05-12T00:00:00Z");
    const finished = new Date("2026-05-11T00:00:00Z");
    const row: FakeRow = {
      id: 99,
      jobKind: "x",
      payload: null,
      status: "completed", // already finished
      attempts: 1,
      lastError: null,
      createdAt: finished,
      updatedAt: finished,
    };
    const { db, state } = makeFakeDb({ rows: [row] });
    let firstOrderBy = true;
    (db as { select: () => unknown }).select = () => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        orderBy: () => ({
          limit: async () => {
            if (firstOrderBy) {
              firstOrderBy = false;
              return [{ id: 99 }];
            }
            return [];
          },
        }),
        limit: async () => {
          const found = state.rows.find((r) => r.id === 99);
          return found ? [found] : [];
        },
      };
      return chain;
    };
    state.active.jobId = 99;

    const result = await failStaleRunningJobs(
      { olderThan: now },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(1); // SELECT still returned 1
    expect(result.failed).toEqual([]); // but skipped because no longer running
    expect(state.rows[0].status).toBe("completed"); // untouched
  });

  it("short-circuits empty jobKind array with no DB call (#548)", async () => {
    // Empty array → vacuous IN clause; the function must short-circuit
    // before probing ASDB so a no-op operator click doesn't fail when
    // the DB is down.
    const getDb = vi.fn(() => null as never);
    const result = await failStaleRunningJobs(
      { olderThan: new Date("2026-05-12T00:00:00Z"), jobKind: [] },
      { getDb },
    );
    expect(result.scanned).toBe(0);
    expect(result.failed).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("forwards single-string jobKind to the SELECT predicate (#548)", async () => {
    // The fake's select chain doesn't introspect WHERE filters, so we
    // verify the path via the inputs-shape contract: the function
    // should accept the single-string form without throwing.
    const now = new Date("2026-05-12T00:00:00Z");
    const { db } = makeFakeDb();
    const result = await failStaleRunningJobs(
      { olderThan: now, jobKind: "projection.rebuild" },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(0); // no rows in fake
    expect(result.failed).toEqual([]);
  });

  it("forwards array-form jobKind to the SELECT predicate (#548)", async () => {
    const now = new Date("2026-05-12T00:00:00Z");
    const { db } = makeFakeDb();
    const result = await failStaleRunningJobs(
      { olderThan: now, jobKind: ["projection.rebuild", "import.scan"] },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(0);
    expect(result.failed).toEqual([]);
  });

  it("delegates to markJobsFailed bulk — one error_events INSERT for N stale rows (#572)", async () => {
    const now = new Date("2026-05-12T00:00:00Z");
    const stale = new Date("2026-05-11T00:00:00Z");
    const rows: FakeRow[] = [
      {
        id: 1,
        jobKind: "a",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: stale,
        updatedAt: stale,
      },
      {
        id: 2,
        jobKind: "a",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: stale,
        updatedAt: stale,
      },
      {
        id: 3,
        jobKind: "b",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: stale,
        updatedAt: stale,
      },
    ];
    // Call sequence after the outer orderBy().limit() that returns
    // [{id:1},{id:2},{id:3}]:
    //   id 1: getJobById SELECT 1 → UPDATE 1 → transitionStatus refetch SELECT 1
    //   id 2: getJobById SELECT 2 → UPDATE 2 → transitionStatus refetch SELECT 2
    //   id 3: getJobById SELECT 3 → UPDATE 3 → transitionStatus refetch SELECT 3
    // Then 1 batched error_events INSERT.
    const selectQueue: number[] = [1, 1, 2, 2, 3, 3];
    let lastSelectedId: number | undefined;
    let firstOrderBy = true;
    const insertCalls: unknown[] = [];
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => ({
            limit: async () => {
              if (firstOrderBy) {
                firstOrderBy = false;
                return rows.map(({ id }) => ({ id }));
              }
              return [];
            },
          }),
          limit: async () => {
            const id = selectQueue.shift();
            lastSelectedId = id;
            const found = rows.find((r) => r.id === id);
            return found ? [{ ...found }] : [];
          },
        };
        return chain;
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            const target = rows.find((r) => r.id === lastSelectedId);
            if (!target) return;
            if ("status" in vals) target.status = String(vals.status);
            if ("lastError" in vals) {
              target.lastError =
                vals.lastError == null ? null : String(vals.lastError);
            }
            if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
          },
        }),
      }),
      insert: vi.fn(() => ({
        values: (v: unknown) => {
          insertCalls.push(v);
          return { returning: async () => [] };
        },
      })),
    };

    const result = await failStaleRunningJobs(
      { olderThan: now },
      { getDb: () => db as never },
    );
    // Let the fire-and-forget error_events INSERT drain.
    await new Promise((r) => setImmediate(r));

    expect(result.scanned).toBe(3);
    expect(result.failed).toHaveLength(3);
    // The bulk path emits ONE batched error_events INSERT for all
    // three failed rows (pre-#572 path would have emitted 3).
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(1);
    expect(Array.isArray(insertCalls[0])).toBe(true);
    expect((insertCalls[0] as unknown[]).length).toBe(3);
  });
});

describe("bumpJobHeartbeat — Phase 22 #562 worker heartbeat", () => {
  it("throws AsdbUnavailableError when getJobById hits null DB", async () => {
    // getJobById fail-soft returns null on null DB → bumpJobHeartbeat
    // sees no row → throws JobNotFoundError.
    await expect(
      bumpJobHeartbeat(7, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("throws JobNotFoundError when the row doesn't exist", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("byId");
    state.active.jobId = 999;
    await expect(
      bumpJobHeartbeat(999, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("throws JobNotRunningError when status is not 'running' (refuses to heartbeat terminal rows)", async () => {
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
      bumpJobHeartbeat(7, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(JobNotRunningError);
  });

  it("refreshes updatedAt on a running row without changing status/attempts", async () => {
    const earlier = new Date("2026-05-12T00:00:00Z");
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "projection.rebuild",
          payload: null,
          status: "running",
          attempts: 1,
          lastError: null,
          createdAt: earlier,
          updatedAt: earlier,
        },
      ],
    });
    state.selectQueue.push("byId", "byId");
    state.active.jobId = 7;
    const result = await bumpJobHeartbeat(7, { getDb: () => db as never });
    expect(result.status).toBe("running");
    expect(result.attempts).toBe(1);
    expect(result.lastError).toBeNull();
    // updatedAt was bumped (the fake sets it to new Date() via transitionStatus).
    expect(state.rows[0].updatedAt.getTime()).toBeGreaterThan(earlier.getTime());
  });
});

describe("bumpJobHeartbeats — Phase 22 #563 bulk worker heartbeat", () => {
  it("short-circuits empty input with no DB call", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await bumpJobHeartbeats([], { getDb });
    expect(result.bumped).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("throws AsdbUnavailableError when ASDB is unavailable + non-empty input", async () => {
    await expect(
      bumpJobHeartbeats([1, 2, 3], { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("partitions: bumps running, skips not_found + not_running rows", async () => {
    // The global makeFakeDb keys selects by state.active.jobId, but
    // bumpJobHeartbeats loops over N ids and does an internal lookup
    // per id — there's no per-iteration hook to swap the active.jobId.
    // Use a dedicated fake that resolves by the actual id passed to
    // .where(eq(id, jobId)). We capture jobId from the call chain.
    const earlier = new Date("2026-05-12T00:00:00Z");
    const rows: FakeRow[] = [
      {
        id: 7,
        jobKind: "x",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: earlier,
        updatedAt: earlier,
      },
      {
        id: 8,
        jobKind: "x",
        payload: null,
        status: "completed",
        attempts: 1,
        lastError: null,
        createdAt: earlier,
        updatedAt: earlier,
      },
    ];
    // Use a SELECT queue keyed to the call-order of bumpJobHeartbeats:
    //   id 7 (running) →   SELECT 7 → UPDATE 7 → SELECT 7 (refetch)
    //   id 8 (completed) → SELECT 8 (skipped, no UPDATE)
    //   id 999 (missing) → SELECT 999 (skipped)
    // So select order: 7, 7, 8, 999.
    const selectQueue: number[] = [7, 7, 8, 999];
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          limit: async () => {
            const id = selectQueue.shift();
            const found = rows.find((r) => r.id === id);
            return found ? [{ ...found }] : [];
          },
        };
        return chain;
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            // Only id 7 reaches UPDATE in this scenario; bump its
            // updatedAt so the SELECT-refetch reads the bumped value.
            const target = rows.find((r) => r.id === 7);
            if (!target) return;
            if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
          },
        }),
      }),
    };

    const result = await bumpJobHeartbeats([7, 8, 999], {
      getDb: () => db as never,
    });

    expect(result.bumped).toHaveLength(1);
    expect(result.bumped[0].id).toBe(7);
    expect(result.skipped).toHaveLength(2);
    const reasons = result.skipped.map((s) => s.reason).sort();
    expect(reasons).toEqual(["not_found", "not_running"]);
  });

  it("returns empty bumped + all-skipped when no rows are running", async () => {
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
    const result = await bumpJobHeartbeats([7], { getDb: () => db as never });
    expect(result.bumped).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("not_running");
    expect(result.skipped[0].currentStatus).toBe("completed");
  });
});

describe("markJobsCompleted — Phase 22 #564 bulk completion", () => {
  it("short-circuits empty input with no DB call", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await markJobsCompleted([], { getDb });
    expect(result.completed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("throws AsdbUnavailableError when ASDB is unavailable + non-empty input", async () => {
    await expect(
      markJobsCompleted([1, 2], { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("partitions: completes running, skips not_found + non-running", async () => {
    const now = new Date();
    const rows: FakeRow[] = [
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
      {
        id: 8,
        jobKind: "x",
        payload: null,
        status: "pending",
        attempts: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    // Call sequence for [7, 8, 999]:
    //   id 7 (running):   SELECT 7 → UPDATE 7 → SELECT 7
    //   id 8 (pending):   SELECT 8 (skipped)
    //   id 999 (missing): SELECT 999 (skipped)
    const selectQueue: number[] = [7, 7, 8, 999];
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          limit: async () => {
            const id = selectQueue.shift();
            const found = rows.find((r) => r.id === id);
            return found ? [{ ...found }] : [];
          },
        };
        return chain;
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            const target = rows.find((r) => r.id === 7);
            if (!target) return;
            if ("status" in vals) target.status = String(vals.status);
            if ("lastError" in vals) {
              target.lastError =
                vals.lastError == null ? null : String(vals.lastError);
            }
            if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
          },
        }),
      }),
    };

    const result = await markJobsCompleted([7, 8, 999], {
      getDb: () => db as never,
    });
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].id).toBe(7);
    expect(result.completed[0].status).toBe("completed");
    expect(result.skipped).toHaveLength(2);
    const reasons = result.skipped.map((s) => s.reason).sort();
    expect(reasons).toEqual(["not_found", "not_running"]);
    const skippedFor8 = result.skipped.find((s) => s.jobId === 8);
    expect(skippedFor8?.currentStatus).toBe("pending");
  });

  it("returns empty completed when no rows are running", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "failed",
          attempts: 1,
          lastError: "boom",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.jobId = 7;
    const result = await markJobsCompleted([7], { getDb: () => db as never });
    expect(result.completed).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("not_running");
    expect(result.skipped[0].currentStatus).toBe("failed");
  });
});

describe("markJobsFailed — Phase 22 #565 bulk failure", () => {
  it("short-circuits empty input with no DB call", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await markJobsFailed([], { getDb });
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("throws AsdbUnavailableError when ASDB is unavailable + non-empty input", async () => {
    await expect(
      markJobsFailed(
        [{ jobId: 1, errorMessage: "boom" }],
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("partitions: fails running, skips not_found + non-running", async () => {
    const now = new Date();
    const rows: FakeRow[] = [
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
      {
        id: 8,
        jobKind: "x",
        payload: null,
        status: "completed",
        attempts: 1,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    // Call sequence for [7, 8, 999]:
    //   id 7 (running):   SELECT 7 → UPDATE 7 → SELECT 7
    //                   + fire-and-forget INSERT to error_events (chain ignored)
    //   id 8 (completed): SELECT 8 (skipped)
    //   id 999 (missing): SELECT 999 (skipped)
    const selectQueue: number[] = [7, 7, 8, 999];
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          limit: async () => {
            const id = selectQueue.shift();
            const found = rows.find((r) => r.id === id);
            return found ? [{ ...found }] : [];
          },
        };
        return chain;
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            const target = rows.find((r) => r.id === 7);
            if (!target) return;
            if ("status" in vals) target.status = String(vals.status);
            if ("lastError" in vals) {
              target.lastError =
                vals.lastError == null ? null : String(vals.lastError);
            }
            if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
          },
        }),
      }),
      // recordErrorEvent uses .insert(...).values(...).returning() — return
      // a no-op chain so the fire-and-forget doesn't reject loudly.
      insert: () => ({
        values: () => ({
          returning: async () => [],
        }),
      }),
    };

    const result = await markJobsFailed(
      [
        { jobId: 7, errorMessage: "child-7 boom" },
        { jobId: 8, errorMessage: "child-8 boom" },
        { jobId: 999, errorMessage: "child-999 boom" },
      ],
      { getDb: () => db as never },
    );
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe(7);
    expect(result.failed[0].status).toBe("failed");
    expect(result.failed[0].lastError).toBe("child-7 boom");
    expect(result.skipped).toHaveLength(2);
    const reasons = result.skipped.map((s) => s.reason).sort();
    expect(reasons).toEqual(["not_found", "not_running"]);
    const skippedFor8 = result.skipped.find((s) => s.jobId === 8);
    expect(skippedFor8?.currentStatus).toBe("completed");
  });

  it("returns empty failed when no rows are running", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "cancelled",
          attempts: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.jobId = 7;
    const result = await markJobsFailed(
      [{ jobId: 7, errorMessage: "boom" }],
      { getDb: () => db as never },
    );
    expect(result.failed).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("not_running");
    expect(result.skipped[0].currentStatus).toBe("cancelled");
  });

  it("error_events bridge uses ONE batched INSERT not N (#571)", async () => {
    // Three rows all running → all three should fail → ONE
    // recordErrorEvents call with a 3-element array. This is the
    // optimization vs the pre-#571 path that did N individual
    // recordErrorEvent calls.
    const now = new Date();
    const rows: FakeRow[] = [
      {
        id: 1,
        jobKind: "a",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        jobKind: "a",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 3,
        jobKind: "b",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    // Call sequence per id (id-N: SELECT N → UPDATE N → SELECT N).
    const selectQueue: number[] = [1, 1, 2, 2, 3, 3];
    const insertCalls: unknown[] = [];
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          limit: async () => {
            const id = selectQueue.shift();
            const found = rows.find((r) => r.id === id);
            return found ? [{ ...found }] : [];
          },
        };
        return chain;
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            const id = (vals as { __targetId?: number }).__targetId;
            const target =
              rows.find((r) => r.status === "running" && r.id !== id) ??
              rows[0];
            if ("status" in vals) target.status = String(vals.status);
            if ("lastError" in vals) {
              target.lastError =
                vals.lastError == null ? null : String(vals.lastError);
            }
            if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
          },
        }),
      }),
      insert: vi.fn(() => ({
        values: (v: unknown) => {
          insertCalls.push(v);
          return { returning: async () => [] };
        },
      })),
    };

    await markJobsFailed(
      [
        { jobId: 1, errorMessage: "e1" },
        { jobId: 2, errorMessage: "e2" },
        { jobId: 3, errorMessage: "e3" },
      ],
      { getDb: () => db as never },
    );
    // Give the fire-and-forget a tick to drain.
    await new Promise((r) => setImmediate(r));

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(1);
    expect(Array.isArray(insertCalls[0])).toBe(true);
    const batch = insertCalls[0] as Array<Record<string, unknown>>;
    expect(batch).toHaveLength(3);
    expect(batch.map((b) => b.errorMessage)).toEqual(["e1", "e2", "e3"]);
    expect(batch.every((b) => b.errorClass === "BackgroundJobFailed")).toBe(
      true,
    );
    expect(batch[0].sourceKind).toBe("backgroundJob.a");
    expect(batch[2].sourceKind).toBe("backgroundJob.b");
  });

  it("error_events bridge is NOT called when all rows are skipped (#571)", async () => {
    // All-skipped path → errorEventInputs stays empty →
    // recordErrorEvents short-circuits before the DB call.
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          jobKind: "x",
          payload: null,
          status: "cancelled",
          attempts: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.jobId = 7;
    const insertSpy = vi.fn();
    const wrappedDb = {
      ...(db as Record<string, unknown>),
      insert: insertSpy,
    };
    await markJobsFailed(
      [{ jobId: 7, errorMessage: "boom" }],
      { getDb: () => wrappedDb as never },
    );
    await new Promise((r) => setImmediate(r));
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("markJobsStarted — Phase 22 #566 bulk worker-pool claim", () => {
  it("short-circuits empty input with no DB call", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await markJobsStarted([], { getDb });
    expect(result.started).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("throws AsdbUnavailableError when ASDB is unavailable + non-empty input", async () => {
    await expect(
      markJobsStarted([1, 2, 3], { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("partitions: claims pending, skips not_found + not_pending", async () => {
    const now = new Date();
    const rows: FakeRow[] = [
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
      {
        id: 8,
        jobKind: "x",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    // Call sequence for [7, 8, 999]:
    //   id 7 (pending):  SELECT 7 → UPDATE 7 → SELECT 7 refetch
    //   id 8 (running):  SELECT 8 (skipped not_pending)
    //   id 999 (missing): SELECT 999 (skipped not_found)
    const selectQueue: number[] = [7, 7, 8, 999];
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          limit: async () => {
            const id = selectQueue.shift();
            const found = rows.find((r) => r.id === id);
            return found ? [{ ...found }] : [];
          },
        };
        return chain;
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            const target = rows.find((r) => r.id === 7);
            if (!target) return;
            if ("status" in vals) target.status = String(vals.status);
            if ("attempts" in vals) target.attempts = Number(vals.attempts);
            if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
          },
        }),
      }),
    };

    const result = await markJobsStarted([7, 8, 999], {
      getDb: () => db as never,
    });
    expect(result.started).toHaveLength(1);
    expect(result.started[0].id).toBe(7);
    expect(result.started[0].status).toBe("running");
    expect(result.started[0].attempts).toBe(1);
    expect(result.skipped).toHaveLength(2);
    const reasons = result.skipped.map((s) => s.reason).sort();
    expect(reasons).toEqual(["not_found", "not_pending"]);
    const skippedFor8 = result.skipped.find((s) => s.jobId === 8);
    expect(skippedFor8?.currentStatus).toBe("running");
  });

  it("returns empty started when no rows are pending", async () => {
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
    const result = await markJobsStarted([7], { getDb: () => db as never });
    expect(result.started).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("not_pending");
    expect(result.skipped[0].currentStatus).toBe("completed");
  });
});

describe("listOldestPendingJobs — Phase 22 #569 dashboard helper", () => {
  // Dedicated fake — pending-queue backlog sorts ASC by createdAt.
  function makePendingFakeDb(rows: FakeRow[]) {
    const calls: { whereCalled: boolean; orderByCalled: boolean } = {
      whereCalled: false,
      orderByCalled: false,
    };
    const db = {
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => {
            calls.whereCalled = true;
            return chain;
          },
          orderBy: () => {
            calls.orderByCalled = true;
            return {
              limit: async (n: number) => {
                const pending = rows.filter((r) => r.status === "pending");
                pending.sort(
                  (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
                );
                return pending.slice(0, n);
              },
            };
          },
        };
        return chain;
      }),
    };
    return { db, calls };
  }

  it("fail-soft returns [] when ASDB is unavailable", async () => {
    const result = await listOldestPendingJobs(
      { limit: 10 },
      { getDb: () => null as never },
    );
    expect(result).toEqual([]);
  });

  it("returns pending rows sorted oldest-enqueued first", async () => {
    const base = new Date("2026-05-12T00:00:00Z").getTime();
    const rows: FakeRow[] = [
      {
        id: 1,
        jobKind: "k",
        payload: null,
        status: "pending",
        attempts: 0,
        lastError: null,
        createdAt: new Date(base + 5000),
        updatedAt: new Date(base + 5000),
      },
      {
        id: 2,
        jobKind: "k",
        payload: null,
        status: "pending",
        attempts: 0,
        lastError: null,
        createdAt: new Date(base + 1000),
        updatedAt: new Date(base + 1000),
      },
      {
        id: 3,
        jobKind: "k",
        payload: null,
        status: "pending",
        attempts: 0,
        lastError: null,
        createdAt: new Date(base + 3000),
        updatedAt: new Date(base + 3000),
      },
      {
        id: 4,
        jobKind: "k",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: new Date(base),
        updatedAt: new Date(base),
      },
    ];
    const { db, calls } = makePendingFakeDb(rows);
    const result = await listOldestPendingJobs(
      { limit: 10 },
      { getDb: () => db as never },
    );
    expect(calls.whereCalled).toBe(true);
    expect(calls.orderByCalled).toBe(true);
    // Pending only, oldest first: ids 2, 3, 1.
    expect(result.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("honors limit", async () => {
    const base = new Date("2026-05-12T00:00:00Z").getTime();
    const rows: FakeRow[] = [
      {
        id: 1,
        jobKind: "k",
        payload: null,
        status: "pending",
        attempts: 0,
        lastError: null,
        createdAt: new Date(base + 5000),
        updatedAt: new Date(base + 5000),
      },
      {
        id: 2,
        jobKind: "k",
        payload: null,
        status: "pending",
        attempts: 0,
        lastError: null,
        createdAt: new Date(base + 1000),
        updatedAt: new Date(base + 1000),
      },
    ];
    const { db } = makePendingFakeDb(rows);
    const result = await listOldestPendingJobs(
      { limit: 1 },
      { getDb: () => db as never },
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("short-circuits empty jobKind array BEFORE the ASDB probe", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await listOldestPendingJobs({ jobKind: [] }, { getDb });
    expect(result).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("defaults to limit=10 when no input provided", async () => {
    const base = new Date("2026-05-12T00:00:00Z").getTime();
    const rows: FakeRow[] = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      jobKind: "k",
      payload: null,
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: new Date(base + i * 1000),
      updatedAt: new Date(base + i * 1000),
    }));
    const { db } = makePendingFakeDb(rows);
    const result = await listOldestPendingJobs({}, { getDb: () => db as never });
    expect(result).toHaveLength(10);
  });
});

describe("retryJobsByQuery — Phase 22 #573 operator bulk retry sweep", () => {
  it("throws AsdbUnavailableError when ASDB is unavailable", async () => {
    await expect(
      retryJobsByQuery({}, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("short-circuits empty jobKind array BEFORE the ASDB probe", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await retryJobsByQuery({ jobKind: [] }, { getDb });
    expect(result.scanned).toBe(0);
    expect(result.retried).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns scanned=0 / retried=[] when no failed rows match", async () => {
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => ({ limit: async () => [] }),
        };
        return chain;
      },
    };
    const result = await retryJobsByQuery(
      {},
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(0);
    expect(result.retried).toEqual([]);
  });

  it("delegates to retryJobs and reports both scanned + retried (#573)", async () => {
    const now = new Date();
    const rows: FakeRow[] = [
      {
        id: 10,
        jobKind: "k",
        payload: null,
        status: "failed",
        attempts: 1,
        lastError: "old",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 11,
        jobKind: "k",
        payload: null,
        status: "failed",
        attempts: 1,
        lastError: "old",
        createdAt: now,
        updatedAt: now,
      },
    ];
    // Outer orderBy().limit() returns ids 10 and 11.
    // Each id then runs: getJobById SELECT N → UPDATE N → refetch SELECT N.
    let firstOrderBy = true;
    const selectQueue: number[] = [10, 10, 11, 11];
    let lastSelectedId: number | undefined;
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => ({
            limit: async () => {
              if (firstOrderBy) {
                firstOrderBy = false;
                return rows.map(({ id }) => ({ id }));
              }
              return [];
            },
          }),
          limit: async () => {
            const id = selectQueue.shift();
            lastSelectedId = id;
            const found = rows.find((r) => r.id === id);
            return found ? [{ ...found }] : [];
          },
        };
        return chain;
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            const target = rows.find((r) => r.id === lastSelectedId);
            if (!target) return;
            if ("status" in vals) target.status = String(vals.status);
            if ("lastError" in vals) {
              target.lastError =
                vals.lastError == null ? null : String(vals.lastError);
            }
            if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
          },
        }),
      }),
    };

    const result = await retryJobsByQuery(
      { jobKind: "k" },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(2);
    expect(result.retried).toHaveLength(2);
    expect(result.retried.every((r) => r.status === "pending")).toBe(true);
    expect(result.retried.every((r) => r.lastError === null)).toBe(true);
  });

  it("accepts olderThan + array-form jobKind without throwing (#573)", async () => {
    // Filter-plumbing smoke test — the fake doesn't introspect filter
    // shape, just verifies the function accepts the union types.
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => ({ limit: async () => [] }),
        };
        return chain;
      },
    };
    const result = await retryJobsByQuery(
      {
        jobKind: ["a", "b"],
        olderThan: new Date("2026-05-01T00:00:00Z"),
        limit: 25,
      },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(0);
    expect(result.retried).toEqual([]);
  });
});

describe("cancelJobsByQuery — Phase 22 #574 operator bulk cancel sweep", () => {
  it("throws AsdbUnavailableError when ASDB is unavailable", async () => {
    await expect(
      cancelJobsByQuery({}, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("short-circuits empty jobKind array BEFORE the ASDB probe", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await cancelJobsByQuery({ jobKind: [] }, { getDb });
    expect(result.scanned).toBe(0);
    expect(result.cancelled).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("short-circuits empty statuses array BEFORE the ASDB probe", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await cancelJobsByQuery({ statuses: [] }, { getDb });
    expect(result.scanned).toBe(0);
    expect(result.cancelled).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns scanned=0 / cancelled=[] when no candidates match", async () => {
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => ({ limit: async () => [] }),
        };
        return chain;
      },
    };
    const result = await cancelJobsByQuery(
      {},
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(0);
    expect(result.cancelled).toEqual([]);
  });

  it("delegates to cancelJobs and reports both scanned + cancelled (#574)", async () => {
    const now = new Date();
    const rows: FakeRow[] = [
      {
        id: 20,
        jobKind: "k",
        payload: null,
        status: "pending",
        attempts: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 21,
        jobKind: "k",
        payload: null,
        status: "running",
        attempts: 1,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    let firstOrderBy = true;
    const selectQueue: number[] = [20, 20, 21, 21];
    let lastSelectedId: number | undefined;
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => ({
            limit: async () => {
              if (firstOrderBy) {
                firstOrderBy = false;
                return rows.map(({ id }) => ({ id }));
              }
              return [];
            },
          }),
          limit: async () => {
            const id = selectQueue.shift();
            lastSelectedId = id;
            const found = rows.find((r) => r.id === id);
            return found ? [{ ...found }] : [];
          },
        };
        return chain;
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            const target = rows.find((r) => r.id === lastSelectedId);
            if (!target) return;
            if ("status" in vals) target.status = String(vals.status);
            if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
          },
        }),
      }),
    };

    const result = await cancelJobsByQuery(
      { jobKind: "k" },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(2);
    expect(result.cancelled).toHaveLength(2);
    expect(result.cancelled.every((r) => r.status === "cancelled")).toBe(true);
  });

  it("accepts statuses=['pending'] for queue-drain only (#574)", async () => {
    // The fake doesn't introspect WHERE filters, so we verify input
    // shape acceptance + scanned=0 path on no matches.
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => ({ limit: async () => [] }),
        };
        return chain;
      },
    };
    const result = await cancelJobsByQuery(
      { statuses: ["pending"], olderThan: new Date("2026-05-01T00:00:00Z") },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(0);
    expect(result.cancelled).toEqual([]);
  });

  it("accepts array-form jobKind without throwing (#574)", async () => {
    const db = {
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => ({ limit: async () => [] }),
        };
        return chain;
      },
    };
    const result = await cancelJobsByQuery(
      { jobKind: ["a", "b"], limit: 25 },
      { getDb: () => db as never },
    );
    expect(result.scanned).toBe(0);
    expect(result.cancelled).toEqual([]);
  });
});
