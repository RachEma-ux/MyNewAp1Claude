/**
 * Phase 22 follow-up #626 — tool-call-traces retention cron.
 * Mirrors runtime-runs-retention-cron.test.ts (#622) shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/tool-call-traces-retention.js",
  () => ({ pruneOldToolCallTraces: sweepMock }),
);

import {
  DEFAULT_TOOL_CALL_TRACES_RETENTION_CRON_EXPR,
  DEFAULT_TOOL_CALL_TRACES_RETENTION_DAYS,
  tickToolCallTracesRetentionCron,
  getToolCallTracesRetentionCronStatus,
  _resetToolCallTracesRetentionCronForTests,
  ensureToolCallTracesRetentionCronStarted,
} from "../../server/agent-studio/services/tool-call-traces-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ deletedCount: 0 });
  delete process.env.AGS_TOOL_CALL_TRACES_RETENTION_CRON_DISABLED;
  delete process.env.AGS_TOOL_CALL_TRACES_RETENTION_CRON_EXPR;
  delete process.env.AGS_TOOL_CALL_TRACES_RETENTION_DAYS;
  _resetToolCallTracesRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_TOOL_CALL_TRACES_RETENTION_CRON_DISABLED;
  delete process.env.AGS_TOOL_CALL_TRACES_RETENTION_CRON_EXPR;
  delete process.env.AGS_TOOL_CALL_TRACES_RETENTION_DAYS;
  _resetToolCallTracesRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 05:00 UTC", () => {
    expect(DEFAULT_TOOL_CALL_TRACES_RETENTION_CRON_EXPR).toBe("0 5 * * *");
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_TOOL_CALL_TRACES_RETENTION_DAYS).toBe(30);
  });
});

describe("tickToolCallTracesRetentionCron — cron matching", () => {
  it("fires at 05:00 UTC default", async () => {
    const state = STATE();
    const result = await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T05:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it("skips at the workspace-observability 03:00 / runtime-runs 04:00 slots", async () => {
    const state = STATE();
    const a = await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
    });
    const b = await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T04:00:00Z"),
      state,
    });
    expect(a.skippedReason).toBe("no_match");
    expect(b.skippedReason).toBe("no_match");
    expect(sweepMock).not.toHaveBeenCalled();
  });
});

describe("tickToolCallTracesRetentionCron — env disable", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_TOOL_CALL_TRACES_RETENTION_CRON_DISABLED = "1";
    const result = await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T05:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });
});

describe("tickToolCallTracesRetentionCron — retention window override", () => {
  it("computes olderThan = now - 30 days default", async () => {
    const state = STATE();
    await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T05:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-04-12T05:00:00.000Z");
  });

  it("honors AGS_TOOL_CALL_TRACES_RETENTION_DAYS env override", async () => {
    process.env.AGS_TOOL_CALL_TRACES_RETENTION_DAYS = "7";
    const state = STATE();
    await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T05:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T05:00:00.000Z");
  });
});

describe("tickToolCallTracesRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.dispatchResults to pruneOldToolCallTraces", async () => {
    const state = STATE();
    await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T05:00:00Z"),
      state,
      sweepInput: { dispatchResults: ["ok", "error", "blocked"] },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].dispatchResults).toEqual([
      "ok",
      "error",
      "blocked",
    ]);
  });

  it("forwards sweepInput.workspaceId array to pruneOldToolCallTraces", async () => {
    const state = STATE();
    await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T05:00:00Z"),
      state,
      sweepInput: { workspaceId: [11, 22] },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].workspaceId).toEqual([11, 22]);
  });
});

describe("tickToolCallTracesRetentionCron — dedup", () => {
  it("dedupes a same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T05:00:00Z");
    const a = await tickToolCallTracesRetentionCron({ now, state, log: () => {} });
    const b = await tickToolCallTracesRetentionCron({ now, state, log: () => {} });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });
});

describe("tickToolCallTracesRetentionCron — failure handling + status getter", () => {
  it("swallows sweep failures and surfaces lastError via getter", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const state = STATE();
    const warn = vi.fn();
    const result = await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T05:00:00Z"),
      state,
      warn,
    });
    expect(result.skippedReason).toBe("swept_error");
    expect(getToolCallTracesRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });

  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({ deletedCount: 137 });
    const state = STATE();
    await tickToolCallTracesRetentionCron({
      now: new Date("2026-05-12T05:00:00Z"),
      state,
      log: () => {},
    });
    const s = getToolCallTracesRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T05:00:00.000Z");
    expect(s.lastResult?.deletedCount).toBe(137);
    expect(s.lastError).toBeNull();
  });
});

describe("ensureToolCallTracesRetentionCronStarted — boot helper", () => {
  it("is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureToolCallTracesRetentionCronStarted();
      ensureToolCallTracesRetentionCronStarted();
      const startLogs = logs.filter((m) => m.includes("started"));
      expect(startLogs).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
