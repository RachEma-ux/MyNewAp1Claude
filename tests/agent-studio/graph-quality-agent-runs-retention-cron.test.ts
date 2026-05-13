/**
 * Phase 22 follow-up #666 — graph-quality-agent-runs retention cron.
 * Factory-backed via makeRetentionCron({...}) (#642). 12th slot in
 * the daily-sweep ladder (14:00 UTC).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/graph-quality-agent-runs-retention.js",
  () => ({ pruneOldGraphQualityAgentRuns: sweepMock }),
);

import {
  DEFAULT_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR,
  DEFAULT_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS,
  tickGraphQualityAgentRunsRetentionCron,
  getGraphQualityAgentRunsRetentionCronStatus,
  _resetGraphQualityAgentRunsRetentionCronForTests,
  ensureGraphQualityAgentRunsRetentionCronStarted,
} from "../../server/agent-studio/services/graph-quality-agent-runs-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ deletedAgentRunsCount: 0 });
  delete process.env.AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS;
  _resetGraphQualityAgentRunsRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS;
  _resetGraphQualityAgentRunsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 14:00 UTC", () => {
    expect(DEFAULT_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR).toBe(
      "0 14 * * *",
    );
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickGraphQualityAgentRunsRetentionCron — cron matching", () => {
  it("fires at 14:00 UTC default", async () => {
    const state = STATE();
    const result = await tickGraphQualityAgentRunsRetentionCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 11 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      const result = await tickGraphQualityAgentRunsRetentionCron({
        now: new Date(
          `2026-05-12T${hr.toString().padStart(2, "0")}:00:00Z`,
        ),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickGraphQualityAgentRunsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_DISABLED = "1";
    const result = await tickGraphQualityAgentRunsRetentionCron({
      now: new Date("2026-05-12T14:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS env override", async () => {
    process.env.AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickGraphQualityAgentRunsRetentionCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T14:00:00.000Z");
  });
});

describe("tickGraphQualityAgentRunsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.agentKey + statuses", async () => {
    const state = STATE();
    await tickGraphQualityAgentRunsRetentionCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        agentKey: ["graph_quality_agent"],
        statuses: ["completed"],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].agentKey).toEqual([
      "graph_quality_agent",
    ]);
    expect(sweepMock.mock.calls[0][0].statuses).toEqual(["completed"]);
  });
});

describe("tickGraphQualityAgentRunsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T14:00:00Z");
    const a = await tickGraphQualityAgentRunsRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickGraphQualityAgentRunsRetentionCron({
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
    await tickGraphQualityAgentRunsRetentionCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getGraphQualityAgentRunsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getGraphQualityAgentRunsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({ deletedAgentRunsCount: 7 });
    const state = STATE();
    await tickGraphQualityAgentRunsRetentionCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      log: () => {},
    });
    const s = getGraphQualityAgentRunsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T14:00:00.000Z");
    expect(s.lastResult?.deletedAgentRunsCount).toBe(7);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureGraphQualityAgentRunsRetentionCronStarted();
      ensureGraphQualityAgentRunsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
