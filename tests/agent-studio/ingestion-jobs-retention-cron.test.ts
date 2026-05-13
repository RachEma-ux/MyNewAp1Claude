/**
 * Phase 22 follow-up #670 — ingestion-jobs retention cron.
 * Factory-backed via makeRetentionCron({...}) (#642). 13th slot in
 * the daily-sweep ladder (15:00 UTC).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/ingestion-jobs-retention.js",
  () => ({ pruneOldIngestionJobs: sweepMock }),
);

import {
  DEFAULT_INGESTION_JOBS_RETENTION_CRON_EXPR,
  DEFAULT_INGESTION_JOBS_RETENTION_DAYS,
  tickIngestionJobsRetentionCron,
  getIngestionJobsRetentionCronStatus,
  _resetIngestionJobsRetentionCronForTests,
  ensureIngestionJobsRetentionCronStarted,
} from "../../server/agent-studio/services/ingestion-jobs-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ deletedJobsCount: 0 });
  delete process.env.AGS_INGESTION_JOBS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_INGESTION_JOBS_RETENTION_CRON_EXPR;
  delete process.env.AGS_INGESTION_JOBS_RETENTION_DAYS;
  _resetIngestionJobsRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_INGESTION_JOBS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_INGESTION_JOBS_RETENTION_CRON_EXPR;
  delete process.env.AGS_INGESTION_JOBS_RETENTION_DAYS;
  _resetIngestionJobsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 15:00 UTC", () => {
    expect(DEFAULT_INGESTION_JOBS_RETENTION_CRON_EXPR).toBe("0 15 * * *");
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_INGESTION_JOBS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickIngestionJobsRetentionCron — cron matching", () => {
  it("fires at 15:00 UTC default", async () => {
    const state = STATE();
    const result = await tickIngestionJobsRetentionCron({
      now: new Date("2026-05-13T15:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 12 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      const result = await tickIngestionJobsRetentionCron({
        now: new Date(
          `2026-05-13T${hr.toString().padStart(2, "0")}:00:00Z`,
        ),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickIngestionJobsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_INGESTION_JOBS_RETENTION_CRON_DISABLED = "1";
    const result = await tickIngestionJobsRetentionCron({
      now: new Date("2026-05-13T15:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_INGESTION_JOBS_RETENTION_DAYS env override", async () => {
    process.env.AGS_INGESTION_JOBS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickIngestionJobsRetentionCron({
      now: new Date("2026-05-13T15:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-06T15:00:00.000Z");
  });
});

describe("tickIngestionJobsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.workspaceId + sourceConnectorKey + statuses", async () => {
    const state = STATE();
    await tickIngestionJobsRetentionCron({
      now: new Date("2026-05-13T15:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        workspaceId: [11, 22],
        sourceConnectorKey: ["s3"],
        statuses: ["failed", "unsupported_type"],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].workspaceId).toEqual([11, 22]);
    expect(sweepMock.mock.calls[0][0].sourceConnectorKey).toEqual(["s3"]);
    expect(sweepMock.mock.calls[0][0].statuses).toEqual([
      "failed",
      "unsupported_type",
    ]);
  });
});

describe("tickIngestionJobsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-13T15:00:00Z");
    const a = await tickIngestionJobsRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickIngestionJobsRetentionCron({
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
    await tickIngestionJobsRetentionCron({
      now: new Date("2026-05-13T15:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getIngestionJobsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getIngestionJobsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({ deletedJobsCount: 23 });
    const state = STATE();
    await tickIngestionJobsRetentionCron({
      now: new Date("2026-05-13T15:00:00Z"),
      state,
      log: () => {},
    });
    const s = getIngestionJobsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-13T15:00:00.000Z");
    expect(s.lastResult?.deletedJobsCount).toBe(23);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureIngestionJobsRetentionCronStarted();
      ensureIngestionJobsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
