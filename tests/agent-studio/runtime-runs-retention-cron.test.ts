/**
 * Phase 22 follow-up #622 — runtime-runs retention cron.
 * Mirrors workspace-observability-retention-cron.test.ts (#612) on
 * the runtime-runs surface. Same dedup / env-flag / failure-handling
 * contracts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/runtime-runs-retention.js",
  () => ({ pruneOldRuntimeRuns: sweepMock }),
);

import {
  DEFAULT_RUNTIME_RUNS_RETENTION_CRON_EXPR,
  DEFAULT_RUNTIME_RUNS_RETENTION_DAYS,
  tickRuntimeRunsRetentionCron,
  getRuntimeRunsRetentionCronStatus,
  _resetRuntimeRunsRetentionCronForTests,
  ensureRuntimeRunsRetentionCronStarted,
} from "../../server/agent-studio/services/runtime-runs-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ deletedRunsCount: 0, deletedStepsCount: 0 });
  delete process.env.AGS_RUNTIME_RUNS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_RUNTIME_RUNS_RETENTION_CRON_EXPR;
  delete process.env.AGS_RUNTIME_RUNS_RETENTION_DAYS;
  _resetRuntimeRunsRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_RUNTIME_RUNS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_RUNTIME_RUNS_RETENTION_CRON_EXPR;
  delete process.env.AGS_RUNTIME_RUNS_RETENTION_DAYS;
  _resetRuntimeRunsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 04:00 UTC", () => {
    expect(DEFAULT_RUNTIME_RUNS_RETENTION_CRON_EXPR).toBe("0 4 * * *");
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_RUNTIME_RUNS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickRuntimeRunsRetentionCron — cron matching", () => {
  it("fires at 04:00 UTC default", async () => {
    const state = STATE();
    const result = await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it("skips at 03:00 UTC (workspace-observability sweep slot)", async () => {
    const state = STATE();
    const result = await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
    });
    expect(result.skippedReason).toBe("no_match");
    expect(sweepMock).not.toHaveBeenCalled();
  });
});

describe("tickRuntimeRunsRetentionCron — env disable", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_RUNTIME_RUNS_RETENTION_CRON_DISABLED = "1";
    const result = await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });
});

describe("tickRuntimeRunsRetentionCron — retention window override", () => {
  it("computes olderThan = now - 30 days default", async () => {
    const state = STATE();
    await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-04-12T04:00:00.000Z");
  });

  it("honors AGS_RUNTIME_RUNS_RETENTION_DAYS env override", async () => {
    process.env.AGS_RUNTIME_RUNS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T04:00:00.000Z");
  });

  it("honors options.retentionDays override", async () => {
    const state = STATE();
    await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
      retentionDays: 60,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-03-13T04:00:00.000Z");
  });
});

describe("tickRuntimeRunsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.environment to pruneOldRuntimeRuns", async () => {
    const state = STATE();
    await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
      sweepInput: { environment: "draft" },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].environment).toBe("draft");
  });

  it("forwards sweepInput.agentId array to pruneOldRuntimeRuns", async () => {
    const state = STATE();
    await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
      sweepInput: { agentId: [11, 22] },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].agentId).toEqual([11, 22]);
  });
});

describe("tickRuntimeRunsRetentionCron — dedup", () => {
  it("dedupes a same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T04:00:00Z");
    const a = await tickRuntimeRunsRetentionCron({ now, state, log: () => {} });
    const b = await tickRuntimeRunsRetentionCron({ now, state, log: () => {} });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });
});

describe("tickRuntimeRunsRetentionCron — failure handling", () => {
  it("swallows sweep failures and surfaces lastError", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const state = STATE();
    const warn = vi.fn();
    const result = await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
      warn,
    });
    expect(result.skippedReason).toBe("swept_error");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(getRuntimeRunsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
    expect(getRuntimeRunsRetentionCronStatus(state).lastRunAt).toBeNull();
  });

  it("does NOT advance lastRunAt on failure (preserves last-good marker)", async () => {
    const state = STATE();
    // First: succeed
    await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
      log: () => {},
    });
    expect(getRuntimeRunsRetentionCronStatus(state).lastRunAt?.toISOString()).toBe(
      "2026-05-12T04:00:00.000Z",
    );

    // Next day: fail
    sweepMock.mockRejectedValueOnce(new Error("outage"));
    await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-13T04:00:00Z"),
      state,
      warn: () => {},
    });
    const s = getRuntimeRunsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T04:00:00.000Z");
    expect(s.lastError).toBe("outage");
  });
});

describe("getRuntimeRunsRetentionCronStatus", () => {
  it("returns nulls when nothing has run", () => {
    const s = getRuntimeRunsRetentionCronStatus(STATE());
    expect(s).toEqual({ lastRunAt: null, lastResult: null, lastError: null });
  });

  it("returns lastRunAt + lastResult after successful fire", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedRunsCount: 42,
      deletedStepsCount: 137,
    });
    const state = STATE();
    await tickRuntimeRunsRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
      log: () => {},
    });
    const s = getRuntimeRunsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T04:00:00.000Z");
    expect(s.lastResult?.deletedRunsCount).toBe(42);
    expect(s.lastResult?.deletedStepsCount).toBe(137);
    expect(s.lastError).toBeNull();
  });
});

describe("ensureRuntimeRunsRetentionCronStarted — boot helper", () => {
  it("is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureRuntimeRunsRetentionCronStarted();
      ensureRuntimeRunsRetentionCronStarted();
      const startLogs = logs.filter((m) => m.includes("started"));
      expect(startLogs).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
