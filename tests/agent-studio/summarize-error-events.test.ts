/**
 * Phase I §T-I.34 — `summarizeErrorEvents` lockstep.
 *
 * Sparse-axis aggregator over the raw `ErrorEventRow` surface.
 * 20th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import { summarizeErrorEvents } from "../../server/agent-studio/services/workspace-observability/error-event-summary.js";
import type { ErrorEventRow } from "../../server/agent-studio/services/workspace-observability/error-events.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(overrides: Partial<ErrorEventRow> = {}): ErrorEventRow {
  return {
    id: 1,
    sourceKind: "test",
    sourceId: null,
    userId: null,
    errorClass: "TestError",
    errorMessage: "test",
    metadata: null,
    createdAt: FROZEN_NOW,
    ...overrides,
  };
}

describe("summarizeErrorEvents — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeErrorEvents([]);
    expect(s.total).toBe(0);
    expect(s.distinctSourceKindCount).toBe(0);
    expect(s.distinctErrorClassCount).toBe(0);
    expect(s.topSourceKinds).toEqual([]);
    expect(s.topErrorClasses).toEqual([]);
    expect(s.withUserCount).toBe(0);
    expect(s.withMetadataCount).toBe(0);
    expect(s.ageStats).toBeNull();
    expect(s.bySourceKind).toEqual({});
    expect(s.byErrorClass).toEqual({});
  });
});

describe("summarizeErrorEvents — sparse axes", () => {
  it("counts per sourceKind and per errorClass", () => {
    const s = summarizeErrorEvents([
      makeRow({ sourceKind: "trpc", errorClass: "ValidationError" }),
      makeRow({ sourceKind: "trpc", errorClass: "ValidationError" }),
      makeRow({ sourceKind: "trpc", errorClass: "TimeoutError" }),
      makeRow({ sourceKind: "scheduler", errorClass: "TimeoutError" }),
    ]);
    expect(s.bySourceKind.trpc).toBe(3);
    expect(s.bySourceKind.scheduler).toBe(1);
    expect(s.byErrorClass.ValidationError).toBe(2);
    expect(s.byErrorClass.TimeoutError).toBe(2);
    expect(s.distinctSourceKindCount).toBe(2);
    expect(s.distinctErrorClassCount).toBe(2);
  });

  it("unregistered keys don't appear in sparse axes", () => {
    const s = summarizeErrorEvents([
      makeRow({ sourceKind: "trpc" }),
    ]);
    expect(s.bySourceKind.trpc).toBe(1);
    expect(s.bySourceKind.never_seen).toBeUndefined();
  });
});

describe("summarizeErrorEvents — top-N truncation", () => {
  it("returns top sources by count descending", () => {
    const rows: ErrorEventRow[] = [];
    // a: 5, b: 3, c: 1
    for (let i = 0; i < 5; i++) rows.push(makeRow({ sourceKind: "a" }));
    for (let i = 0; i < 3; i++) rows.push(makeRow({ sourceKind: "b" }));
    rows.push(makeRow({ sourceKind: "c" }));
    const s = summarizeErrorEvents(rows);
    expect(s.topSourceKinds).toEqual([
      { key: "a", count: 5 },
      { key: "b", count: 3 },
      { key: "c", count: 1 },
    ]);
  });

  it("ties broken alphabetically", () => {
    const s = summarizeErrorEvents([
      makeRow({ sourceKind: "z" }),
      makeRow({ sourceKind: "a" }),
      makeRow({ sourceKind: "m" }),
    ]);
    // All tied at 1; alphabetical order should win.
    expect(s.topSourceKinds.map((e) => e.key)).toEqual(["a", "m", "z"]);
  });

  it("truncates at default 10 entries", () => {
    const rows: ErrorEventRow[] = [];
    for (let i = 0; i < 15; i++) {
      rows.push(makeRow({ sourceKind: `kind-${i}` }));
    }
    const s = summarizeErrorEvents(rows);
    expect(s.topSourceKinds.length).toBe(10);
  });

  it("respects custom topN option", () => {
    const rows: ErrorEventRow[] = [];
    for (let i = 0; i < 15; i++) {
      rows.push(makeRow({ sourceKind: `kind-${i}` }));
    }
    const s = summarizeErrorEvents(rows, { topN: 3 });
    expect(s.topSourceKinds.length).toBe(3);
  });
});

describe("summarizeErrorEvents — gauges", () => {
  it("withUserCount counts non-null userId (0 is valid)", () => {
    const s = summarizeErrorEvents([
      makeRow({ userId: null }),
      makeRow({ userId: 0 }), // 0 is a valid id, non-null
      makeRow({ userId: 5 }),
    ]);
    expect(s.withUserCount).toBe(2);
  });

  it("withMetadataCount counts non-null metadata", () => {
    const s = summarizeErrorEvents([
      makeRow({ metadata: null }),
      makeRow({ metadata: {} }),
      makeRow({ metadata: { key: "value" } }),
    ]);
    expect(s.withMetadataCount).toBe(2);
  });
});

describe("summarizeErrorEvents — age stats", () => {
  it("computes ms ages from createdAt to now", () => {
    const s = summarizeErrorEvents(
      [
        makeRow({ createdAt: new Date(FROZEN_NOW.getTime() - 1000) }),
        makeRow({ createdAt: new Date(FROZEN_NOW.getTime() - 2000) }),
        makeRow({ createdAt: new Date(FROZEN_NOW.getTime() - 5000) }),
      ],
      { now: FROZEN_NOW },
    );
    expect(s.ageStats!.count).toBe(3);
    expect(s.ageStats!.min).toBe(1000);
    expect(s.ageStats!.max).toBe(5000);
    expect(s.ageStats!.sum).toBe(8000);
  });

  it("null on empty input", () => {
    expect(summarizeErrorEvents([]).ageStats).toBeNull();
  });
});

describe("summarizeErrorEvents — invariants", () => {
  it("bySourceKind sums to total", () => {
    const s = summarizeErrorEvents([
      makeRow({ sourceKind: "a" }),
      makeRow({ sourceKind: "a" }),
      makeRow({ sourceKind: "b" }),
    ]);
    let sum = 0;
    for (const v of Object.values(s.bySourceKind)) sum += v;
    expect(sum).toBe(s.total);
  });

  it("byErrorClass sums to total", () => {
    const s = summarizeErrorEvents([
      makeRow({ errorClass: "X" }),
      makeRow({ errorClass: "Y" }),
    ]);
    let sum = 0;
    for (const v of Object.values(s.byErrorClass)) sum += v;
    expect(sum).toBe(s.total);
  });
});
