/**
 * Approval-lifecycle retention cron #3 of 3 — note-promotions
 * retention (PR #693). Mirrors cag-pack-events-retention-cron.test.ts.
 * Factory-backed module (makeRetentionCron) — exercises the per-cron
 * defaults, env override + disable, dedup, sweep failure surfacing,
 * and ensureStarted idempotency. Also exercises the 3-table cascade
 * counts surfaced in lastResult.
 *
 * Slot 18 of the daily-sweep ladder (20:00 UTC); 90-day default per
 * compliance-significance rationale.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/note-promotions-retention.js",
  () => ({ pruneNotePromotionsRetention: sweepMock }),
);

import {
  DEFAULT_NOTE_PROMOTIONS_RETENTION_CRON_EXPR,
  DEFAULT_NOTE_PROMOTIONS_RETENTION_DAYS,
  tickNotePromotionsRetentionCron,
  getNotePromotionsRetentionCronStatus,
  _resetNotePromotionsRetentionCronForTests,
  ensureNotePromotionsRetentionCronStarted,
} from "../../server/agent-studio/services/note-promotions-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

const ENV_KEYS = [
  "AGS_NOTE_PROMOTIONS_RETENTION_CRON_DISABLED",
  "AGS_NOTE_PROMOTIONS_RETENTION_CRON_EXPR",
  "AGS_NOTE_PROMOTIONS_RETENTION_DAYS",
] as const;

const SUCCESS_RESULT = {
  deletedCount: 0,
  preservedCount: 0,
  blockerCounts: {},
  cascadeDeletedCounts: { versions: 0, decisions: 0, auditEvents: 0 },
} as const;

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue(SUCCESS_RESULT);
  for (const k of ENV_KEYS) delete process.env[k];
  _resetNotePromotionsRetentionCronForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  _resetNotePromotionsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 20:00 UTC (slot 18 of the ladder)", () => {
    expect(DEFAULT_NOTE_PROMOTIONS_RETENTION_CRON_EXPR).toBe("0 20 * * *");
  });
  it("default retention is 90 days (matches publish-requests + approval-steps)", () => {
    expect(DEFAULT_NOTE_PROMOTIONS_RETENTION_DAYS).toBe(90);
  });
});

describe("tickNotePromotionsRetentionCron — cron matching", () => {
  it("fires at 20:00 UTC default", async () => {
    const state = STATE();
    const result = await tickNotePromotionsRetentionCron({
      now: new Date("2026-05-12T20:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips publish-requests slot (18:00 UTC)", async () => {
    const state = STATE();
    const result = await tickNotePromotionsRetentionCron({
      now: new Date("2026-05-12T18:00:00Z"),
      state,
    });
    expect(result.skippedReason).toBe("no_match");
  });

  it("skips approval-steps slot (19:00 UTC)", async () => {
    const state = STATE();
    const result = await tickNotePromotionsRetentionCron({
      now: new Date("2026-05-12T19:00:00Z"),
      state,
    });
    expect(result.skippedReason).toBe("no_match");
  });
});

describe("tickNotePromotionsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_NOTE_PROMOTIONS_RETENTION_CRON_DISABLED = "1";
    const result = await tickNotePromotionsRetentionCron({
      now: new Date("2026-05-12T20:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_NOTE_PROMOTIONS_RETENTION_DAYS env override", async () => {
    process.env.AGS_NOTE_PROMOTIONS_RETENTION_DAYS = "30";
    const state = STATE();
    await tickNotePromotionsRetentionCron({
      now: new Date("2026-05-12T20:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-04-12T20:00:00.000Z");
  });
});

describe("tickNotePromotionsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.promotionKind (scalar)", async () => {
    const state = STATE();
    await tickNotePromotionsRetentionCron({
      now: new Date("2026-05-12T20:00:00Z"),
      state,
      sweepInput: { olderThan: new Date(0), promotionKind: "auto" },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].promotionKind).toBe("auto");
  });

  it("forwards sweepInput.promotionKind (array)", async () => {
    const state = STATE();
    await tickNotePromotionsRetentionCron({
      now: new Date("2026-05-12T20:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        promotionKind: ["auto", "manual"],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].promotionKind).toEqual(["auto", "manual"]);
  });
});

describe("tickNotePromotionsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T20:00:00Z");
    const a = await tickNotePromotionsRetentionCron({ now, state, log: () => {} });
    const b = await tickNotePromotionsRetentionCron({ now, state, log: () => {} });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
  });

  it("swallows sweep failures and surfaces lastError via getter", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const state = STATE();
    await tickNotePromotionsRetentionCron({
      now: new Date("2026-05-12T20:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getNotePromotionsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getNotePromotionsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult + cascade counts after success", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedCount: 13,
      preservedCount: 2,
      blockerCounts: { ACTIVE_PROMOTION_VERSION: 2 },
      cascadeDeletedCounts: { versions: 26, decisions: 13, auditEvents: 41 },
    });
    const state = STATE();
    await tickNotePromotionsRetentionCron({
      now: new Date("2026-05-12T20:00:00Z"),
      state,
      log: () => {},
    });
    const s = getNotePromotionsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T20:00:00.000Z");
    expect(s.lastResult?.deletedCount).toBe(13);
    expect(s.lastResult?.cascadeDeletedCounts).toEqual({
      versions: 26,
      decisions: 13,
      auditEvents: 41,
    });
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureNotePromotionsRetentionCronStarted();
      ensureNotePromotionsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
