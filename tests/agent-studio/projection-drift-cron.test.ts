/**
 * Projection drift cron — strict-audit item #9 partial closure tests.
 *
 * Covers:
 *   - default cron expression is 04:30 UTC (slot #19 in the ladder).
 *   - tick fires at 04:30, skips otherwise.
 *   - env disable flag respected.
 *   - precomputed input + injected scanner exercises the full path.
 *   - drift counts surface on the cron status getter.
 *   - failed scanner is captured on `lastError`; lastRunAt/lastResult
 *     advance only on success (factory contract).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PROJECTION_DRIFT_CRON_EXPR,
  _resetProjectionDriftCronForTests,
  getProjectionDriftCronStatus,
  tickProjectionDriftCron,
  type DriftCronInput,
  type ProjectionDriftCronEnsureState,
} from "../../server/agent-studio/services/graph/projection/drift-cron.js";

const STATE = (): ProjectionDriftCronEnsureState => ({
  lastRunMinuteKey: null,
  lastRunAt: null,
  lastResult: null,
  lastError: null,
});

beforeEach(() => {
  delete process.env.AGS_PROJECTION_DRIFT_CRON_DISABLED;
  delete process.env.AGS_PROJECTION_DRIFT_CRON_EXPR;
  _resetProjectionDriftCronForTests();
});

afterEach(() => {
  delete process.env.AGS_PROJECTION_DRIFT_CRON_DISABLED;
  delete process.env.AGS_PROJECTION_DRIFT_CRON_EXPR;
  _resetProjectionDriftCronForTests();
});

const NO_DRIFT_REPORT = {
  scope: "default",
  scannedAt: "2026-05-13T04:30:00.000Z",
  events: [],
  summary: { totalScanned: 5, driftCount: 0, permissionLeakCount: 0 },
};

function makeInput(overrides: Partial<DriftCronInput> = {}): DriftCronInput {
  return {
    scope: "default",
    samplePerType: 5,
    precomputedInput: {
      scope: "default",
      sourceCounts: [],
      sampleSourceIds: [],
    },
    runScan: vi.fn(async () => NO_DRIFT_REPORT),
    // Tests run without a live ASDB; the default `persistDriftReport`
    // hits a real `insert into ags_graph_projection_drift_events`. We
    // stub persistence to return the event count without DB I/O.
    persist: vi.fn(async (report) => report.events.length),
    ...overrides,
  };
}

describe("module defaults", () => {
  it("default cron is daily 04:30 UTC (slot #19)", () => {
    expect(DEFAULT_PROJECTION_DRIFT_CRON_EXPR).toBe("30 4 * * *");
  });
});

describe("tickProjectionDriftCron — cron matching", () => {
  it("fires at 04:30 UTC default", async () => {
    const state = STATE();
    const sweepInput = makeInput();
    const result = await tickProjectionDriftCron({
      now: new Date("2026-05-13T04:30:00Z"),
      state,
      sweepInput,
      log: () => {},
    });
    expect(result.fired).toBe(true);
    expect(result.result?.totalScanned).toBe(5);
    expect(result.result?.driftCount).toBe(0);
  });

  it("skips at 04:00 UTC (runtime-runs slot)", async () => {
    const state = STATE();
    const result = await tickProjectionDriftCron({
      now: new Date("2026-05-13T04:00:00Z"),
      state,
      sweepInput: makeInput(),
    });
    expect(result.skippedReason).toBe("no_match");
  });

  it("dedups within the same minute key", async () => {
    const state = STATE();
    const sweepInput = makeInput();
    await tickProjectionDriftCron({
      now: new Date("2026-05-13T04:30:00Z"),
      state,
      sweepInput,
      log: () => {},
    });
    const second = await tickProjectionDriftCron({
      now: new Date("2026-05-13T04:30:30Z"),
      state,
      sweepInput,
      log: () => {},
    });
    expect(second.skippedReason).toBe("deduped");
  });
});

describe("tickProjectionDriftCron — env disable", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_PROJECTION_DRIFT_CRON_DISABLED = "1";
    const result = await tickProjectionDriftCron({
      now: new Date("2026-05-13T04:30:00Z"),
      sweepInput: makeInput(),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("returns disabled when env var = true", async () => {
    process.env.AGS_PROJECTION_DRIFT_CRON_DISABLED = "true";
    const result = await tickProjectionDriftCron({
      now: new Date("2026-05-13T04:30:00Z"),
      sweepInput: makeInput(),
    });
    expect(result.skippedReason).toBe("disabled");
  });
});

describe("tickProjectionDriftCron — env expr override", () => {
  it("honors AGS_PROJECTION_DRIFT_CRON_EXPR", async () => {
    process.env.AGS_PROJECTION_DRIFT_CRON_EXPR = "15 6 * * *";
    const state = STATE();
    const result = await tickProjectionDriftCron({
      now: new Date("2026-05-13T06:15:00Z"),
      state,
      sweepInput: makeInput(),
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });
});

describe("tickProjectionDriftCron — scanner result", () => {
  it("surfaces drift counts and permission-leak counts", async () => {
    const state = STATE();
    const result = await tickProjectionDriftCron({
      now: new Date("2026-05-13T04:30:00Z"),
      state,
      log: () => {},
      warn: () => {},
      sweepInput: makeInput({
        runScan: vi.fn(async () => ({
          scope: "default",
          scannedAt: "2026-05-13T04:30:00.000Z",
          events: [
            {
              driftClass: "stale_version",
              sourceId: "n1",
              details: { typeKey: "Note" },
            },
            {
              driftClass: "permission_leak",
              sourceId: "n2",
              details: {},
            },
          ],
          summary: { totalScanned: 10, driftCount: 2, permissionLeakCount: 1 },
        })),
      }),
    });
    expect(result.result?.driftCount).toBe(2);
    expect(result.result?.permissionLeakCount).toBe(1);
    expect(result.result?.totalScanned).toBe(10);
  });
});

describe("tickProjectionDriftCron — error handling", () => {
  it("captures scanner failure on lastError without advancing lastRunAt/lastResult", async () => {
    const state = STATE();
    const result = await tickProjectionDriftCron({
      now: new Date("2026-05-13T04:30:00Z"),
      state,
      log: () => {},
      warn: () => {},
      sweepInput: makeInput({
        runScan: vi.fn(async () => {
          throw new Error("postgres unreachable");
        }),
      }),
    });
    expect(result.skippedReason).toBe("swept_error");
    expect(state.lastError).toMatch(/postgres unreachable/);
    expect(state.lastRunAt).toBeNull();
    expect(state.lastResult).toBeNull();
  });

  it("clears lastError on the next successful tick", async () => {
    const state = STATE();
    state.lastError = "prior failure";
    await tickProjectionDriftCron({
      now: new Date("2026-05-13T04:30:00Z"),
      state,
      log: () => {},
      sweepInput: makeInput(),
    });
    expect(state.lastError).toBeNull();
    expect(state.lastRunAt).toBeInstanceOf(Date);
    expect(state.lastResult?.driftCount).toBe(0);
  });
});

describe("getProjectionDriftCronStatus", () => {
  it("returns the in-memory state shape", () => {
    const state: ProjectionDriftCronEnsureState = {
      lastRunMinuteKey: "2026-05-13T04:30",
      lastRunAt: new Date("2026-05-13T04:30:00Z"),
      lastResult: {
        scope: "default",
        scannedAt: "2026-05-13T04:30:00.000Z",
        totalScanned: 5,
        driftCount: 0,
        permissionLeakCount: 0,
        persistedEvents: 0,
      },
      lastError: null,
    };
    const status = getProjectionDriftCronStatus(state);
    expect(status.lastRunAt).toBeInstanceOf(Date);
    expect(status.lastResult?.driftCount).toBe(0);
    expect(status.lastError).toBeNull();
  });
});
