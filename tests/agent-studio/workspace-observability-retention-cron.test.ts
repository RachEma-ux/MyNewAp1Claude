/**
 * Phase 22 follow-up #612 — tickRetentionCron schedules the
 * default 30-day retention sweep at the configured UTC minute.
 * Honors env-flag disable, env-driven cron override, in-process
 * dedup, and failure swallowing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({
  sweepMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/retention-sweep.js",
  () => ({
    runRetentionSweep: sweepMock,
  }),
);

import {
  DEFAULT_RETENTION_CRON_EXPR,
  tickRetentionCron,
  _resetRetentionCronForTests,
  ensureRetentionCronStarted,
} from "../../server/agent-studio/services/workspace-observability/retention-cron";

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({
    errorEventsDeleted: 0,
    notificationsDeleted: 0,
    backgroundJobsDeleted: 0,
    errorEventsCutoff: new Date(0),
    notificationsCutoff: new Date(0),
    backgroundJobsCutoff: new Date(0),
  });
  delete process.env.AGS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_RETENTION_CRON_EXPR;
  _resetRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_RETENTION_CRON_EXPR;
  _resetRetentionCronForTests();
});

describe("DEFAULT_RETENTION_CRON_EXPR", () => {
  it("is daily at 03:00 UTC", () => {
    expect(DEFAULT_RETENTION_CRON_EXPR).toBe("0 3 * * *");
  });
});

describe("tickRetentionCron — cron matching", () => {
  it("fires when now matches the default cron (03:00 UTC)", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it("skips when now does not match the default cron (03:01 UTC)", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T03:01:00Z"),
      state,
    });
    expect(result.fired).toBe(false);
    expect(result.skippedReason).toBe("no_match");
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("skips when now matches a different hour (04:00 UTC)", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
    });
    expect(result.fired).toBe(false);
    expect(result.skippedReason).toBe("no_match");
  });
});

describe("tickRetentionCron — env disable", () => {
  it("returns disabled when AGS_RETENTION_CRON_DISABLED=1", async () => {
    process.env.AGS_RETENTION_CRON_DISABLED = "1";
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
    });
    expect(result.fired).toBe(false);
    expect(result.skippedReason).toBe("disabled");
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("returns disabled when AGS_RETENTION_CRON_DISABLED=true", async () => {
    process.env.AGS_RETENTION_CRON_DISABLED = "true";
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors options.disabled=true even when env is unset", async () => {
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      disabled: true,
    });
    expect(result.skippedReason).toBe("disabled");
  });
});

describe("tickRetentionCron — cron expression override", () => {
  it("honors AGS_RETENTION_CRON_EXPR (every hour at :30)", async () => {
    process.env.AGS_RETENTION_CRON_EXPR = "30 * * * *";
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T14:30:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("honors options.cronExpr override", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T05:15:00Z"),
      cronExpr: "15 5 * * *",
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("does not fire when env cron does not match now", async () => {
    process.env.AGS_RETENTION_CRON_EXPR = "0 6 * * *";
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
    });
    expect(result.fired).toBe(false);
    expect(result.skippedReason).toBe("no_match");
  });
});

describe("tickRetentionCron — dedup", () => {
  it("dedupes a second fire within the same minute key", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const now = new Date("2026-05-12T03:00:00Z");
    const first = await tickRetentionCron({ now, state, log: () => {} });
    const second = await tickRetentionCron({ now, state, log: () => {} });
    expect(first.fired).toBe(true);
    expect(second.fired).toBe(false);
    expect(second.skippedReason).toBe("deduped");
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT dedupe across the next day's same-minute fire", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    const day1 = await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
      log: () => {},
    });
    const day2 = await tickRetentionCron({
      now: new Date("2026-05-13T03:00:00Z"),
      state,
      log: () => {},
    });
    expect(day1.fired).toBe(true);
    expect(day2.fired).toBe(true);
    expect(sweepMock).toHaveBeenCalledTimes(2);
  });
});

describe("tickRetentionCron — failure handling", () => {
  it("swallows sweep failures without crashing the tick", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const warn = vi.fn();
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
      warn,
    });
    expect(result.fired).toBe(false);
    expect(result.skippedReason).toBe("swept_error");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("ASDB unreachable");
  });

  it("still marks lastRunMinuteKey when sweep throws (no retry-storm within minute)", async () => {
    sweepMock.mockRejectedValueOnce(new Error("boom"));
    const state = { lastRunMinuteKey: null as string | null };
    const now = new Date("2026-05-12T03:00:00Z");
    await tickRetentionCron({ now, state, warn: () => {} });
    // Second call same minute — should be deduped, NOT retry the sweep
    const second = await tickRetentionCron({ now, state, warn: () => {} });
    expect(second.skippedReason).toBe("deduped");
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });
});

describe("tickRetentionCron — sweep input forwarding", () => {
  it("calls runRetentionSweep with empty input by default", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
      log: () => {},
    });
    expect(sweepMock).toHaveBeenCalledWith({});
  });

  it("forwards options.sweepInput to runRetentionSweep", async () => {
    const state = { lastRunMinuteKey: null as string | null };
    await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
      sweepInput: {
        errorEventsRetentionDays: 7,
        notificationsRetentionDays: 14,
      },
      log: () => {},
    });
    expect(sweepMock).toHaveBeenCalledWith({
      errorEventsRetentionDays: 7,
      notificationsRetentionDays: 14,
    });
  });

  it("uses options.runSweep as a test seam when provided", async () => {
    const customSweep = vi.fn().mockResolvedValue({
      errorEventsDeleted: 99,
      notificationsDeleted: 0,
      backgroundJobsDeleted: 0,
      errorEventsCutoff: new Date(0),
      notificationsCutoff: new Date(0),
      backgroundJobsCutoff: new Date(0),
    });
    const state = { lastRunMinuteKey: null as string | null };
    const result = await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
      runSweep: customSweep,
      log: () => {},
    });
    expect(result.fired).toBe(true);
    expect(customSweep).toHaveBeenCalledTimes(1);
    expect(sweepMock).not.toHaveBeenCalled();
    expect(result.result?.errorEventsDeleted).toBe(99);
  });
});

describe("ensureRetentionCronStarted — boot helper", () => {
  it("is idempotent (second call is a no-op)", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureRetentionCronStarted();
      ensureRetentionCronStarted();
      const startLogs = logs.filter((m) => m.includes("started"));
      expect(startLogs).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });

  it("does not register a timer when AGS_RETENTION_CRON_DISABLED=1", () => {
    process.env.AGS_RETENTION_CRON_DISABLED = "1";
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureRetentionCronStarted();
      expect(logs.some((m) => m.includes("disabled"))).toBe(true);
      expect(logs.some((m) => m.includes("started"))).toBe(false);
    } finally {
      console.log = origLog;
    }
  });
});
