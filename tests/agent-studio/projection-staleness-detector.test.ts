/**
 * Phase 22 §T-I.43 — Projection staleness detector lockstep.
 *
 * Pure-function detector + emitter pair. Closes detection-gap for
 * kind #7 `neo4j_projection_stale`.
 */

import { describe, expect, it, vi } from "vitest";
import {
  detectStaleProjections,
  emitStaleProjections,
  type ProjectionSyncJobRow,
} from "../../server/agent-studio/services/graph/projection/staleness-detector.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(overrides: Partial<ProjectionSyncJobRow> = {}): ProjectionSyncJobRow {
  return {
    id: 1,
    projectionKey: "default",
    status: "pending",
    completedAt: null,
    ...overrides,
  };
}

describe("detectStaleProjections — empty input", () => {
  it("returns zero on every axis", () => {
    const s = detectStaleProjections([]);
    expect(s.distinctProjectionCount).toBe(0);
    expect(s.stale).toEqual([]);
    expect(s.neverSucceeded).toEqual([]);
    expect(s.freshCount).toBe(0);
  });
});

describe("detectStaleProjections — fresh projections", () => {
  it("classifies recent succeeded run as fresh", () => {
    const recent = new Date(FROZEN_NOW.getTime() - 30 * 60 * 1000); // 30min ago
    const s = detectStaleProjections(
      [makeRow({ status: "succeeded", completedAt: recent })],
      { now: FROZEN_NOW },
    );
    expect(s.freshCount).toBe(1);
    expect(s.stale).toEqual([]);
  });

  it("respects custom thresholdMs", () => {
    const earlier = new Date(FROZEN_NOW.getTime() - 90 * 60 * 1000); // 90min ago
    const sDefault = detectStaleProjections(
      [makeRow({ status: "succeeded", completedAt: earlier })],
      { now: FROZEN_NOW },
    );
    expect(sDefault.stale).toHaveLength(1);
    const sLong = detectStaleProjections(
      [makeRow({ status: "succeeded", completedAt: earlier })],
      { now: FROZEN_NOW, thresholdMs: 2 * 60 * 60 * 1000 },
    );
    expect(sLong.freshCount).toBe(1);
    expect(sLong.stale).toEqual([]);
  });
});

describe("detectStaleProjections — stale partition", () => {
  it("reports lag for each stale projection", () => {
    const old = new Date(FROZEN_NOW.getTime() - 4 * 60 * 60 * 1000); // 4 hrs ago
    const s = detectStaleProjections(
      [makeRow({ projectionKey: "a", status: "succeeded", completedAt: old })],
      { now: FROZEN_NOW },
    );
    expect(s.stale).toHaveLength(1);
    expect(s.stale[0].projectionKey).toBe("a");
    expect(s.stale[0].lagMs).toBe(4 * 60 * 60 * 1000);
    expect(s.stale[0].lastSucceededAt).toEqual(old);
  });

  it("uses MAX(completedAt where succeeded) per projection", () => {
    const veryOld = new Date(FROZEN_NOW.getTime() - 24 * 60 * 60 * 1000);
    const old = new Date(FROZEN_NOW.getTime() - 4 * 60 * 60 * 1000);
    const s = detectStaleProjections(
      [
        makeRow({ projectionKey: "a", status: "succeeded", completedAt: veryOld }),
        makeRow({ projectionKey: "a", status: "succeeded", completedAt: old }),
      ],
      { now: FROZEN_NOW },
    );
    expect(s.stale).toHaveLength(1);
    expect(s.stale[0].lagMs).toBe(4 * 60 * 60 * 1000);
  });

  it("sorts stale findings by descending lag, then alphabetical", () => {
    const lag2h = new Date(FROZEN_NOW.getTime() - 2 * 60 * 60 * 1000);
    const lag4h = new Date(FROZEN_NOW.getTime() - 4 * 60 * 60 * 1000);
    const s = detectStaleProjections(
      [
        makeRow({ projectionKey: "z", status: "succeeded", completedAt: lag2h }),
        makeRow({ projectionKey: "a", status: "succeeded", completedAt: lag4h }),
        makeRow({ projectionKey: "b", status: "succeeded", completedAt: lag2h }),
      ],
      { now: FROZEN_NOW },
    );
    expect(s.stale.map((x) => x.projectionKey)).toEqual(["a", "b", "z"]);
  });
});

