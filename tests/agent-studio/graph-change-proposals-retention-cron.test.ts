/**
 * Phase 22 follow-up #674 — graph-change-proposals retention cron.
 * Factory-backed via makeRetentionCron({...}) (#642). 14th slot in
 * the daily-sweep ladder (16:00 UTC).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/graph-change-proposals-retention.js",
  () => ({ pruneOldGraphChangeProposals: sweepMock }),
);

import {
  DEFAULT_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_EXPR,
  DEFAULT_GRAPH_CHANGE_PROPOSALS_RETENTION_DAYS,
  tickGraphChangeProposalsRetentionCron,
  getGraphChangeProposalsRetentionCronStatus,
  _resetGraphChangeProposalsRetentionCronForTests,
  ensureGraphChangeProposalsRetentionCronStarted,
} from "../../server/agent-studio/services/graph-change-proposals-retention-cron";

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
    deletedItemsCount: 0,
    deletedDecisionsCount: 0,
    deletedAuditEventsCount: 0,
  });
  delete process.env.AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_DAYS;
  _resetGraphChangeProposalsRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_DAYS;
  _resetGraphChangeProposalsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 16:00 UTC", () => {
    expect(DEFAULT_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_EXPR).toBe(
      "0 16 * * *",
    );
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_GRAPH_CHANGE_PROPOSALS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickGraphChangeProposalsRetentionCron — cron matching", () => {
  it("fires at 16:00 UTC default", async () => {
    const state = STATE();
    const result = await tickGraphChangeProposalsRetentionCron({
      now: new Date("2026-05-13T16:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 13 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      const result = await tickGraphChangeProposalsRetentionCron({
        now: new Date(
          `2026-05-13T${hr.toString().padStart(2, "0")}:00:00Z`,
        ),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickGraphChangeProposalsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_DISABLED = "1";
    const result = await tickGraphChangeProposalsRetentionCron({
      now: new Date("2026-05-13T16:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_DAYS env override", async () => {
    process.env.AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickGraphChangeProposalsRetentionCron({
      now: new Date("2026-05-13T16:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-06T16:00:00.000Z");
  });
});

describe("tickGraphChangeProposalsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.proposalKind + statuses", async () => {
    const state = STATE();
    await tickGraphChangeProposalsRetentionCron({
      now: new Date("2026-05-13T16:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        proposalKind: ["entity_merge"],
        statuses: ["approved"],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].proposalKind).toEqual(["entity_merge"]);
    expect(sweepMock.mock.calls[0][0].statuses).toEqual(["approved"]);
  });
});

describe("tickGraphChangeProposalsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-13T16:00:00Z");
    const a = await tickGraphChangeProposalsRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickGraphChangeProposalsRetentionCron({
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
    await tickGraphChangeProposalsRetentionCron({
      now: new Date("2026-05-13T16:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getGraphChangeProposalsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getGraphChangeProposalsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedProposalsCount: 3,
      deletedItemsCount: 7,
      deletedDecisionsCount: 2,
      deletedAuditEventsCount: 11,
    });
    const state = STATE();
    await tickGraphChangeProposalsRetentionCron({
      now: new Date("2026-05-13T16:00:00Z"),
      state,
      log: () => {},
    });
    const s = getGraphChangeProposalsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-13T16:00:00.000Z");
    expect(s.lastResult?.deletedProposalsCount).toBe(3);
    expect(s.lastResult?.deletedItemsCount).toBe(7);
    expect(s.lastResult?.deletedDecisionsCount).toBe(2);
    expect(s.lastResult?.deletedAuditEventsCount).toBe(11);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureGraphChangeProposalsRetentionCronStarted();
      ensureGraphChangeProposalsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
