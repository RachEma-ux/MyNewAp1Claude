/**
 * Phase 22 follow-up #662 — graph-correction-proposals retention cron.
 * Factory-backed via makeRetentionCron({...}) (#642).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/graph-correction-proposals-retention.js",
  () => ({ pruneOldGraphCorrectionProposals: sweepMock }),
);

import {
  DEFAULT_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_EXPR,
  DEFAULT_GRAPH_CORRECTION_PROPOSALS_RETENTION_DAYS,
  tickGraphCorrectionProposalsRetentionCron,
  getGraphCorrectionProposalsRetentionCronStatus,
  _resetGraphCorrectionProposalsRetentionCronForTests,
  ensureGraphCorrectionProposalsRetentionCronStarted,
} from "../../server/agent-studio/services/graph-correction-proposals-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({
    deletedProposalsCount: 0,
    deletedDecisionsCount: 0,
    deletedAuditEventsCount: 0,
  });
  delete process.env.AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_DAYS;
  _resetGraphCorrectionProposalsRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_DAYS;
  _resetGraphCorrectionProposalsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 13:00 UTC", () => {
    expect(DEFAULT_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_EXPR).toBe(
      "0 13 * * *",
    );
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_GRAPH_CORRECTION_PROPOSALS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickGraphCorrectionProposalsRetentionCron — cron matching", () => {
  it("fires at 13:00 UTC default", async () => {
    const state = STATE();
    const result = await tickGraphCorrectionProposalsRetentionCron({
      now: new Date("2026-05-12T13:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 10 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const result = await tickGraphCorrectionProposalsRetentionCron({
        now: new Date(
          `2026-05-12T${hr.toString().padStart(2, "0")}:00:00Z`,
        ),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickGraphCorrectionProposalsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_DISABLED = "1";
    const result = await tickGraphCorrectionProposalsRetentionCron({
      now: new Date("2026-05-12T13:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_DAYS env override", async () => {
    process.env.AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickGraphCorrectionProposalsRetentionCron({
      now: new Date("2026-05-12T13:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T13:00:00.000Z");
  });
});

describe("tickGraphCorrectionProposalsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.proposalKind + targetTypeKey + statuses", async () => {
    const state = STATE();
    await tickGraphCorrectionProposalsRetentionCron({
      now: new Date("2026-05-12T13:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        proposalKind: ["rename-entity"],
        targetTypeKey: ["entity"],
        statuses: ["applied"],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].proposalKind).toEqual(["rename-entity"]);
    expect(sweepMock.mock.calls[0][0].targetTypeKey).toEqual(["entity"]);
    expect(sweepMock.mock.calls[0][0].statuses).toEqual(["applied"]);
  });
});

describe("tickGraphCorrectionProposalsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T13:00:00Z");
    const a = await tickGraphCorrectionProposalsRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickGraphCorrectionProposalsRetentionCron({
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
    await tickGraphCorrectionProposalsRetentionCron({
      now: new Date("2026-05-12T13:00:00Z"),
      state,
      warn: () => {},
    });
    expect(
      getGraphCorrectionProposalsRetentionCronStatus(state).lastError,
    ).toBe("ASDB unreachable");
  });
});

describe("getGraphCorrectionProposalsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedProposalsCount: 7,
      deletedDecisionsCount: 12,
      deletedAuditEventsCount: 88,
    });
    const state = STATE();
    await tickGraphCorrectionProposalsRetentionCron({
      now: new Date("2026-05-12T13:00:00Z"),
      state,
      log: () => {},
    });
    const s = getGraphCorrectionProposalsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T13:00:00.000Z");
    expect(s.lastResult?.deletedProposalsCount).toBe(7);
    expect(s.lastResult?.deletedDecisionsCount).toBe(12);
    expect(s.lastResult?.deletedAuditEventsCount).toBe(88);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureGraphCorrectionProposalsRetentionCronStarted();
      ensureGraphCorrectionProposalsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