describe("detectStaleProjections — never_succeeded partition", () => {
  it("reports projections with no succeeded runs separately", () => {
    const s = detectStaleProjections(
      [
        makeRow({ projectionKey: "stuck", status: "failed" }),
        makeRow({ projectionKey: "stuck", status: "pending" }),
      ],
      { now: FROZEN_NOW },
    );
    expect(s.neverSucceeded).toHaveLength(1);
    expect(s.neverSucceeded[0].projectionKey).toBe("stuck");
    expect(s.neverSucceeded[0].attemptedRunCount).toBe(2);
    expect(s.stale).toEqual([]);
  });

  it("does not also report never_succeeded entries as fresh", () => {
    const s = detectStaleProjections(
      [makeRow({ projectionKey: "stuck", status: "failed" })],
      { now: FROZEN_NOW },
    );
    expect(s.freshCount).toBe(0);
  });

  it("sorts neverSucceeded by descending attempt count, then alphabetical", () => {
    const s = detectStaleProjections(
      [
        makeRow({ projectionKey: "z", status: "failed" }),
        makeRow({ projectionKey: "a", status: "failed" }),
        makeRow({ projectionKey: "a", status: "failed" }),
        makeRow({ projectionKey: "b", status: "failed" }),
      ],
      { now: FROZEN_NOW },
    );
    expect(s.neverSucceeded.map((x) => x.projectionKey)).toEqual(["a", "b", "z"]);
  });
});

describe("detectStaleProjections — mixed projections", () => {
  it("partitions distinct projections into 3 buckets", () => {
    const recent = new Date(FROZEN_NOW.getTime() - 10 * 60 * 1000);
    const old = new Date(FROZEN_NOW.getTime() - 4 * 60 * 60 * 1000);
    const s = detectStaleProjections(
      [
        makeRow({ projectionKey: "fresh", status: "succeeded", completedAt: recent }),
        makeRow({ projectionKey: "stale", status: "succeeded", completedAt: old }),
        makeRow({ projectionKey: "stuck", status: "failed" }),
      ],
      { now: FROZEN_NOW },
    );
    expect(s.distinctProjectionCount).toBe(3);
    expect(s.freshCount).toBe(1);
    expect(s.stale).toHaveLength(1);
    expect(s.neverSucceeded).toHaveLength(1);
  });
});

describe("emitStaleProjections", () => {
  it("emits one bridge call per stale entry", async () => {
    const emitter = vi.fn(async () => null);
    const old = new Date(FROZEN_NOW.getTime() - 4 * 60 * 60 * 1000);
    const summary = detectStaleProjections(
      [
        makeRow({ projectionKey: "a", status: "succeeded", completedAt: old }),
        makeRow({ projectionKey: "b", status: "succeeded", completedAt: old }),
      ],
      { now: FROZEN_NOW },
    );
    emitStaleProjections(summary, { recordFailureStateEvent: emitter });
    // Microtask flush: void calls schedule the promise; await one tick
    // to let the emitter receive both calls.
    await Promise.resolve();
    expect(emitter).toHaveBeenCalledTimes(2);
    const call0 = emitter.mock.calls[0][0];
    expect(call0.failureState).toBe("neo4j_projection_stale");
    expect(call0.sourceKind).toBe("graph-projection.staleness-detector");
    expect(call0.metadata?.projectionKey).toBeDefined();
    expect(call0.metadata?.lagMs).toBeGreaterThan(0);
    expect(call0.metadata?.thresholdMs).toBe(60 * 60 * 1000);
  });

  it("does not emit when null suppresses", async () => {
    const old = new Date(FROZEN_NOW.getTime() - 4 * 60 * 60 * 1000);
    const summary = detectStaleProjections(
      [makeRow({ projectionKey: "a", status: "succeeded", completedAt: old })],
      { now: FROZEN_NOW },
    );
    emitStaleProjections(summary, { recordFailureStateEvent: null });
    await Promise.resolve();
    // No throw, no exception — null is the suppress signal.
  });

  it("does not emit when summary has no stale entries", async () => {
    const emitter = vi.fn(async () => null);
    const recent = new Date(FROZEN_NOW.getTime() - 10 * 60 * 1000);
    const summary = detectStaleProjections(
      [makeRow({ projectionKey: "a", status: "succeeded", completedAt: recent })],
      { now: FROZEN_NOW },
    );
    emitStaleProjections(summary, { recordFailureStateEvent: emitter });
    await Promise.resolve();
    expect(emitter).not.toHaveBeenCalled();
  });

  it("uses custom thresholdMs in metadata stamp", async () => {
    const emitter = vi.fn(async () => null);
    const old = new Date(FROZEN_NOW.getTime() - 4 * 60 * 60 * 1000);
    const summary = detectStaleProjections(
      [makeRow({ projectionKey: "a", status: "succeeded", completedAt: old })],
      { now: FROZEN_NOW },
    );
    emitStaleProjections(summary, {
      recordFailureStateEvent: emitter,
      thresholdMs: 30 * 60 * 1000,
    });
    await Promise.resolve();
    expect(emitter).toHaveBeenCalledTimes(1);
    expect(emitter.mock.calls[0][0].metadata?.thresholdMs).toBe(30 * 60 * 1000);
  });
});
