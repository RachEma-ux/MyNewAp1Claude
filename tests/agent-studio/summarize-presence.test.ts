/**
 * Phase B §T-B.9 — `summarizePresence` lockstep.
 *
 * Composite aggregator over the vault `PresenceRow` surface combining
 * sparse byNote axis + top-N + complementary active/stale partition
 * + 3 NumericStats (session duration, inactive duration, sessions per
 * note) + cursor-state gauge.
 *
 * 30th instantiation of the lesson-30 aggregator-pair pattern
 * (milestone). No new structural variant.
 */

import { describe, expect, it } from "vitest";
import { summarizePresence } from "../../server/agent-studio/services/vault/presence-summary.js";
import type { PresenceRow } from "../../server/agent-studio/services/vault/presence.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(overrides: Partial<PresenceRow> = {}): PresenceRow {
  return {
    id: 1,
    noteId: 1,
    userId: 1,
    sessionToken: "tok",
    cursorState: null,
    enteredAt: FROZEN_NOW,
    lastActiveAt: FROZEN_NOW,
    ...overrides,
  };
}

describe("summarizePresence — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizePresence([]);
    expect(s.total).toBe(0);
    expect(s.distinctUserCount).toBe(0);
    expect(s.distinctNoteCount).toBe(0);
    expect(s.topNotes).toEqual([]);
    expect(s.activeSessionCount).toBe(0);
    expect(s.staleSessionCount).toBe(0);
    expect(s.withCursorStateCount).toBe(0);
    expect(s.sessionDurationStats).toBeNull();
    expect(s.inactiveDurationStats).toBeNull();
    expect(s.sessionsPerNoteStats).toBeNull();
  });
});

describe("summarizePresence — distinct rollups", () => {
  it("distinctUserCount counts unique userIds", () => {
    const s = summarizePresence([
      makeRow({ userId: 1 }),
      makeRow({ userId: 1 }),
      makeRow({ userId: 2 }),
      makeRow({ userId: 3 }),
    ]);
    expect(s.distinctUserCount).toBe(3);
  });

  it("distinctNoteCount counts unique noteIds", () => {
    const s = summarizePresence([
      makeRow({ noteId: 1 }),
      makeRow({ noteId: 1 }),
      makeRow({ noteId: 2 }),
    ]);
    expect(s.distinctNoteCount).toBe(2);
  });
});

describe("summarizePresence — byNote sparse + top-N", () => {
  it("counts per noteId", () => {
    const s = summarizePresence([
      makeRow({ noteId: 1 }),
      makeRow({ noteId: 1 }),
      makeRow({ noteId: 2 }),
    ]);
    expect(s.byNote["1"]).toBe(2);
    expect(s.byNote["2"]).toBe(1);
  });

  it("topNotes sorted descending; ties alphabetical", () => {
    const rows: PresenceRow[] = [];
    for (let i = 0; i < 5; i++) rows.push(makeRow({ noteId: 1 }));
    for (let i = 0; i < 3; i++) rows.push(makeRow({ noteId: 2 }));
    rows.push(makeRow({ noteId: 3 }));
    const s = summarizePresence(rows);
    expect(s.topNotes[0]).toEqual({ key: "1", count: 5 });
    expect(s.topNotes[1]).toEqual({ key: "2", count: 3 });
    expect(s.topNotes[2]).toEqual({ key: "3", count: 1 });
  });

  it("custom topN respected", () => {
    const rows: PresenceRow[] = [];
    for (let i = 0; i < 15; i++) rows.push(makeRow({ noteId: i }));
    expect(summarizePresence(rows).topNotes).toHaveLength(10);
    expect(summarizePresence(rows, { topN: 3 }).topNotes).toHaveLength(3);
  });
});

describe("summarizePresence — active vs stale partition", () => {
  it("classifies rows under threshold as active", () => {
    const recentActive = new Date(FROZEN_NOW.getTime() - 60_000); // 1 min ago
    const longIdle = new Date(FROZEN_NOW.getTime() - 600_000); // 10 min ago
    const s = summarizePresence(
      [
        makeRow({ lastActiveAt: recentActive }),
        makeRow({ lastActiveAt: recentActive }),
        makeRow({ lastActiveAt: longIdle }),
      ],
      { now: FROZEN_NOW },
    );
    expect(s.activeSessionCount).toBe(2);
    expect(s.staleSessionCount).toBe(1);
    expect(s.activeSessionCount + s.staleSessionCount).toBe(s.total);
  });

  it("respects custom staleThresholdMs", () => {
    const justOverDefault = new Date(FROZEN_NOW.getTime() - 6 * 60 * 1000);
    const sDefault = summarizePresence(
      [makeRow({ lastActiveAt: justOverDefault })],
      { now: FROZEN_NOW },
    );
    expect(sDefault.staleSessionCount).toBe(1);
    const sLong = summarizePresence(
      [makeRow({ lastActiveAt: justOverDefault })],
      { now: FROZEN_NOW, staleThresholdMs: 10 * 60 * 1000 },
    );
    expect(sLong.activeSessionCount).toBe(1);
  });
});

describe("summarizePresence — cursorState gauge", () => {
  it("counts non-null cursor states", () => {
    const s = summarizePresence([
      makeRow({ cursorState: { line: 1 } }),
      makeRow({ cursorState: null }),
      makeRow({ cursorState: {} }),
    ]);
    expect(s.withCursorStateCount).toBe(2);
  });
});

describe("summarizePresence — duration stats", () => {
  it("sessionDurationStats from now - enteredAt", () => {
    const entered = new Date(FROZEN_NOW.getTime() - 60_000);
    const s = summarizePresence(
      [makeRow({ enteredAt: entered })],
      { now: FROZEN_NOW },
    );
    expect(s.sessionDurationStats).not.toBeNull();
    expect(s.sessionDurationStats!.min).toBe(60_000);
  });

  it("inactiveDurationStats from now - lastActiveAt", () => {
    const lastActive = new Date(FROZEN_NOW.getTime() - 30_000);
    const s = summarizePresence(
      [makeRow({ lastActiveAt: lastActive })],
      { now: FROZEN_NOW },
    );
    expect(s.inactiveDurationStats).not.toBeNull();
    expect(s.inactiveDurationStats!.min).toBe(30_000);
  });

  it("sessionsPerNoteStats from per-note bucket sizes", () => {
    const s = summarizePresence([
      makeRow({ noteId: 1 }),
      makeRow({ noteId: 1 }),
      makeRow({ noteId: 1 }),
      makeRow({ noteId: 2 }),
    ]);
    expect(s.sessionsPerNoteStats).not.toBeNull();
    expect(s.sessionsPerNoteStats!.count).toBe(2);
    expect(s.sessionsPerNoteStats!.max).toBe(3);
    expect(s.sessionsPerNoteStats!.min).toBe(1);
  });
});

describe("summarizePresence — total invariant", () => {
  it("total equals input row count", () => {
    const s = summarizePresence([makeRow(), makeRow(), makeRow()]);
    expect(s.total).toBe(3);
  });
});
