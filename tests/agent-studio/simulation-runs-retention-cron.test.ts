/**
 * Phase 22 follow-up #650 — simulation-runs retention cron.
 * Factory-backed module — exercises the makeRetentionCron({...}) wiring (#642).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/simulation-runs-retention.js",
  () => ({ pruneOldSimulationRuns: sweepMock }),
);

import {
  DEFAULT_SIMULATION_RUNS_RETENTION_CRON_EXPR,
  DEFAULT_SIMULATION_RUNS_RETENTION_DAYS,
  tickSimulationRunsRetentionCron,
  getSimulationRunsRetentionCronStatus,
  _resetSimulationRunsRetentionCronForTests,
  ensureSimulationRunsRetentionCronStarted,
} from "../../server/agent-studio/services/simulation-runs-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ deletedRunsCount: 0, deletedStepsCount: 0 });
  delete process.env.AGS_SIMULATION_RUNS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_SIMULATION_RUNS_RETENTION_CRON_EXPR;
  delete process.env.AGS_SIMULATION_RUNS_RETENTION_DAYS;
  _resetSimulationRunsRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_SIMULATION_RUNS_RETENTION_CRON_DISABLED;
  delete process.env.AGS_SIMULATION_RUNS_RETENTION_CRON_EXPR;
  delete process.env.AGS_SIMULATION_RUNS_RETENTION_DAYS;
  _resetSimulationRunsRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 10:00 UTC", () => {
    expect(DEFAULT_SIMULATION_RUNS_RETENTION_CRON_EXPR).toBe("0 10 * * *");
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_SIMULATION_RUNS_RETENTION_DAYS).toBe(30);
  });
});

describe("tickSimulationRunsRetentionCron — cron matching", () => {
  it("fires at 10:00 UTC default", async () => {
    const state = STATE();
    const result = await tickSimulationRunsRetentionCron({
      now: new Date("2026-05-12T10:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 7 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8, 9]) {
      const result = await tickSimulationRunsRetentionCron({
        now: new Date(`2026-05-12T0${hr}:00:00Z`),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickSimulationRunsRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_SIMULATION_RUNS_RETENTION_CRON_DISABLED = "1";
    const result = await tickSimulationRunsRetentionCron({
      now: new Date("2026-05-12T10:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_SIMULATION_RUNS_RETENTION_DAYS env override", async () => {
    process.env.AGS_SIMULATION_RUNS_RETENTION_DAYS = "7";
    const state = STATE();
    await tickSimulationRunsRetentionCron({
      now: new Date("2026-05-12T10:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T10:00:00.000Z");
  });
});

describe("tickSimulationRunsRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.agentId + scenarioId + statuses", async () => {
    const state = STATE();
    await tickSimulationRunsRetentionCron({
      now: new Date("2026-05-12T10:00:00Z"),
      state,
      sweepInput: {
        olderThan: new Date(0),
        agentId: [11],
        scenarioId: [99],
        statuses: ["passed"],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].agentId).toEqual([11]);
    expect(sweepMock.mock.calls[0][0].scenarioId).toEqual([99]);
    expect(sweepMock.mock.calls[0][0].statuses).toEqual(["passed"]);
  });
});

describe("tickSimulationRunsRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T10:00:00Z");
    const a = await tickSimulationRunsRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickSimulationRunsRetentionCron({
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
    await tickSimulationRunsRetentionCron({
      now: new Date("2026-05-12T10:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getSimulationRunsRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getSimulationRunsRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({
      deletedRunsCount: 42,
      deletedStepsCount: 137,
    });
    const state = STATE();
    await tickSimulationRunsRetentionCron({
      now: new Date("2026-05-12T10:00:00Z"),
      state,
      log: () => {},
    });
    const s = getSimulationRunsRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T10:00:00.000Z");
    expect(s.lastResult?.deletedRunsCount).toBe(42);
    expect(s.lastResult?.deletedStepsCount).toBe(137);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureSimulationRunsRetentionCronStarted();
      ensureSimulationRunsRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
