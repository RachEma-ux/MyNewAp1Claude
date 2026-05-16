/**
 * Phase L §T-L.7 — `summarizeLifecycleHolds` lockstep.
 *
 * Composite aggregator over the retention `LifecycleHoldRow` surface
 * combining dual sparse open-ended axes + dual top-N truncations +
 * dual complementary partitions (active/released, definite/indefinite)
 * + presence gauges + ageStats.
 *
 * 29th instantiation of the lesson-30 aggregator-pair pattern.
 * No new structural variant.
 */

import { describe, expect, it } from "vitest";
import { summarizeLifecycleHolds } from "../../server/agent-studio/services/retention/lifecycle-hold-summary.js";
import type { LifecycleHoldRow } from "../../server/agent-studio/services/retention/lifecycle-holds-management.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(overrides: Partial<LifecycleHoldRow> = {}): LifecycleHoldRow {
  return {
    id: 1,
    entityType: "note",
    entityId: 1,
    holdType: "litigation",
    reason: null,
    setBy: null,
    setAt: FROZEN_NOW,
    holdUntil: null,
    releasedAt: null,
    releasedBy: null,
    releaseNote: null,
    ...overrides,
  };
}

describe("summarizeLifecycleHolds — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeLifecycleHolds([]);
    expect(s.total).toBe(0);
    expect(s.distinctEntityTypeCount).toBe(0);
    expect(s.distinctHoldTypeCount).toBe(0);
    expect(s.distinctEntityCount).toBe(0);
    expect(s.topEntityTypes).toEqual([]);
    expect(s.topHoldTypes).toEqual([]);
    expect(s.activeCount).toBe(0);
    expect(s.releasedCount).toBe(0);
    expect(s.definiteHoldCount).toBe(0);
    expect(s.indefiniteHoldCount).toBe(0);
    expect(s.withReasonCount).toBe(0);
    expect(s.withSetByCount).toBe(0);
    expect(s.withReleaseNoteCount).toBe(0);
    expect(s.ageStats).toBeNull();
  });
});

describe("summarizeLifecycleHolds — sparse entityType + holdType axes", () => {
  it("counts per entityType", () => {
    const s = summarizeLifecycleHolds([
      makeRow({ entityType: "note" }),
      makeRow({ entityType: "note" }),
      makeRow({ entityType: "attachment" }),
    ]);
    expect(s.byEntityType.note).toBe(2);
    expect(s.byEntityType.attachment).toBe(1);
    expect(s.distinctEntityTypeCount).toBe(2);
  });

  it("counts per holdType", () => {
    const s = summarizeLifecycleHolds([
      makeRow({ holdType: "litigation" }),
      makeRow({ holdType: "litigation" }),
      makeRow({ holdType: "audit" }),
      makeRow({ holdType: "compliance" }),
    ]);
    expect(s.byHoldType.litigation).toBe(2);
    expect(s.byHoldType.audit).toBe(1);
    expect(s.byHoldType.compliance).toBe(1);
    expect(s.distinctHoldTypeCount).toBe(3);
  });

  it("topEntityTypes sorted desc; ties alphabetical", () => {
    const rows: LifecycleHoldRow[] = [];
    for (let i = 0; i < 5; i++) rows.push(makeRow({ entityType: "a" }));
    for (let i = 0; i < 3; i++) rows.push(makeRow({ entityType: "b" }));
    rows.push(makeRow({ entityType: "c" }));
    rows.push(makeRow({ entityType: "d" }));
    const s = summarizeLifecycleHolds(rows);
    expect(s.topEntityTypes).toEqual([
      { key: "a", count: 5 },
      { key: "b", count: 3 },
      { key: "c", count: 1 },
      { key: "d", count: 1 },
    ]);
  });

  it("top-N truncation respects default and custom topN", () => {
    const rows: LifecycleHoldRow[] = [];
    for (let i = 0; i < 15; i++) rows.push(makeRow({ entityType: `e${i}` }));
    expect(summarizeLifecycleHolds(rows).topEntityTypes).toHaveLength(10);
    expect(summarizeLifecycleHolds(rows, { topN: 3 }).topEntityTypes).toHaveLength(3);
  });
});

describe("summarizeLifecycleHolds — active vs released partition", () => {
  it("activeCount + releasedCount equals total", () => {
    const s = summarizeLifecycleHolds([
      makeRow({ releasedAt: null }),
      makeRow({ releasedAt: null }),
      makeRow({ releasedAt: FROZEN_NOW }),
      makeRow({ releasedAt: FROZEN_NOW }),
      makeRow({ releasedAt: FROZEN_NOW }),
    ]);
    expect(s.activeCount).toBe(2);
    expect(s.releasedCount).toBe(3);
    expect(s.activeCount + s.releasedCount).toBe(s.total);
  });
});

describe("summarizeLifecycleHolds — definite vs indefinite partition", () => {
  it("definite + indefinite equals total", () => {
    const future = new Date(FROZEN_NOW.getTime() + 86400000);
    const s = summarizeLifecycleHolds([
      makeRow({ holdUntil: future }),
      makeRow({ holdUntil: future }),
      makeRow({ holdUntil: null }),
    ]);
    expect(s.definiteHoldCount).toBe(2);
    expect(s.indefiniteHoldCount).toBe(1);
    expect(s.definiteHoldCount + s.indefiniteHoldCount).toBe(s.total);
  });
});

describe("summarizeLifecycleHolds — distinct entity counter", () => {
  it("counts entity_type:entity_id composite keys", () => {
    const s = summarizeLifecycleHolds([
      makeRow({ entityType: "note", entityId: 1 }),
      makeRow({ entityType: "note", entityId: 1 }),
      makeRow({ entityType: "note", entityId: 2 }),
      makeRow({ entityType: "attachment", entityId: 1 }),
    ]);
    expect(s.distinctEntityCount).toBe(3);
  });
});

describe("summarizeLifecycleHolds — gauges", () => {
  it("withReasonCount counts non-null reasons", () => {
    const s = summarizeLifecycleHolds([
      makeRow({ reason: "litigation pending" }),
      makeRow({ reason: null }),
      makeRow({ reason: "audit" }),
    ]);
    expect(s.withReasonCount).toBe(2);
  });

  it("withSetByCount counts non-null setBy", () => {
    const s = summarizeLifecycleHolds([
      makeRow({ setBy: 1 }),
      makeRow({ setBy: null }),
    ]);
    expect(s.withSetByCount).toBe(1);
  });

  it("withReleaseNoteCount counts non-null releaseNote", () => {
    const s = summarizeLifecycleHolds([
      makeRow({ releaseNote: "ok" }),
      makeRow({ releaseNote: null }),
      makeRow({ releaseNote: "done" }),
    ]);
    expect(s.withReleaseNoteCount).toBe(2);
  });
});

describe("summarizeLifecycleHolds — ageStats", () => {
  it("computes ms from setAt to now", () => {
    const earlier = new Date(FROZEN_NOW.getTime() - 3600_000);
    const s = summarizeLifecycleHolds(
      [makeRow({ setAt: earlier })],
      { now: FROZEN_NOW },
    );
    expect(s.ageStats).not.toBeNull();
    expect(s.ageStats!.min).toBe(3600_000);
  });
});

describe("summarizeLifecycleHolds — total invariant", () => {
  it("total equals input row count", () => {
    const s = summarizeLifecycleHolds([makeRow(), makeRow(), makeRow()]);
    expect(s.total).toBe(3);
  });
});
