/**
 * Phase I §T-I.35 — `summarizeBackgroundJobs` lockstep + tuple
 * promotion of JobStatus.
 *
 * 21st instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import { summarizeBackgroundJobs } from "../../server/agent-studio/services/workspace-observability/background-job-summary.js";
import {
  BACKGROUND_JOB_STATUSES,
  TERMINAL_BACKGROUND_JOB_STATUSES,
  type BackgroundJobRow,
} from "../../server/agent-studio/services/workspace-observability/background-jobs.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(overrides: Partial<BackgroundJobRow> = {}): BackgroundJobRow {
  return {
    id: 1,
    jobKind: "test-kind",
    payload: null,
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: FROZEN_NOW,
    updatedAt: FROZEN_NOW,
    ...overrides,
  };
}

describe("BACKGROUND_JOB_STATUSES — closed-taxonomy invariant", () => {
  it("contains exactly 5 values", () => {
    expect(BACKGROUND_JOB_STATUSES.length).toBe(5);
  });

  it("TERMINAL_BACKGROUND_JOB_STATUSES is a proper subset (3 of 5)", () => {
    expect(TERMINAL_BACKGROUND_JOB_STATUSES.size).toBe(3);
    expect(TERMINAL_BACKGROUND_JOB_STATUSES.has("completed")).toBe(true);
    expect(TERMINAL_BACKGROUND_JOB_STATUSES.has("failed")).toBe(true);
    expect(TERMINAL_BACKGROUND_JOB_STATUSES.has("cancelled")).toBe(true);
    expect(TERMINAL_BACKGROUND_JOB_STATUSES.has("pending")).toBe(false);
    expect(TERMINAL_BACKGROUND_JOB_STATUSES.has("running")).toBe(false);
  });
});

describe("summarizeBackgroundJobs — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeBackgroundJobs([]);
    expect(s.total).toBe(0);
    expect(s.unknownStatusCount).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.withLastErrorCount).toBe(0);
    expect(s.attemptStats).toBeNull();
    expect(s.ageStats).toBeNull();
    expect(s.distinctJobKindCount).toBe(0);
    expect(s.topJobKinds).toEqual([]);
  });

  it("byStatus carries every closed status at 0", () => {
    const s = summarizeBackgroundJobs([]);
    for (const status of BACKGROUND_JOB_STATUSES) {
      expect(s.byStatus[status]).toBe(0);
    }
  });
});

describe("summarizeBackgroundJobs — status partition", () => {
  it("terminal + inFlight + unknown sums to total", () => {
    const s = summarizeBackgroundJobs([
      makeRow({ status: "pending" }),
      makeRow({ status: "running" }),
      makeRow({ status: "completed" }),
      makeRow({ status: "failed" }),
      makeRow({ status: "cancelled" }),
      makeRow({ status: "drift" as never }),
    ]);
    expect(s.terminalCount).toBe(3);
    expect(s.inFlightCount).toBe(2);
    expect(s.unknownStatusCount).toBe(1);
    expect(
      s.terminalCount + s.inFlightCount + s.unknownStatusCount,
    ).toBe(s.total);
  });
});

describe("summarizeBackgroundJobs — attempt stats", () => {
  it("computes mean/min/max attempts", () => {
    const s = summarizeBackgroundJobs([
      makeRow({ attempts: 1 }),
      makeRow({ attempts: 2 }),
      makeRow({ attempts: 4 }),
    ]);
    expect(s.attemptStats!.count).toBe(3);
    expect(s.attemptStats!.sum).toBe(7);
    expect(s.attemptStats!.min).toBe(1);
    expect(s.attemptStats!.max).toBe(4);
    expect(s.attemptStats!.mean).toBe(2.3);
  });

  it("zero attempts is a valid value (not skipped)", () => {
    const s = summarizeBackgroundJobs([
      makeRow({ attempts: 0 }),
      makeRow({ attempts: 0 }),
    ]);
    expect(s.attemptStats!.count).toBe(2);
    expect(s.attemptStats!.sum).toBe(0);
  });
});

describe("summarizeBackgroundJobs — lastError gauge", () => {
  it("counts non-null lastError", () => {
    const s = summarizeBackgroundJobs([
      makeRow({ lastError: null }),
      makeRow({ lastError: "" }),
      makeRow({ lastError: "boom" }),
    ]);
    expect(s.withLastErrorCount).toBe(2);
  });
});

describe("summarizeBackgroundJobs — sparse jobKind + top-N", () => {
  it("counts per jobKind sparse", () => {
    const s = summarizeBackgroundJobs([
      makeRow({ jobKind: "retention-sweep" }),
      makeRow({ jobKind: "retention-sweep" }),
      makeRow({ jobKind: "drift-detector" }),
    ]);
    expect(s.byJobKind["retention-sweep"]).toBe(2);
    expect(s.byJobKind["drift-detector"]).toBe(1);
    expect(s.distinctJobKindCount).toBe(2);
  });

  it("topJobKinds sorts by count desc, ties alphabetical", () => {
    const s = summarizeBackgroundJobs([
      makeRow({ jobKind: "z" }),
      makeRow({ jobKind: "a" }),
      makeRow({ jobKind: "m" }),
    ]);
    expect(s.topJobKinds.map((e) => e.key)).toEqual(["a", "m", "z"]);
  });

  it("topJobKinds truncates at default 10", () => {
    const rows: BackgroundJobRow[] = [];
    for (let i = 0; i < 15; i++) rows.push(makeRow({ jobKind: `k${i}` }));
    const s = summarizeBackgroundJobs(rows);
    expect(s.topJobKinds.length).toBe(10);
  });
});

describe("summarizeBackgroundJobs — age stats", () => {
  it("computes ages with injected clock", () => {
    const s = summarizeBackgroundJobs(
      [
        makeRow({
          createdAt: new Date(FROZEN_NOW.getTime() - 1000),
        }),
        makeRow({
          createdAt: new Date(FROZEN_NOW.getTime() - 3000),
        }),
      ],
      { now: FROZEN_NOW },
    );
    expect(s.ageStats!.count).toBe(2);
    expect(s.ageStats!.min).toBe(1000);
    expect(s.ageStats!.max).toBe(3000);
  });
});
