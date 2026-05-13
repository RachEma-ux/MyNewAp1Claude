/**
 * Graph health-alert cron — V1+ Phase J-1-β tests.
 *
 * Covers:
 *   - default cron expression is `* /5 * * * *` (every 5 minutes)
 *   - tick fires on a 5-minute boundary, skips off-boundary
 *   - dedup within a minute key
 *   - env disable flag respected (`= 1`, `= true`)
 *   - env expr override
 *   - status getter surfaces decision/raised/resolved counts
 *   - scanner failure captured on lastError without advancing
 *     lastRunAt/lastResult; cleared on next success (factory
 *     contract — same as drift cron + 18 retention crons).
 *   - source-scan boundary: no neo4j-driver import (the cron must
 *     only reach the backend through GraphRepository in
 *     `runHealthAlertScan`).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HEALTH_ALERT_CRON_EXPR,
  _resetHealthAlertCronForTests,
  getHealthAlertCronStatus,
  tickHealthAlertCron,
  type HealthAlertCronEnsureState,
  type HealthAlertCronInput,
} from "../../server/agent-studio/services/graph/health-alert-cron.js";

const STATE = (): HealthAlertCronEnsureState => ({
  lastRunMinuteKey: null,
  lastRunAt: null,
  lastResult: null,
  lastError: null,
});

beforeEach(() => {
  delete process.env.AGS_GRAPH_HEALTH_ALERT_CRON_DISABLED;
  delete process.env.AGS_GRAPH_HEALTH_ALERT_CRON_EXPR;
  _resetHealthAlertCronForTests();
});

afterEach(() => {
  delete process.env.AGS_GRAPH_HEALTH_ALERT_CRON_DISABLED;
  delete process.env.AGS_GRAPH_HEALTH_ALERT_CRON_EXPR;
  _resetHealthAlertCronForTests();
});

const HEALTHY_REPORT = {
  scope: "default",
  scannedAt: "2026-05-13T00:05:00.000Z",
  status: "healthy" as const,
  latencyMs: 42,
  decisions: [],
  persisted: { raised: 0, resolved: 0 },
};

function makeInput(
  overrides: Partial<HealthAlertCronInput> = {},
): HealthAlertCronInput {
  return {
    scope: "default",
    runScan: vi.fn(async () => HEALTHY_REPORT),
    ...overrides,
  };
}

describe("module defaults", () => {
  it("default cron expression is */5 * * * *", () => {
    expect(DEFAULT_HEALTH_ALERT_CRON_EXPR).toBe("*/5 * * * *");
  });
});

describe("tickHealthAlertCron — cron matching", () => {
  it("fires at a 5-minute boundary (00:05 UTC)", async () => {
    const state = STATE();
    const sweepInput = makeInput();
    const result = await tickHealthAlertCron({
      now: new Date("2026-05-13T00:05:00Z"),
      state,
      sweepInput,
      log: () => {},
    });
    expect(result.fired).toBe(true);
    expect(result.result?.status).toBe("healthy");
    expect(result.result?.latencyMs).toBe(42);
    expect(result.result?.decisionCount).toBe(0);
  });

  it("skips off-boundary at 00:07 UTC", async () => {
    const state = STATE();
    const result = await tickHealthAlertCron({
      now: new Date("2026-05-13T00:07:00Z"),
      state,
      sweepInput: makeInput(),
    });
    expect(result.skippedReason).toBe("no_match");
  });

  it("dedups within the same minute key", async () => {
    const state = STATE();
    const sweepInput = makeInput();
    await tickHealthAlertCron({
      now: new Date("2026-05-13T00:05:00Z"),
      state,
      sweepInput,
      log: () => {},
    });
    const second = await tickHealthAlertCron({
      now: new Date("2026-05-13T00:05:30Z"),
      state,
      sweepInput,
      log: () => {},
    });
    expect(second.skippedReason).toBe("deduped");
  });
});

