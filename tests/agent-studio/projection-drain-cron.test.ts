/**
 * Graph Projection Queue Drain Cron lockstep.
 *
 * Source-scan + behavioral tests covering:
 *   - The cron wraps `drainPendingProjectionJobs` via `makeRetentionCron`
 *   - `*\/5 * * * *` (every 5 minutes) is the default schedule
 *   - `AGS_PROJECTION_DRAIN` is the env-var prefix
 *   - `null` retention envelope (drain is processing, not pruning)
 *   - Boot wires `ensureProjectionDrainCronStarted`
 *   - Tick threads sweepInput.runDrain through to the orchestrator
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  DEFAULT_PROJECTION_DRAIN_CRON_EXPR,
  _resetProjectionDrainCronForTests,
  getProjectionDrainCronStatus,
  tickProjectionDrainCron,
} from "../../server/agent-studio/services/graph/projection/queue-drain-cron.js";
import type { DrainOptions, DrainSummary } from "../../server/agent-studio/services/graph/projection/queue-drain.js";

const cronPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/queue-drain-cron.ts",
);
const bootPath = resolve(
  __dirname,
  "../../server/agent-studio/boot.ts",
);

describe("queue-drain-cron — module shape (source scan)", () => {
  const src = readFileSync(cronPath, "utf8");

  it("uses the shared makeRetentionCron factory", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*makeRetentionCron[\s\S]*?\}\s*from\s*["'][^"']*retention\/make-retention-cron/,
    );
  });

  it("composes drainPendingProjectionJobs as its runSweep", () => {
    expect(src).toContain("drainPendingProjectionJobs");
  });

  it("has a null retention envelope (processing, not pruning)", () => {
    expect(src).toContain("defaultRetentionDays: null");
  });

  it("default cron expression is every 5 minutes", () => {
    expect(src).toContain('defaultCronExpr: "*/5 * * * *"');
  });

  it("env prefix follows the AGS_PROJECTION_DRAIN pattern", () => {
    expect(src).toContain('envPrefix: "AGS_PROJECTION_DRAIN"');
  });

  it("exports the canonical retention-cron module surface", () => {
    expect(src).toContain("tickProjectionDrainCron");
    expect(src).toContain("getProjectionDrainCronStatus");
    expect(src).toContain("ensureProjectionDrainCronStarted");
    expect(src).toContain("_resetProjectionDrainCronForTests");
  });
});

describe("queue-drain-cron — boot wiring", () => {
  const src = readFileSync(bootPath, "utf8");

  it("boot.ts lazy-imports + calls ensureProjectionDrainCronStarted", () => {
    expect(src).toContain("ensureProjectionDrainCronStarted");
    expect(src).toMatch(
      /await import\(\s*["'][^"']*queue-drain-cron["']\s*\)/,
    );
  });

  it("boot wires the drain cron AFTER the staleness cron (preserves daily-sweep order)", () => {
    const stalenessIdx = src.indexOf("ensureProjectionStalenessCronStarted");
    const drainIdx = src.indexOf("ensureProjectionDrainCronStarted");
    expect(stalenessIdx).toBeGreaterThan(-1);
    expect(drainIdx).toBeGreaterThan(stalenessIdx);
  });

  it("boot guards the cron start with a try/catch (matches staleness pattern)", () => {
    expect(src).toMatch(
      /try\s*\{[\s\S]*?ensureProjectionDrainCronStarted\(\)[\s\S]*?\}\s*catch/,
    );
  });
});

describe("queue-drain-cron — behavior", () => {
  beforeEach(() => {
    _resetProjectionDrainCronForTests();
  });

  it("DEFAULT_PROJECTION_DRAIN_CRON_EXPR matches the configured schedule", () => {
    expect(DEFAULT_PROJECTION_DRAIN_CRON_EXPR).toBe("*/5 * * * *");
  });

  // The cron schedule "*/5 * * * *" matches minute 0/5/10/.../55 only.
  // All behavioral tests pass an explicit `now` aligned to a 5-minute
  // boundary so the cron expression actually matches; otherwise tick
  // skips with `skippedReason: "no_match"`.
  const NOW_ALIGNED = new Date("2026-05-18T12:00:00Z");

  it("tick threads sweepInput.runDrain through to the orchestrator", async () => {
    const stubSummary: DrainSummary = {
      processed: 3,
      completed: 2,
      failed: 1,
      unknownEventKind: 0,
      outcomes: [],
    };
    const runDrain = vi.fn(
      async (_opts: DrainOptions): Promise<DrainSummary> => stubSummary,
    );

    const result = await tickProjectionDrainCron({
      now: NOW_ALIGNED,
      sweepInput: { runDrain, limit: 25 },
    });

    expect(result.fired).toBe(true);
    expect(runDrain).toHaveBeenCalledOnce();
    expect(runDrain.mock.calls[0]![0]).toEqual({ limit: 25 });
    expect(result.result).toMatchObject({
      processed: 3,
      completed: 2,
      failed: 1,
      unknownEventKind: 0,
    });
  });

  it("tick result carries drainedAt timestamp", async () => {
    const result = await tickProjectionDrainCron({
      now: NOW_ALIGNED,
      sweepInput: {
        runDrain: async () => ({
          processed: 0,
          completed: 0,
          failed: 0,
          unknownEventKind: 0,
          outcomes: [],
        }),
      },
    });
    expect(typeof result.result?.drainedAt).toBe("string");
    expect(result.result?.drainedAt).toMatch(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("getStatus reports lastRunAt + lastResult after a tick", async () => {
    await tickProjectionDrainCron({
      now: NOW_ALIGNED,
      sweepInput: {
        runDrain: async () => ({
          processed: 0,
          completed: 0,
          failed: 0,
          unknownEventKind: 0,
          outcomes: [],
        }),
      },
    });
    const status = getProjectionDrainCronStatus();
    expect(status.lastRunAt).not.toBeNull();
    expect(status.lastResult).not.toBeNull();
  });

  it("tick skips with `no_match` when `now` falls off the 5-minute boundary", async () => {
    const offBoundary = new Date("2026-05-18T12:02:00Z");
    const runDrain = vi.fn();
    const result = await tickProjectionDrainCron({
      now: offBoundary,
      sweepInput: { runDrain: runDrain as never },
    });
    expect(result.fired).toBe(false);
    expect(result.skippedReason).toBe("no_match");
    expect(runDrain).not.toHaveBeenCalled();
  });
});
