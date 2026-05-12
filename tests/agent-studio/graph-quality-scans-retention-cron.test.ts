/**
 * Phase 22 follow-up #658 — graph-quality-scans retention cron.
 * Factory-backed via makeRetentionCron({...}) (#642).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/graph-quality-scans-retention.js",
  () => ({ pruneOldGraphQualityScans: sweepMock }),
);

import {
  DEFAULT_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR,
  DEFAULT_GRAPH_QUALITY_SCANS_RETENTION_DAYS,
  tickGraphQualityScansRetentionCron,
  getGraphQualityScansRetentionCronStatus,
  _resetGraphQualityScansRetentionCronForTests,
  ensureGraphQualityScansRetentionCronStarted,
} from "../../server/agent-studio/services/graph-quality-scans-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({
    deletedScansCount: 0,
    deletedFindingsCount: 0,
  });
  delete process.env.AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_QUALITY_SCANS_RETENTION_DAYS;
  _resetGraphQualityScansRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_QUALITY_SCANS_RETENTION_DAYS;
  _resetGraphQualityScansRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 12:00 UTC", () => {
    expect(DEFAULT_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR).toBe(
      "0 12 * * *",
    );
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_GRAPH_QUALITY_SCANS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickGraphQualityScansRetentionCron — cron matching", () => {
  it("fires at 12:00 UTC default", async () => {
    const state = STATE();
    const result = await tickGraphQualityScansRetentionCron({
      now: new Date("2026-05-12T12:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 9 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const result = await tickGraphQualityScansRetentionCron({
        now: new Date(
          `2026-05-12T${hr.toString().padStart(2, "0")}:00:00Z`,
        ),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickGraphQualityScansRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_DISABLED = "1";
    const result = await tickGraphQualityScansRetentionCron({
      now: new Date("2026-05-12T12:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_GRAPH_QUALITY_SCANS_RETENTION_DAYS env override", async () => {
    process.env.AGS_GRAPH_QUALITY_SCANS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickGraphQualityScansRetentionCron({
      now: new Date("2026-05-12T12:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T12:00:00.000Z");
  });
});

describe("tickGraphQualityScansRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.scanKind + scope + statuses", async () => {
    const state = STATE();
    await tickGraphQualityScansRetentionCron({
      now: new Date("2026-05-12T12:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        scanKind: ["orphan-detector"],
        scope: ["workspace:11"],
        statuses: ["completed"],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].scanKind).toEqual(["orphan-detector"]);
    expect(sweepMock.mock.calls[0][0].scope).toEqual(["workspace:11"]);
    expect(sweepMock.mock.calls[0][0].statuses).toEqual(["completed"]);
  });
});

describe("tickGraphQualityScansRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T12:00:00Z");
    const a = await tickGraphQualityScansRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickGraphQualityScansRetentionCron({
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
    await tickGraphQualityScansRetentionCron({
      now: new Date("2026-05-12T12:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getGraphQualityScansRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getGraphQualityScansRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedScansCount: 4,
      deletedFindingsCount: 91,
    });
    const state = STATE();
    await tickGraphQualityScansRetentionCron({
      now: new Date("2026-05-12T12:00:00Z"),
      state,
      log: () => {},
    });
    const s = getGraphQualityScansRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T12:00:00.000Z");
    expect(s.lastResult?.deletedScansCount).toBe(4);
    expect(s.lastResult?.deletedFindingsCount).toBe(91);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureGraphQualityScansRetentionCronStarted();
      ensureGraphQualityScansRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
