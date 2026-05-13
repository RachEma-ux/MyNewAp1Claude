/**
 * Phase 22 follow-up #677 — graph-agent runtime-traces retention
 * cron. Factory-backed via makeRetentionCron({...}) (#642). 15th
 * slot in the daily-sweep ladder (17:00 UTC). 90-day default
 * retention (matches the existing pruneRuntimeTraces service's
 * DEFAULT_HORIZON_MS).
 *
 * Adapter detail: the existing prune service uses
 * `olderThanMs: number` (Phase 14 §3 shape) rather than the
 * standard `olderThan: Date` cutoff. The factory's buildSweepInput
 * callback converts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/graph-agent/retention.js",
  () => ({ pruneRuntimeTraces: sweepMock }),
);

import {
  DEFAULT_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR,
  DEFAULT_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS,
  tickGraphAgentRuntimeTracesRetentionCron,
  getGraphAgentRuntimeTracesRetentionCronStatus,
  _resetGraphAgentRuntimeTracesRetentionCronForTests,
  ensureGraphAgentRuntimeTracesRetentionCronStarted,
} from "../../server/agent-studio/services/graph-agent/retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({
    cutoff: new Date(0),
    graphSkillRuntimeUsages: 0,
    queryTemplateRuns: 0,
    graphAgentSteps: 0,
    graphAgentRuns: 0,
  });
  delete process.env.AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS;
  _resetGraphAgentRuntimeTracesRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_DISABLED;
  delete process.env.AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR;
  delete process.env.AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS;
  _resetGraphAgentRuntimeTracesRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 17:00 UTC", () => {
    expect(DEFAULT_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR).toBe(
      "0 17 * * *",
    );
  });
  it("default retention is 90 days", () => {
    expect(DEFAULT_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS).toBe(90);
  });
});

describe("tickGraphAgentRuntimeTracesRetentionCron — cron matching", () => {
  it("fires at 17:00 UTC default", async () => {
    const state = STATE();
    const result = await tickGraphAgentRuntimeTracesRetentionCron({
      now: new Date("2026-05-13T17:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the prior 14 daily-sweep slots", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      const result = await tickGraphAgentRuntimeTracesRetentionCron({
        now: new Date(
          `2026-05-13T${hr.toString().padStart(2, "0")}:00:00Z`,
        ),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("buildSweepInput — Date → olderThanMs adapter", () => {
  // The cron factory computes `olderThan = cronNow - retentionDays*ms`.
  // The buildSweepInput adapter computes `olderThanMs = Date.now() -
  // olderThan.getTime()`. In production `cronNow ≈ Date.now()` so the
  // result is `~retentionDays*ms`. In these tests, `cronNow` is a
  // fixed test-injected Date (which may differ from real Date.now() by
  // hours/days), so the absolute value can drift. We instead assert
  // the structural shape: olderThanMs is a positive number that
  // INCREASES when retentionDays increases (default 90 vs override 7).
  it("converts olderThan Date into a positive olderThanMs (Phase 14 §3 shape)", async () => {
    const state = STATE();
    await tickGraphAgentRuntimeTracesRetentionCron({
      now: new Date("2026-05-13T17:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(typeof arg.olderThanMs).toBe("number");
    expect(arg.olderThanMs).toBeGreaterThan(0);
  });

  it("honors AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS env override (smaller days → smaller olderThanMs)", async () => {
    // Baseline at 90 days (default).
    const sBaseline = STATE();
    await tickGraphAgentRuntimeTracesRetentionCron({
      now: new Date("2026-05-13T17:00:00Z"),
      state: sBaseline,
      log: () => {},
    });
    const baseline = sweepMock.mock.calls[0][0].olderThanMs;

    // Override to 7 days.
    sweepMock.mockClear();
    _resetGraphAgentRuntimeTracesRetentionCronForTests();
    process.env.AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS = "7";
    const sOverride = STATE();
    await tickGraphAgentRuntimeTracesRetentionCron({
      now: new Date("2026-05-13T17:00:00Z"),
      state: sOverride,
      log: () => {},
    });
    const overridden = sweepMock.mock.calls[0][0].olderThanMs;

    // 7 days < 90 days, so overridden < baseline by ~83 days in ms.
    expect(overridden).toBeLessThan(baseline);
    expect(baseline - overridden).toBeGreaterThan(82 * 86_400_000);
    expect(baseline - overridden).toBeLessThan(84 * 86_400_000);
  });
});

describe("tickGraphAgentRuntimeTracesRetentionCron — env disable", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_DISABLED = "1";
    const result = await tickGraphAgentRuntimeTracesRetentionCron({
      now: new Date("2026-05-13T17:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });
});

describe("tickGraphAgentRuntimeTracesRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-13T17:00:00Z");
    const a = await tickGraphAgentRuntimeTracesRetentionCron({
      now,
      state,
      log: () => {},
    });
    const b = await tickGraphAgentRuntimeTracesRetentionCron({
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
    await tickGraphAgentRuntimeTracesRetentionCron({
      now: new Date("2026-05-13T17:00:00Z"),
      state,
      warn: () => {},
    });
    expect(
      getGraphAgentRuntimeTracesRetentionCronStatus(state).lastError,
    ).toBe("ASDB unreachable");
  });
});

describe("status snapshot + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({
      cutoff: new Date("2026-02-12T17:00:00Z"),
      graphSkillRuntimeUsages: 5,
      queryTemplateRuns: 12,
      graphAgentSteps: 88,
      graphAgentRuns: 19,
    });
    const state = STATE();
    await tickGraphAgentRuntimeTracesRetentionCron({
      now: new Date("2026-05-13T17:00:00Z"),
      state,
      log: () => {},
    });
    const s = getGraphAgentRuntimeTracesRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-13T17:00:00.000Z");
    expect(s.lastResult?.graphSkillRuntimeUsages).toBe(5);
    expect(s.lastResult?.queryTemplateRuns).toBe(12);
    expect(s.lastResult?.graphAgentSteps).toBe(88);
    expect(s.lastResult?.graphAgentRuns).toBe(19);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureGraphAgentRuntimeTracesRetentionCronStarted();
      ensureGraphAgentRuntimeTracesRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
