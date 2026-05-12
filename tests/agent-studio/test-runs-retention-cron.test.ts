/**
 * Phase 22 follow-up #654 — test-runs retention cron.
 * Factory-backed via makeRetentionCron({...}) (#642).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/test-runs-retention.js",
  () => ({ pruneOldTestRuns: sweepMock }),
);

import {
  DEFAULT_TEST_RUNS_RETENTION_CRON_EXPR,
  DEFAULT_TEST_RUNS_RETENTION_DAYS,
  tickTestRunsRetentionCron,
  getTestRunsRetentionCronStatus,
  _resetTestRunsRetentionCronForTests,
  ensureTestRunsRetentionCronStarted,
} from "../../server/agent-studio/services/test-runs-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({
    deletedRunsCount: 0,
    deletedResultsCount: 0,
  });
  delete process.env.AGS_TEST_RUNS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_TEST_RUNS_RETENTION_CRON_EXPR;
  delete process.env.AGS_TEST_RUNS_RETENTION_DAYS;
  _resetTestRunsRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_TEST_RUNS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_TEST_RUNS_RETENTION_CRON_EXPR;
  delete process.env.AGS_TEST_RUNS_RETENTION_DAYS;
  _resetTestRunsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 11:00 UTC", () => {
    expect(DEFAULT_TEST_RUNS_RETENTION_CRON_EXPR).toBe("0 11 * * *");
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_TEST_RUNS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickTestRunsRetentionCron — cron matching", () => {
  it("fires at 11:00 UTC default", async () => {
    const state = STATE();
    const result = await tickTestRunsRetentionCron({
      now: new Date("2026-05-12T11:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 8 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8, 9, 10]) {
      const result = await tickTestRunsRetentionCron({
        now: new Date(
          `2026-05-12T${hr.toString().padStart(2, "0")}:00:00Z`,
        ),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickTestRunsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_TEST_RUNS_RETENTION_CRON_DISABLED = "1";
    const result = await tickTestRunsRetentionCron({
      now: new Date("2026-05-12T11:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_TEST_RUNS_RETENTION_DAYS env override", async () => {
    process.env.AGS_TEST_RUNS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickTestRunsRetentionCron({
      now: new Date("2026-05-12T11:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T11:00:00.000Z");
  });
});

describe("tickTestRunsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.agentId + suiteId + statuses", async () => {
    const state = STATE();
    await tickTestRunsRetentionCron({
      now: new Date("2026-05-12T11:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        agentId: [11],
        suiteId: [99],
        statuses: ["passed"],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].agentId).toEqual([11]);
    expect(sweepMock.mock.calls[0][0].suiteId).toEqual([99]);
    expect(sweepMock.mock.calls[0][0].statuses).toEqual(["passed"]);
  });
});

describe("tickTestRunsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T11:00:00Z");
    const a = await tickTestRunsRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickTestRunsRetentionCron({
      now,
      state,
      log: () => {},
    });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
  });

  it("swallows sweep failures and surfaces lastError", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const state = STATE();
    await tickTestRunsRetentionCron({
      now: new Date("2026-05-12T11:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getTestRunsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getTestRunsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedRunsCount: 22,
      deletedResultsCount: 88,
    });
    const state = STATE();
    await tickTestRunsRetentionCron({
      now: new Date("2026-05-12T11:00:00Z"),
      state,
      log: () => {},
    });
    const s = getTestRunsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T11:00:00.000Z");
    expect(s.lastResult?.deletedRunsCount).toBe(22);
    expect(s.lastResult?.deletedResultsCount).toBe(88);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureTestRunsRetentionCronStarted();
      ensureTestRunsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
