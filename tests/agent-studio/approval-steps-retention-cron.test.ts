/**
 * Approval-lifecycle retention cron #2 of 3 — approval-steps
 * retention (PR #693). Mirrors cag-pack-events-retention-cron.test.ts.
 * Factory-backed module (makeRetentionCron) — exercises the per-cron
 * defaults, env override + disable, dedup, sweep failure surfacing,
 * and ensureStarted idempotency.
 *
 * Slot 17 of the daily-sweep ladder (19:00 UTC); 90-day default per
 * compliance-significance rationale. Parent-publish-request hold
 * inheritance is exercised by the prune-service unit tests + the
 * live-ASDB integration suite (#703 K1 regression).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/approval-steps-retention.js",
  () => ({ pruneApprovalStepsRetention: sweepMock }),
);

import {
  DEFAULT_APPROVAL_STEPS_RETENTION_CRON_EXPR,
  DEFAULT_APPROVAL_STEPS_RETENTION_DAYS,
  tickApprovalStepsRetentionCron,
  getApprovalStepsRetentionCronStatus,
  _resetApprovalStepsRetentionCronForTests,
  ensureApprovalStepsRetentionCronStarted,
} from "../../server/agent-studio/services/approval-steps-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

const ENV_KEYS = [
  "AGS_APPROVAL_STEPS_RETENTION_CRON_DISABLED",
  "AGS_APPROVAL_STEPS_RETENTION_CRON_EXPR",
  "AGS_APPROVAL_STEPS_RETENTION_DAYS",
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
  _resetApprovalStepsRetentionCronForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  _resetApprovalStepsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 19:00 UTC (slot 17 of the ladder)", () => {
    expect(DEFAULT_APPROVAL_STEPS_RETENTION_CRON_EXPR).toBe("0 19 * * *");
  });
  it("default retention is 90 days (matches publish-requests cron)", () => {
    expect(DEFAULT_APPROVAL_STEPS_RETENTION_DAYS).toBe(90);
  });
});

describe("tickApprovalStepsRetentionCron — cron matching", () => {
  it("fires at 19:00 UTC default", async () => {
    const state = STATE();
    const result = await tickApprovalStepsRetentionCron({
      now: new Date("2026-05-12T19:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips publish-requests slot (18:00 UTC)", async () => {
    const state = STATE();
    const result = await tickApprovalStepsRetentionCron({
      now: new Date("2026-05-12T18:00:00Z"),
      state,
    });
    expect(result.skippedReason).toBe("no_match");
  });

  it("skips note-promotions slot (20:00 UTC)", async () => {
    const state = STATE();
    const result = await tickApprovalStepsRetentionCron({
      now: new Date("2026-05-12T20:00:00Z"),
      state,
    });
    expect(result.skippedReason).toBe("no_match");
  });
});

describe("tickApprovalStepsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_APPROVAL_STEPS_RETENTION_CRON_DISABLED = "1";
    const result = await tickApprovalStepsRetentionCron({
      now: new Date("2026-05-12T19:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_APPROVAL_STEPS_RETENTION_DAYS env override", async () => {
    process.env.AGS_APPROVAL_STEPS_RETENTION_DAYS = "14";
    const state = STATE();
    await tickApprovalStepsRetentionCron({
      now: new Date("2026-05-12T19:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-04-28T19:00:00.000Z");
  });
});

describe("tickApprovalStepsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T19:00:00Z");
    const a = await tickApprovalStepsRetentionCron({ now, state, log: () => {} });
    const b = await tickApprovalStepsRetentionCron({ now, state, log: () => {} });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
  });

  it("swallows sweep failures and surfaces lastError via getter", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const state = STATE();
    await tickApprovalStepsRetentionCron({
      now: new Date("2026-05-12T19:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getApprovalStepsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getApprovalStepsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedCount: 42,
      preservedCount: 9,
      blockerCounts: { PENDING_APPROVAL_CHAIN: 5, LEGAL_HOLD: 4 },
    });
    const state = STATE();
    await tickApprovalStepsRetentionCron({
      now: new Date("2026-05-12T19:00:00Z"),
      state,
      log: () => {},
    });
    const s = getApprovalStepsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T19:00:00.000Z");
    expect(s.lastResult?.deletedCount).toBe(42);
    expect(s.lastResult?.preservedCount).toBe(9);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureApprovalStepsRetentionCronStarted();
      ensureApprovalStepsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
