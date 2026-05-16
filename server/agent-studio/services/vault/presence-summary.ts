/**
 * `summarizePresence` — stable-shape aggregator over the
 * `PresenceRow[]` surface (T-B.9).
 *
 * 30th instantiation of the lesson-30 aggregator-pair pattern.
 * **Milestone: 30 instantiations.** Composite slice — composes
 * sparse axis (via composite-key rollup) + complementary partition
 * (active vs stale) + 3 NumericStats (session duration / inactive
 * duration / session per note) + presence gauges. No new structural
 * variant; pattern saturated at 15 @ T-A.15.
 *
 * Use case: realtime-collab presence dashboard. Operators want
 * distinct-user count ("how many concurrent editors"), distinct-note
 * count ("how many notes have presence"), stale-session detection
 * (long-idle sessions still holding presence rows — cleanup signal),
 * session-duration stats (typical session length signal), per-note
 * presence (most-active notes via top-N).
 *
 * Stale threshold: configurable via `staleThresholdMs` option;
 * default 5 minutes (matches the typical presence-heartbeat
 * cadence after which a session is considered abandoned).
 *
 * Stable-shape guarantees:
 *   - `byNote` is sparse — keyed by `noteId` string. Top-N truncates.
 *   - `activeSessionCount + staleSessionCount === total`
 *     (complementary on `lastActiveAt` vs `now - staleThresholdMs`).
 *   - `sessionDurationStats` is null on empty (NumericStats over
 *     `now - enteredAt`).
 *   - `inactiveDurationStats` is null on empty (NumericStats over
 *     `now - lastActiveAt`).
 *   - `sessionsPerNoteStats` is null on empty input (NumericStats
 *     over the per-note bucket counts).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import type { PresenceRow } from "./presence.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface CountEntry {
  readonly key: string;
  readonly count: number;
}

export interface PresenceListSummary {
  readonly total: number;
  /** Distinct user count across all rows. */
  readonly distinctUserCount: number;
  /** Distinct note count across all rows. */
  readonly distinctNoteCount: number;
  /** Per-noteId count. Sparse (noteId integers may be high-cardinality). */
  readonly byNote: Readonly<Record<string, number>>;
  /** Top 10 notes by presence count, sorted descending. */
  readonly topNotes: readonly CountEntry[];
  /** Rows with `lastActiveAt >= now - staleThresholdMs`. */
  readonly activeSessionCount: number;
  /** Rows with `lastActiveAt < now - staleThresholdMs`. Complementary;
   *  sum-to-total. */
  readonly staleSessionCount: number;
  /** Rows with `cursorState !== null`. */
  readonly withCursorStateCount: number;
  /** NumericStats over `now - enteredAt` (session age in ms). */
  readonly sessionDurationStats: NumericStats | null;
  /** NumericStats over `now - lastActiveAt` (idle gap in ms). */
  readonly inactiveDurationStats: NumericStats | null;
  /** NumericStats over per-note session bucket sizes. */
  readonly sessionsPerNoteStats: NumericStats | null;
}

export interface SummarizePresenceOptions {
  /** Override the clock for deterministic stats. */
  readonly now?: Date;
  /** Override the top-N truncation (default 10). */
  readonly topN?: number;
  /** Threshold for active-vs-stale partition (default 5 minutes). */
  readonly staleThresholdMs?: number;
}

const DEFAULT_TOP_N = 10;
const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

function computeStats(values: readonly number[]): NumericStats | null {
  if (values.length === 0) return null;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    count: values.length,
    sum,
    mean: Math.round((sum / values.length) * 10) / 10,
    min,
    max,
  };
}

function topN(
  byKey: Readonly<Record<string, number>>,
  n: number,
): CountEntry[] {
  const entries = Object.entries(byKey).map(([key, count]) => ({
    key,
    count,
  }));
  entries.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });
  return entries.slice(0, n);
}

export function summarizePresence(
  rows: readonly PresenceRow[],
  options: SummarizePresenceOptions = {},
): PresenceListSummary {
  const byNote: Record<string, number> = {};
  const users = new Set<number>();
  const notes = new Set<number>();
  let activeSessionCount = 0;
  let staleSessionCount = 0;
  let withCursorStateCount = 0;
  const sessionDurations: number[] = [];
  const inactiveDurations: number[] = [];

  const now = (options.now ?? new Date()).getTime();
  const top = options.topN ?? DEFAULT_TOP_N;
  const staleThreshold = options.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;

  for (const row of rows) {
    const noteKey = String(row.noteId);
    byNote[noteKey] = (byNote[noteKey] ?? 0) + 1;
    users.add(row.userId);
    notes.add(row.noteId);
    const inactiveMs = now - row.lastActiveAt.getTime();
    if (inactiveMs < staleThreshold) activeSessionCount += 1;
    else staleSessionCount += 1;
    if (row.cursorState !== null) withCursorStateCount += 1;
    sessionDurations.push(now - row.enteredAt.getTime());
    inactiveDurations.push(inactiveMs);
  }

  return {
    total: rows.length,
    distinctUserCount: users.size,
    distinctNoteCount: notes.size,
    byNote,
    topNotes: topN(byNote, top),
    activeSessionCount,
    staleSessionCount,
    withCursorStateCount,
    sessionDurationStats: computeStats(sessionDurations),
    inactiveDurationStats: computeStats(inactiveDurations),
    sessionsPerNoteStats: computeStats(Object.values(byNote)),
  };
}
