/**
 * Phase 22 §T-I.47 — Projection staleness cron lockstep.
 *
 * Source-scan + behavior tests for the `makeRetentionCron`-wrapped
 * staleness scanner. Closes the schedule half of kind #7.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  DEFAULT_PROJECTION_STALENESS_CRON_EXPR,
  _resetProjectionStalenessCronForTests,
  getProjectionStalenessCronStatus,
  tickProjectionStalenessCron,
} from "../../server/agent-studio/services/graph/projection/staleness-cron.js";

const cronPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/staleness-cron.ts",
);

describe("staleness-cron — module shape (source scan)", () => {
  const src = readFileSync(cronPath, "utf8");

  it("uses the shared makeRetentionCron factory", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*makeRetentionCron[\s\S]*?\}\s*from\s*["'][^"']*retention\/make-retention-cron/,
    );
  });

  it("composes `loadStalenessRowsFromAsDb` and `runStalenessCheck`", () => {
    expect(src).toContain("loadStalenessRowsFromAsDb");
    expect(src).toContain("runStalenessCheck");
  });

  it("has a null retention envelope (scan-only)", () => {
    expect(src).toContain("defaultRetentionDays: null");
  });

  it("default cron expression is 04:15 UTC daily", () => {
    expect(src).toContain('defaultCronExpr: "15 4 * * *"');
  });

  it("env prefix follows the AGS_PROJECTION_STALENESS pattern", () => {
    expect(src).toContain('envPrefix: "AGS_PROJECTION_STALENESS"');
  });
});

describe("staleness-cron — behavior", () => {
  beforeEach(() => {
    _resetProjectionStalenessCronForTests();
  });

  it("default cron expression export matches the source", () => {
    expect(DEFAULT_PROJECTION_STALENESS_CRON_EXPR).toBe("15 4 * * *");
  });

  it("tick returns a structured result via injected sweepInput.fetchRows", async () => {
    const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");
    const old = new Date(FROZEN_NOW.getTime() - 4 * 60 * 60 * 1000);
    const fetchRows = vi.fn(async () => [
      { id: 1, projectionKey: "a", status: "succeeded", completedAt: old },
      { id: 2, projectionKey: "b", status: "succeeded", completedAt: FROZEN_NOW },
      { id: 3, projectionKey: "c", status: "failed", completedAt: null },
    ]);
    const result = await tickProjectionStalenessCron({
      sweepInput: { fetchRows },
    });
    expect(result.ran).toBe(true);
    expect(result.result?.staleCount).toBe(1);
    expect(result.result?.neverSucceededCount).toBe(1);
    expect(result.result?.freshCount).toBe(1);
    expect(result.result?.distinctProjectionCount).toBe(3);
  });

  it("getStatus reports lastRunAt + lastResult after a tick", async () => {
    const fetchRows = vi.fn(async () => []);
    await tickProjectionStalenessCron({ sweepInput: { fetchRows } });
    const status = getProjectionStalenessCronStatus();
    expect(status.lastRunAt).not.toBeNull();
    expect(status.lastResult).not.toBeNull();
  });
});
