/**
 * Phase 22 follow-up #614 — getRetentionCronStatus() +
 * getStaleRunningCronStatus() expose last-run / last-error state
 * for operator monitoring. Covers:
 *  - empty/initial state
 *  - lastRunAt + lastResult set on successful fire
 *  - lastError set on failed fire (lastRunAt unchanged)
 *  - lastError cleared on next successful fire
 *  - both getters accept an optional state arg (test seam)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepRetMock, sweepStaleMock } = vi.hoisted(() => ({
  sweepRetMock: vi.fn(),
  sweepStaleMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/retention-sweep.js",
  () => ({ runRetentionSweep: sweepRetMock }),
);
vi.mock(
  "../../server/agent-studio/services/workspace-observability/background-jobs.js",
  () => ({ failStaleRunningJobs: sweepStaleMock }),
);

import {
  tickRetentionCron,
  getRetentionCronStatus,
  _resetRetentionCronForTests,
} from "../../server/agent-studio/services/workspace-observability/retention-cron";
import {
  tickStaleRunningCron,
  getStaleRunningCronStatus,
  _resetStaleRunningCronForTests,
} from "../../server/agent-studio/services/workspace-observability/stale-running-job-cron";

const STATE_RET = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepRetMock.mockReset();
  sweepStaleMock.mockReset();
  sweepRetMock.mockResolvedValue({
    errorEventsDeleted: 1,
    notificationsDeleted: 2,
    backgroundJobsDeleted: 3,
    errorEventsCutoff: new Date(0),
    notificationsCutoff: new Date(0),
    backgroundJobsCutoff: new Date(0),
  });
  sweepStaleMock.mockResolvedValue({ failed: [], scanned: 0 });
  _resetRetentionCronForTests();
  _resetStaleRunningCronForTests();
});

afterEach(() => {
  _resetRetentionCronForTests();
  _resetStaleRunningCronForTests();
});

describe("getRetentionCronStatus", () => {
  it("returns null/null/null when nothing has run yet", () => {
    const s = getRetentionCronStatus(STATE_RET());
    expect(s.lastRunAt).toBeNull();
    expect(s.lastResult).toBeNull();
    expect(s.lastError).toBeNull();
  });

  it("returns lastRunAt + lastResult after a successful fire", async () => {
    const state = STATE_RET();
    const now = new Date("2026-05-12T03:00:00Z");
    await tickRetentionCron({ now, state, log: () => {} });
    const s = getRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T03:00:00.000Z");
    expect(s.lastResult?.errorEventsDeleted).toBe(1);
    expect(s.lastResult?.notificationsDeleted).toBe(2);
    expect(s.lastResult?.backgroundJobsDeleted).toBe(3);
    expect(s.lastError).toBeNull();
  });

  it("sets lastError on sweep failure WITHOUT advancing lastRunAt/lastResult", async () => {
    const state = STATE_RET();
    sweepRetMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
      warn: () => {},
    });
    const s = getRetentionCronStatus(state);
    expect(s.lastRunAt).toBeNull();
    expect(s.lastResult).toBeNull();
    expect(s.lastError).toBe("ASDB unreachable");
  });

  it("clears lastError on the next successful fire after a failure", async () => {
    const state = STATE_RET();
    sweepRetMock.mockRejectedValueOnce(new Error("transient"));
    await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getRetentionCronStatus(state).lastError).toBe("transient");

    await tickRetentionCron({
      now: new Date("2026-05-13T03:00:00Z"),
      state,
      log: () => {},
    });
    const s = getRetentionCronStatus(state);
    expect(s.lastError).toBeNull();
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-13T03:00:00.000Z");
    expect(s.lastResult?.errorEventsDeleted).toBe(1);
  });

  it("preserves lastRunAt/lastResult across a subsequent failure (stale-good + fresh-error)", async () => {
    const state = STATE_RET();
    // First: successful fire
    await tickRetentionCron({
      now: new Date("2026-05-12T03:00:00Z"),
      state,
      log: () => {},
    });
    expect(getRetentionCronStatus(state).lastRunAt?.toISOString()).toBe(
      "2026-05-12T03:00:00.000Z",
    );

    // Next day: failure
    sweepRetMock.mockRejectedValueOnce(new Error("outage"));
    await tickRetentionCron({
      now: new Date("2026-05-13T03:00:00Z"),
      state,
      warn: () => {},
    });
    const s = getRetentionCronStatus(state);
    // lastRunAt still points at the successful fire (yesterday)
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T03:00:00.000Z");
    // lastResult unchanged
    expect(s.lastResult?.errorEventsDeleted).toBe(1);
    // lastError reflects today's failure
    expect(s.lastError).toBe("outage");
  });
});

describe("getStaleRunningCronStatus", () => {
  it("returns null/null/null when nothing has run yet", () => {
    const s = getStaleRunningCronStatus({
      lastRunMinuteKey: null,
      lastRunAt: null,
      lastResult: null,
      lastError: null,
    });
    expect(s.lastRunAt).toBeNull();
    expect(s.lastResult).toBeNull();
    expect(s.lastError).toBeNull();
  });

  it("returns lastRunAt + lastResult after a successful fire", async () => {
    sweepStaleMock.mockResolvedValueOnce({
      failed: [{ id: 1 } as any, { id: 2 } as any],
      scanned: 5,
    });
    const state = {
      lastRunMinuteKey: null as string | null,
      lastRunAt: null as Date | null,
      lastResult: null as any,
      lastError: null as string | null,
    };
    await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      log: () => {},
    });
    const s = getStaleRunningCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T14:00:00.000Z");
    expect(s.lastResult?.scanned).toBe(5);
    expect(s.lastResult?.failed).toHaveLength(2);
    expect(s.lastError).toBeNull();
  });

  it("sets lastError on sweep failure", async () => {
    sweepStaleMock.mockRejectedValueOnce(new Error("connection refused"));
    const state = {
      lastRunMinuteKey: null as string | null,
      lastRunAt: null as Date | null,
      lastResult: null as any,
      lastError: null as string | null,
    };
    await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      warn: () => {},
    });
    const s = getStaleRunningCronStatus(state);
    expect(s.lastRunAt).toBeNull();
    expect(s.lastError).toBe("connection refused");
  });

  it("clears lastError on next successful fire", async () => {
    sweepStaleMock.mockRejectedValueOnce(new Error("transient"));
    sweepStaleMock.mockResolvedValueOnce({ failed: [], scanned: 0 });
    const state = {
      lastRunMinuteKey: null as string | null,
      lastRunAt: null as Date | null,
      lastResult: null as any,
      lastError: null as string | null,
    };
    await tickStaleRunningCron({
      now: new Date("2026-05-12T14:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getStaleRunningCronStatus(state).lastError).toBe("transient");

    await tickStaleRunningCron({
      now: new Date("2026-05-12T14:10:00Z"),
      state,
      log: () => {},
    });
    const s = getStaleRunningCronStatus(state);
    expect(s.lastError).toBeNull();
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T14:10:00.000Z");
  });
});

describe("module-state default — both getters return null fields after reset", () => {
  it("retention status is empty after _resetRetentionCronForTests", () => {
    _resetRetentionCronForTests();
    const s = getRetentionCronStatus();
    expect(s.lastRunAt).toBeNull();
    expect(s.lastResult).toBeNull();
    expect(s.lastError).toBeNull();
  });
  it("stale-running status is empty after _resetStaleRunningCronForTests", () => {
    _resetStaleRunningCronForTests();
    const s = getStaleRunningCronStatus();
    expect(s.lastRunAt).toBeNull();
    expect(s.lastResult).toBeNull();
    expect(s.lastError).toBeNull();
  });
});
