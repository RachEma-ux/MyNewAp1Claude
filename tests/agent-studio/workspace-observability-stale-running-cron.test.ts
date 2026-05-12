/**
 * Phase 22 follow-up #613 — tickStaleRunningCron schedules the
 * stale-running-jobs auto-fail sweep at the configured UTC minute.
 * Mirrors retention-cron.test.ts shape (PR #612) — same env-flag
 * conventions, same dedup contract, same failure swallowing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/background-jobs.js",
  () => ({
    failStaleRunningJobs: sweepMock,
  }),
);

import {
  DEFAULT_STALE_RUNNING_CRON_EXPR,
  DEFAULT_STALE_RUNNING_THRESHOLD_MS,
  DEFAULT_STALE_RUNNING_LIMIT,
  tickStaleRunningCron,
  _resetStaleRunningCronForTests,
  ensureStaleRunningCronStarted,
} from "../../server/agent-studio/services/workspace-observability/stale-running-job-cron";

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ failed: [], scanned: 0 });
  delete process.env.AGS_STALE_RUNNING_CRON_DISABLED;
  delete process.env.AGS_STALE_RUNNING_CRON_EXPR;
  delete process.env.AGS_STALE_RUNNING_THRESHOLD_MS;
  delete process.env.AGS_STALE_RUNNING_LIMIT;
  _resetStaleRunningCronForTests();
});

afterEach(() => {
  delete process.env.AGS_STALE_RUNNING_CRON_DISABLED;
  delete process.env.AGS_STALE_RUNNING_CRON_EXPR;
  delete process.env.AGS_STALE_RUNNING_THRESHOLD_MS;
  delete process.env.AGS_STALE_RUNNING_LIMIT;
  _resetStaleRunningCronForTests();
});

describe("module-level defaults", () => {
  it("default cron is every 10 minutes", () => {
    expect(DEFAULT_STALE_RUNNING_CRON_EXPR).toBe("*/10 * * * *");
  });
  it("default threshold is 30 minutes (1,800,000 ms)", () => {
    expect(DEFAULT_STALE_RUNNING_THRESHOLD_MS).toBe(30 * 60_000);
  });
  it("default limit is 100", () => {
    expect(DEFAULT_STALE_RUNNING_LIMIT).toBe(100);
  });
});

describe("tickStaleRunningCron — cron matching", () => {
  it("fires when now matches the default cron (every 10 min — 00:00)", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it("fires when now matches the default cron (every 10 min — 14:30)", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:30:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips when minute does not match the default cron (14:05)", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:05:00Z"),
      state,
    });
    expect(result.skippedReason).toBe("no_match");
    expect(sweepMock).not.toHaveBeenCalled();
  });
});

describe("tickStaleRunningCron — env disable", () => {
  it("returns disabled when AGS_STALE_RUNNING_CRON_DISABLED=1", async () => {
    process.env.AGS_STALE_RUNNING_CRON_DISABLED = "1";
    const result = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
    expect(sweepMock).not.toHaveBeenCalled();
  });
  it("honors options.disabled=true even when env is unset", async () => {
    const result = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      disabled: true,
    });
    expect(result.skippedReason).toBe("disabled");
  });
});

