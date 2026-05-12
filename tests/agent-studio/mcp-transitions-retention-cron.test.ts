/**
 * Phase 22 follow-up #630 — mcp-transitions retention cron.
 * Mirrors tool-call-traces-retention-cron.test.ts (#626) shape on
 * the simpler `ags_mcp_transitions` surface.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/mcp-transitions-retention.js",
  () => ({ pruneOldMcpTransitions: sweepMock }),
);

import {
  DEFAULT_MCP_TRANSITIONS_RETENTION_CRON_EXPR,
  DEFAULT_MCP_TRANSITIONS_RETENTION_DAYS,
  tickMcpTransitionsRetentionCron,
  getMcpTransitionsRetentionCronStatus,
  _resetMcpTransitionsRetentionCronForTests,
  ensureMcpTransitionsRetentionCronStarted,
} from "../../server/agent-studio/services/mcp-transitions-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ deletedCount: 0 });
  delete process.env.AGS_MCP_TRANSITIONS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_MCP_TRANSITIONS_RETENTION_CRON_EXPR;
  delete process.env.AGS_MCP_TRANSITIONS_RETENTION_DAYS;
  _resetMcpTransitionsRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_MCP_TRANSITIONS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_MCP_TRANSITIONS_RETENTION_CRON_EXPR;
  delete process.env.AGS_MCP_TRANSITIONS_RETENTION_DAYS;
  _resetMcpTransitionsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 06:00 UTC", () => {
    expect(DEFAULT_MCP_TRANSITIONS_RETENTION_CRON_EXPR).toBe("0 6 * * *");
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_MCP_TRANSITIONS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickMcpTransitionsRetentionCron — cron matching", () => {
  it("fires at 06:00 UTC default", async () => {
    const state = STATE();
    const result = await tickMcpTransitionsRetentionCron({
      now: new Date("2026-05-12T06:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it("skips the 03/04/05:00 slots used by sister crons", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5]) {
      const result = await tickMcpTransitionsRetentionCron({
        now: new Date(`2026-05-12T0${hr}:00:00Z`),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
    expect(sweepMock).not.toHaveBeenCalled();
  });
});

describe("tickMcpTransitionsRetentionCron — env disable", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_MCP_TRANSITIONS_RETENTION_CRON_DISABLED = "1";
    const result = await tickMcpTransitionsRetentionCron({
      now: new Date("2026-05-12T06:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });
});

describe("tickMcpTransitionsRetentionCron — retention window override", () => {
  it("computes olderThan = now - 30 days default", async () => {
    const state = STATE();
    await tickMcpTransitionsRetentionCron({
      now: new Date("2026-05-12T06:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-04-12T06:00:00.000Z");
  });

  it("honors AGS_MCP_TRANSITIONS_RETENTION_DAYS env override", async () => {
    process.env.AGS_MCP_TRANSITIONS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickMcpTransitionsRetentionCron({
      now: new Date("2026-05-12T06:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T06:00:00.000Z");
  });
});

describe("tickMcpTransitionsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.serverId (single)", async () => {
    const state = STATE();
    await tickMcpTransitionsRetentionCron({
      now: new Date("2026-05-12T06:00:00Z"),
      state,
      sweepInput: { serverId: 42 },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].serverId).toBe(42);
  });

  it("forwards sweepInput.serverId (array)", async () => {
    const state = STATE();
    await tickMcpTransitionsRetentionCron({
      now: new Date("2026-05-12T06:00:00Z"),
      state,
      sweepInput: { serverId: [42, 43] },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].serverId).toEqual([42, 43]);
  });
});

describe("tickMcpTransitionsRetentionCron — dedup + failure handling", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T06:00:00Z");
    const a = await tickMcpTransitionsRetentionCron({ now, state, log: () => {} });
    const b = await tickMcpTransitionsRetentionCron({ now, state, log: () => {} });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
  });

  it("swallows sweep failures and surfaces lastError via getter", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const state = STATE();
    await tickMcpTransitionsRetentionCron({
      now: new Date("2026-05-12T06:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getMcpTransitionsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getMcpTransitionsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({ deletedCount: 99 });
    const state = STATE();
    await tickMcpTransitionsRetentionCron({
      now: new Date("2026-05-12T06:00:00Z"),
      state,
      log: () => {},
    });
    const s = getMcpTransitionsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T06:00:00.000Z");
    expect(s.lastResult?.deletedCount).toBe(99);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureMcpTransitionsRetentionCronStarted();
      ensureMcpTransitionsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