describe("tickHealthAlertCron — env disable", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_GRAPH_HEALTH_ALERT_CRON_DISABLED = "1";
    const result = await tickHealthAlertCron({
      now: new Date("2026-05-13T00:05:00Z"),
      sweepInput: makeInput(),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("returns disabled when env var = true", async () => {
    process.env.AGS_GRAPH_HEALTH_ALERT_CRON_DISABLED = "true";
    const result = await tickHealthAlertCron({
      now: new Date("2026-05-13T00:05:00Z"),
      sweepInput: makeInput(),
    });
    expect(result.skippedReason).toBe("disabled");
  });
});

describe("tickHealthAlertCron — env expr override", () => {
  it("honors AGS_GRAPH_HEALTH_ALERT_CRON_EXPR", async () => {
    process.env.AGS_GRAPH_HEALTH_ALERT_CRON_EXPR = "15 6 * * *";
    const state = STATE();
    const result = await tickHealthAlertCron({
      now: new Date("2026-05-13T06:15:00Z"),
      state,
      sweepInput: makeInput(),
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });
});

describe("tickHealthAlertCron — scanner result", () => {
  it("surfaces decision/raised/resolved counts from a degraded scan", async () => {
    const state = STATE();
    const result = await tickHealthAlertCron({
      now: new Date("2026-05-13T00:05:00Z"),
      state,
      log: () => {},
      warn: () => {},
      sweepInput: makeInput({
        runScan: vi.fn(async () => ({
          scope: "default",
          scannedAt: "2026-05-13T00:05:00.000Z",
          status: "degraded",
          latencyMs: 900,
          decisions: [
            {
              alertKey: "graph_health_degraded",
              severity: "warning",
              scope: "default",
              observedValue: { status: "degraded", errors: ["slow"] },
              threshold: { expectedStatus: "healthy" },
            },
            {
              alertKey: "graph_health_latency_high",
              severity: "warning",
              scope: "default",
              observedValue: { latencyMs: 900 },
              threshold: { latencyWarnMs: 750, latencyCriticalMs: 2000 },
            },
          ],
          persisted: { raised: 2, resolved: 1 },
        })),
      }),
    });
    expect(result.fired).toBe(true);
    expect(result.result?.status).toBe("degraded");
    expect(result.result?.decisionCount).toBe(2);
    expect(result.result?.raised).toBe(2);
    expect(result.result?.resolved).toBe(1);
  });
});

describe("tickHealthAlertCron — error handling", () => {
  it("captures scanner failure on lastError without advancing lastRunAt/lastResult", async () => {
    const state = STATE();
    const result = await tickHealthAlertCron({
      now: new Date("2026-05-13T00:05:00Z"),
      state,
      log: () => {},
      warn: () => {},
      sweepInput: makeInput({
        runScan: vi.fn(async () => {
          throw new Error("neo4j connection refused");
        }),
      }),
    });
    expect(result.skippedReason).toBe("swept_error");
    expect(state.lastError).toMatch(/neo4j connection refused/);
    expect(state.lastRunAt).toBeNull();
    expect(state.lastResult).toBeNull();
  });

  it("clears lastError on the next successful tick", async () => {
    const state = STATE();
    state.lastError = "prior failure";
    await tickHealthAlertCron({
      now: new Date("2026-05-13T00:05:00Z"),
      state,
      log: () => {},
      sweepInput: makeInput(),
    });
    expect(state.lastError).toBeNull();
    expect(state.lastRunAt).toBeInstanceOf(Date);
    expect(state.lastResult?.decisionCount).toBe(0);
  });
});

describe("getHealthAlertCronStatus", () => {
  it("returns the in-memory state shape", () => {
    const state: HealthAlertCronEnsureState = {
      lastRunMinuteKey: "2026-05-13T00:05",
      lastRunAt: new Date("2026-05-13T00:05:00Z"),
      lastResult: {
        scope: "default",
        scannedAt: "2026-05-13T00:05:00.000Z",
        status: "healthy",
        latencyMs: 42,
        decisionCount: 0,
        raised: 0,
        resolved: 0,
      },
      lastError: null,
    };
    const status = getHealthAlertCronStatus(state);
    expect(status.lastRunAt).toBeInstanceOf(Date);
    expect(status.lastResult?.status).toBe("healthy");
    expect(status.lastResult?.decisionCount).toBe(0);
    expect(status.lastError).toBeNull();
  });
});

describe("boundary — health-alert-cron source", () => {
  it("does not import neo4j-driver (must reach backend via GraphRepository)", () => {
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph/health-alert-cron.ts",
      ),
      "utf8",
    );
    const code = src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join("\n");
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("composes runHealthAlertScan via the retention-cron factory", () => {
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph/health-alert-cron.ts",
      ),
      "utf8",
    );
    expect(/makeRetentionCron</.test(src)).toBe(true);
    expect(/runHealthAlertScan/.test(src)).toBe(true);
  });
});