describe("tickStaleRunningCron — cron expression override", () => {
  it("honors AGS_STALE_RUNNING_CRON_EXPR (every 5 minutes)", async () => {
    process.env.AGS_STALE_RUNNING_CRON_EXPR = "*/5 * * * *";
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:05:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });
  it("honors options.cronExpr override", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickStaleRunningCron({
      now: new Date("2026-05-12T07:15:00Z"),
      cronExpr: "15 7 * * *",
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });
});

describe("tickStaleRunningCron — threshold and limit overrides", () => {
  it("computes olderThan = now - default threshold (30 min)", async () => {
    const now = new Date("2026-05-12T14:00:00Z");
    const state = { lastRunMinuteKey: null as string | null };
    await tickStaleRunningCron({ now, state, log: () => {} });
    expect(sweepMock).toHaveBeenCalledTimes(1);
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.limit).toBe(100);
    expect(arg.olderThan.toISOString()).toBe("2026-05-12T13:30:00.000Z");
  });

  it("honors AGS_STALE_RUNNING_THRESHOLD_MS env override", async () => {
    process.env.AGS_STALE_RUNNING_THRESHOLD_MS = "60000"; // 1 minute
    const now = new Date("2026-05-12T14:00:00Z");
    const state = { lastRunMinuteKey: null as string | null };
    await tickStaleRunningCron({ now, state, log: () => {} });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-12T13:59:00.000Z");
  });

  it("honors options.thresholdMs override", async () => {
    const now = new Date("2026-05-12T14:00:00Z");
    const state = { lastRunMinuteKey: null as string | null };
    await tickStaleRunningCron({
      now,
      state,
      thresholdMs: 5 * 60_000,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-12T13:55:00.000Z");
  });

  it("honors AGS_STALE_RUNNING_LIMIT env override", async () => {
    process.env.AGS_STALE_RUNNING_LIMIT = "25";
    const state = { lastRunMinuteKey: null as string | null };
    await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].limit).toBe(25);
  });

  it("honors options.limit override", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      limit: 50,
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].limit).toBe(50);
  });

  it("ignores invalid AGS_STALE_RUNNING_THRESHOLD_MS values and falls back to default", async () => {
    process.env.AGS_STALE_RUNNING_THRESHOLD_MS = "not-a-number";
    const now = new Date("2026-05-12T14:00:00Z");
    const state = { lastRunMinuteKey: null as string | null };
    await tickStaleRunningCron({ now, state, log: () => {} });
    const arg = sweepMock.mock.calls[0][0];
    // default 30-min threshold → 13:30:00
    expect(arg.olderThan.toISOString()).toBe("2026-05-12T13:30:00.000Z");
  });
});

describe("tickStaleRunningCron — dedup", () => {
  it("dedupes a second fire within the same minute key", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const now = new Date("2026-05-12T14:00:00Z");
    const a = await tickStaleRunningCron({ now, state, log: () => {} });
    const b = await tickStaleRunningCron({ now, state, log: () => {} });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT dedupe across the next 10-min slot", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const a = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      log: () => {},
    });
    const b = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:10:00Z"),
      state,
      log: () => {},
    });
    expect(a.fired).toBe(true);
    expect(b.fired).toBe(true);
    expect(sweepMock).toHaveBeenCalledTimes(2);
  });
});

describe("tickStaleRunningCron — failure handling", () => {
  it("swallows sweep failures without crashing", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const warn = vi.fn();
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      warn,
    });
    expect(result.fired).toBe(false);
    expect(result.skippedReason).toBe("swept_error");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("ASDB unreachable");
  });

  it("still marks lastRunMinuteKey when sweep throws", async () => {
    sweepMock.mockRejectedValueOnce(new Error("boom"));
    const state = { lastRunMinuteKey: null as string | null };
    const now = new Date("2026-05-12T14:00:00Z");
    await tickStaleRunningCron({ now, state, warn: () => {} });
    const second = await tickStaleRunningCron({ now, state, warn: () => {} });
    expect(second.skippedReason).toBe("deduped");
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });
});

describe("tickStaleRunningCron — runSweep test seam", () => {
  it("uses options.runSweep instead of the imported failStaleRunningJobs", async () => {
    const customSweep = vi
      .fn()
      .mockResolvedValue({ failed: [{} as any, {} as any], scanned: 5 });
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      runSweep: customSweep,
      log: () => {},
    });
    expect(result.fired).toBe(true);
    expect(customSweep).toHaveBeenCalledTimes(1);
    expect(sweepMock).not.toHaveBeenCalled();
    expect(result.result?.scanned).toBe(5);
  });
});

describe("ensureStaleRunningCronStarted — boot helper", () => {
  it("is idempotent (second call is a no-op)", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureStaleRunningCronStarted();
      ensureStaleRunningCronStarted();
      const startLogs = logs.filter((m) => m.includes("started"));
      expect(startLogs).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });

  it("does not register a timer when AGS_STALE_RUNNING_CRON_DISABLED=1", () => {
    process.env.AGS_STALE_RUNNING_CRON_DISABLED = "1";
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureStaleRunningCronStarted();
      expect(logs.some((m) => m.includes("disabled"))).toBe(true);
      expect(logs.some((m) => m.includes("started"))).toBe(false);
    } finally {
      console.log = origLog;
    }
  });
});
