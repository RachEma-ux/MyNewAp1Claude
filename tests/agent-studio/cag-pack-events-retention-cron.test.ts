/**
 * Phase 22 follow-up #646 — cag-pack-events retention cron.
 * Mirrors catalog-sync-log-retention-cron.test.ts (#634). Factory-
 * backed module — exercises the makeRetentionCron({...}) wiring (#642).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/cag-pack-events-retention.js",
  () => ({ pruneOldCagPackEvents: sweepMock }),
);

import {
  DEFAULT_CAG_PACK_EVENTS_RETENTION_CRON_EXPR,
  DEFAULT_CAG_PACK_EVENTS_RETENTION_DAYS,
  tickCagPackEventsRetentionCron,
  getCagPackEventsRetentionCronStatus,
  _resetCagPackEventsRetentionCronForTests,
  ensureCagPackEventsRetentionCronStarted,
} from "../../server/agent-studio/services/cag-pack-events-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ deletedCount: 0 });
  delete process.env.AGS_CAG_PACK_EVENTS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_CAG_PACK_EVENTS_RETENTION_CRON_EXPR;
  delete process.env.AGS_CAG_PACK_EVENTS_RETENTION_DAYS;
  _resetCagPackEventsRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_CAG_PACK_EVENTS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_CAG_PACK_EVENTS_RETENTION_CRON_EXPR;
  delete process.env.AGS_CAG_PACK_EVENTS_RETENTION_DAYS;
  _resetCagPackEventsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 09:00 UTC", () => {
    expect(DEFAULT_CAG_PACK_EVENTS_RETENTION_CRON_EXPR).toBe("0 9 * * *");
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_CAG_PACK_EVENTS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickCagPackEventsRetentionCron — cron matching", () => {
  it("fires at 09:00 UTC default", async () => {
    const state = STATE();
    const result = await tickCagPackEventsRetentionCron({
      now: new Date("2026-05-12T09:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 6 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8]) {
      const result = await tickCagPackEventsRetentionCron({
        now: new Date(`2026-05-12T0${hr}:00:00Z`),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickCagPackEventsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_CAG_PACK_EVENTS_RETENTION_CRON_DISABLED = "1";
    const result = await tickCagPackEventsRetentionCron({
      now: new Date("2026-05-12T09:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_CAG_PACK_EVENTS_RETENTION_DAYS env override", async () => {
    process.env.AGS_CAG_PACK_EVENTS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickCagPackEventsRetentionCron({
      now: new Date("2026-05-12T09:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T09:00:00.000Z");
  });
});

describe("tickCagPackEventsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.eventTypes + eventSeverities", async () => {
    const state = STATE();
    await tickCagPackEventsRetentionCron({
      now: new Date("2026-05-12T09:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        eventTypes: ["pack_used"],
        eventSeverities: ["info"],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].eventTypes).toEqual(["pack_used"]);
    expect(sweepMock.mock.calls[0][0].eventSeverities).toEqual(["info"]);
  });

  it("forwards sweepInput.workspaceId + agentDraftId + packId", async () => {
    const state = STATE();
    await tickCagPackEventsRetentionCron({
      now: new Date("2026-05-12T09:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        workspaceId: [11, 22],
        agentDraftId: 42,
        packId: 9,
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].workspaceId).toEqual([11, 22]);
    expect(sweepMock.mock.calls[0][0].agentDraftId).toBe(42);
    expect(sweepMock.mock.calls[0][0].packId).toBe(9);
  });
});

describe("tickCagPackEventsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T09:00:00Z");
    const a = await tickCagPackEventsRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickCagPackEventsRetentionCron({
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
    await tickCagPackEventsRetentionCron({
      now: new Date("2026-05-12T09:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getCagPackEventsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getCagPackEventsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({ deletedCount: 137 });
    const state = STATE();
    await tickCagPackEventsRetentionCron({
      now: new Date("2026-05-12T09:00:00Z"),
      state,
      log: () => {},
    });
    const s = getCagPackEventsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T09:00:00.000Z");
    expect(s.lastResult?.deletedCount).toBe(137);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureCagPackEventsRetentionCronStarted();
      ensureCagPackEventsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
