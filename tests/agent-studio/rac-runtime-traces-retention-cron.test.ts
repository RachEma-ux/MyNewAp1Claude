/**
 * Phase 22 follow-up #639 — rac-runtime-traces retention cron.
 * Mirrors catalog-sync-log-retention-cron.test.ts (#634).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/rac-runtime-traces-retention.js",
  () => ({ pruneOldRacRuntimeTraces: sweepMock }),
);

import {
  DEFAULT_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR,
  DEFAULT_RAC_RUNTIME_TRACES_RETENTION_DAYS,
  tickRacRuntimeTracesRetentionCron,
  getRacRuntimeTracesRetentionCronStatus,
  _resetRacRuntimeTracesRetentionCronForTests,
  ensureRacRuntimeTracesRetentionCronStarted,
} from "../../server/agent-studio/services/rac-runtime-traces-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({
    deletedTracesCount: 0,
    deletedContextBlocksCount: 0,
  });
  delete process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_DISABLED;
  delete process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR;
  delete process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_DAYS;
  _resetRacRuntimeTracesRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_DISABLED;
  delete process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR;
  delete process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_DAYS;
  _resetRacRuntimeTracesRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 08:00 UTC", () => {
    expect(DEFAULT_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR).toBe("0 8 * * *");
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_RAC_RUNTIME_TRACES_RETENTION_DAYS).toBe(30);
  });
});

describe("tickRacRuntimeTracesRetentionCron — cron matching", () => {
  it("fires at 08:00 UTC default", async () => {
    const state = STATE();
    const result = await tickRacRuntimeTracesRetentionCron({
      now: new Date("2026-05-12T08:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 5 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7]) {
      const result = await tickRacRuntimeTracesRetentionCron({
        now: new Date(`2026-05-12T0${hr}:00:00Z`),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickRacRuntimeTracesRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_DISABLED = "1";
    const result = await tickRacRuntimeTracesRetentionCron({
      now: new Date("2026-05-12T08:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_RAC_RUNTIME_TRACES_RETENTION_DAYS env override", async () => {
    process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_DAYS = "7";
    const state = STATE();
    await tickRacRuntimeTracesRetentionCron({
      now: new Date("2026-05-12T08:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T08:00:00.000Z");
  });
});

describe("tickRacRuntimeTracesRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.workspaceId (array)", async () => {
    const state = STATE();
    await tickRacRuntimeTracesRetentionCron({
      now: new Date("2026-05-12T08:00:00Z"),
      state,
      sweepInput: { workspaceId: [11, 22] },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].workspaceId).toEqual([11, 22]);
  });

  it("forwards sweepInput.agentId (single)", async () => {
    const state = STATE();
    await tickRacRuntimeTracesRetentionCron({
      now: new Date("2026-05-12T08:00:00Z"),
      state,
      sweepInput: { agentId: 42 },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].agentId).toBe(42);
  });
});

describe("tickRacRuntimeTracesRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T08:00:00Z");
    const a = await tickRacRuntimeTracesRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickRacRuntimeTracesRetentionCron({
      now,
      state,
      log: () => {},
    });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
  });

  it("swallows sweep failures and surfaces lastError via getter", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const state = STATE();
    await tickRacRuntimeTracesRetentionCron({
      now: new Date("2026-05-12T08:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getRacRuntimeTracesRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getRacRuntimeTracesRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedTracesCount: 5,
      deletedContextBlocksCount: 47,
    });
    const state = STATE();
    await tickRacRuntimeTracesRetentionCron({
      now: new Date("2026-05-12T08:00:00Z"),
      state,
      log: () => {},
    });
    const s = getRacRuntimeTracesRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T08:00:00.000Z");
    expect(s.lastResult?.deletedTracesCount).toBe(5);
    expect(s.lastResult?.deletedContextBlocksCount).toBe(47);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureRacRuntimeTracesRetentionCronStarted();
      ensureRacRuntimeTracesRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
