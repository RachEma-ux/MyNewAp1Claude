/**
 * `summarizeUserNotifications` — stable-shape aggregator over the
 * `NotificationRow[]` surface (T-I.37).
 *
 * 25th instantiation of the lesson-30 aggregator-pair pattern in
 * the post-compaction resume window. Composite slice — composes
 * 5+ existing primitives (sparse open-ended string axis +
 * top-N truncation + complementary binary partition + payload
 * gauge + ageStats), no new structural variant.
 *
 * Use case: the workspace inbox dashboard needs a one-line rollup
 * over each user's notification stream ("128 notifications — 12
 * unread / 56 distinct kinds — oldest 7d") AND a kind-level
 * breakdown so operators can spot per-kind drift ("all 50 unread
 * are `runtime_run_failed` — alert fatigue").
 *
 * Stable-shape guarantees:
 *   - `byNotificationKind` is sparse (open-ended string axis).
 *   - `topNotificationKinds` truncates at 10 entries; ties broken
 *     alphabetically for stable order across rebuilds.
 *   - `readCount + unreadCount === total` (complementary partition).
 *   - `ageStats` is null when input is empty.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import type { NotificationRow } from "./user-notifications.js";

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

export interface UserNotificationListSummary {
  readonly total: number;
  /** Per-notificationKind count. Sparse — open-ended string axis. */
  readonly byNotificationKind: Readonly<Record<string, number>>;
  /** Distinct notificationKind values. */
  readonly distinctNotificationKindCount: number;
  /** Top 10 notification kinds by count, sorted descending. Ties
   *  broken alphabetically. */
  readonly topNotificationKinds: readonly CountEntry[];
  /** Rows with `read === true`. */
  readonly readCount: number;
  /** Rows with `read === false`. Complementary to readCount;
   *  readCount + unreadCount === total. */
  readonly unreadCount: number;
  /** Rows with `payload !== null`. */
  readonly withPayloadCount: number;
  /** Distinct userId values. */
  readonly distinctUserCount: number;
  /** Age stats in milliseconds from `createdAt` to `now`. Null when
   *  input is empty. */
  readonly ageStats: NumericStats | null;
}

export interface SummarizeUserNotificationsOptions {
  /** Override the clock for deterministic age-stats. */
  readonly now?: Date;
  /** Override the top-N truncation (default 10). */
  readonly topN?: number;
}

const DEFAULT_TOP_N = 10;

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

export function summarizeUserNotifications(
  rows: readonly NotificationRow[],
  options: SummarizeUserNotificationsOptions = {},
): UserNotificationListSummary {
  const byNotificationKind: Record<string, number> = {};
  const userIds = new Set<number>();
  let readCount = 0;
  let unreadCount = 0;
  let withPayloadCount = 0;
  const ages: number[] = [];

  const now = (options.now ?? new Date()).getTime();
  const top = options.topN ?? DEFAULT_TOP_N;

  for (const row of rows) {
    byNotificationKind[row.notificationKind] =
      (byNotificationKind[row.notificationKind] ?? 0) + 1;
    userIds.add(row.userId);
    if (row.read) readCount += 1;
    else unreadCount += 1;
    if (row.payload !== null) withPayloadCount += 1;
    ages.push(now - row.createdAt.getTime());
  }

  return {
    total: rows.length,
    byNotificationKind,
    distinctNotificationKindCount: Object.keys(byNotificationKind).length,
    topNotificationKinds: topN(byNotificationKind, top),
    readCount,
    unreadCount,
    withPayloadCount,
    distinctUserCount: userIds.size,
    ageStats: computeStats(ages),
  };
}
