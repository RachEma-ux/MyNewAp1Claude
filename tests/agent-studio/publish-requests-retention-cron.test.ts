/**
 * Approval-lifecycle retention cron #1 of 3 — publish-requests
 * retention (PR #693). Mirrors cag-pack-events-retention-cron.test.ts.
 * Factory-backed module (makeRetentionCron) — exercises the per-cron
 * defaults, env override + disable, dedup, sweep failure surfacing,
 * and ensureStarted idempotency.
 *
 * Slot 16 of the daily-sweep ladder (18:00 UTC); 90-day default per
 * compliance-significance rationale.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/publish-requests-retention.js",
  () => ({ prunePublishRequestsRetention: sweepMock }),
);

import {
  DEFAULT_PUBLISH_REQUESTS_RETENTION_CRON_EXPR,
  DEFAULT_PUBLISH_REQUESTS_RETENTION_DAYS,
  tickPublishRequestsRetentionCron,
  getPublishRequestsRetentionCronStatus,
  _resetPublishRequestsRetentionCronForTests,
  ensurePublishRequestsRetentionCronStarted,
} from "../../server/agent-studio/services/publish-requests-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

const ENV_KEYS = [
  "AGS_PUBLISH_REQUESTS_RETENTION_CRON_DISABLED",
  "AGS_PUBLISH_REQUESTS_RETENTION_CRON_EXPR",
  "AGS_PUBLISH_REQUESTS_RETENTION_DAYS",
] as const;

const SUCCESS_RESULT = {
  deletedCount: 0,
  preservedCount: 0,
  blockerCounts: {},
} as const;

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue(SUCCESS_RESULT);
  for (const k of ENV_KEYS) delete process.env[k];
  _resetPublishRequestsRetentionCronForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  _resetPublishRequestsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 18:00 UTC (slot 16 of the ladder)", () => {
    expect(DEFAULT_PUBLISH_REQUESTS_RETENTION_CRON_EXPR).toBe("0 18 * * *");
  });
  it("default retention is 90 days (approval-lifecycle compliance default)", () => {
    expect(DEFAULT_PUBLISH_REQUESTS_RETENTION_DAYS).toBe(90);
  });
});

describe("tickPublishRequestsRetentionCron — cron matching", () => {
  it("fires at 18:00 UTC default", async () => {
    const state = STATE();
    const result = await tickPublishRequestsRetentionCron({
      now: new Date("2026-05-12T18:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
      const result = await tickPublishRequestsRetentionCron({
        now: new Date(`2026-05-12T${String(hr).padStart(2, "0")}:00:00Z`),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickPublishRequestsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_PUBLISH_REQUESTS_RETENTION_CRON_DISABLED = "1";
    const result = await tickPublishRequestsRetentionCron({
      now: new Date("2026-05-12T18:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_PUBLISH_REQUESTS_RETENTION_DAYS env override", async () => {
    process.env.AGS_PUBLISH_REQUESTS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickPublishRequestsRetentionCron({
      now: new Date("2026-05-12T18:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T18:00:00.000Z");
  });
});

describe("tickPublishRequestsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.agentId (scalar)", async () => {
    const state = STATE();
    await tickPublishRequestsRetentionCron({
      now: new Date("2026-05-12T18:00:00Z"),
      state,
      sweepInput: { olderThan: new Date(0), agentId: 42 },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].agentId).toBe(42);
  });

  it("forwards sweepInput.agentId (array)", async () => {
    const state = STATE();
    await tickPublishRequestsRetentionCron({
      now: new Date("2026-05-12T18:00:00Z"),
      state,
      sweepInput: { olderThan: new Date(0), agentId: [11, 22] },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].agentId).toEqual([11, 22]);
  });
});

describe("tickPublishRequestsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T18:00:00Z");
    const a = await tickPublishRequestsRetentionCron({ now, state, log: () => {} });
    const b = await tickPublishRequestsRetentionCron({ now, state, log: () => {} });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
  });

  it("swallows sweep failures and surfaces lastError via getter", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const state = STATE();
    await tickPublishRequestsRetentionCron({
      now: new Date("2026-05-12T18:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getPublishRequestsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getPublishRequestsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedCount: 137,
      preservedCount: 4,
      blockerCounts: { LEGAL_HOLD: 2, ACTIVE_RELEASE_LINK: 2 },
    });
    const state = STATE();
    await tickPublishRequestsRetentionCron({
      now: new Date("2026-05-12T18:00:00Z"),
      state,
      log: () => {},
    });
    const s = getPublishRequestsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T18:00:00.000Z");
    expect(s.lastResult?.deletedCount).toBe(137);
    expect(s.lastResult?.preservedCount).toBe(4);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensurePublishRequestsRetentionCronStarted();
      ensurePublishRequestsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
