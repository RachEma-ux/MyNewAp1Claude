/**
 * Phase I §T-I.37 — `summarizeUserNotifications` lockstep.
 *
 * Composite sparse-axis aggregator over the `NotificationRow` surface.
 * 25th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import { summarizeUserNotifications } from "../../server/agent-studio/services/workspace-observability/user-notification-summary.js";
import type { NotificationRow } from "../../server/agent-studio/services/workspace-observability/user-notifications.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 1,
    userId: 1,
    notificationKind: "test_kind",
    payload: null,
    read: false,
    createdAt: FROZEN_NOW,
    ...overrides,
  };
}

describe("summarizeUserNotifications — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeUserNotifications([]);
    expect(s.total).toBe(0);
    expect(s.distinctNotificationKindCount).toBe(0);
    expect(s.distinctUserCount).toBe(0);
    expect(s.topNotificationKinds).toEqual([]);
    expect(s.readCount).toBe(0);
    expect(s.unreadCount).toBe(0);
    expect(s.withPayloadCount).toBe(0);
    expect(s.ageStats).toBeNull();
    expect(s.byNotificationKind).toEqual({});
  });
});

describe("summarizeUserNotifications — sparse kind axis", () => {
  it("counts per notificationKind", () => {
    const s = summarizeUserNotifications([
      makeRow({ notificationKind: "promotion_approved" }),
      makeRow({ notificationKind: "promotion_approved" }),
      makeRow({ notificationKind: "runtime_run_failed" }),
    ]);
    expect(s.byNotificationKind.promotion_approved).toBe(2);
    expect(s.byNotificationKind.runtime_run_failed).toBe(1);
    expect(s.distinctNotificationKindCount).toBe(2);
  });

  it("unregistered kinds don't appear in sparse axis", () => {
    const s = summarizeUserNotifications([
      makeRow({ notificationKind: "promotion_approved" }),
    ]);
    expect(s.byNotificationKind.never_seen).toBeUndefined();
  });
});

describe("summarizeUserNotifications — top-N truncation", () => {
  it("returns top kinds by count descending; ties broken alphabetically", () => {
    const rows: NotificationRow[] = [];
    for (let i = 0; i < 5; i++) rows.push(makeRow({ notificationKind: "a" }));
    for (let i = 0; i < 3; i++) rows.push(makeRow({ notificationKind: "b" }));
    rows.push(makeRow({ notificationKind: "c" }));
    rows.push(makeRow({ notificationKind: "d" }));
    const s = summarizeUserNotifications(rows);
    expect(s.topNotificationKinds).toEqual([
      { key: "a", count: 5 },
      { key: "b", count: 3 },
      { key: "c", count: 1 },
      { key: "d", count: 1 },
    ]);
  });

  it("default truncates at 10 entries", () => {
    const rows: NotificationRow[] = [];
    for (let i = 0; i < 15; i++) {
      rows.push(makeRow({ notificationKind: `kind_${String(i).padStart(2, "0")}` }));
    }
    const s = summarizeUserNotifications(rows);
    expect(s.topNotificationKinds).toHaveLength(10);
  });

  it("custom topN overrides default", () => {
    const rows: NotificationRow[] = [];
    for (let i = 0; i < 5; i++) rows.push(makeRow({ notificationKind: `k${i}` }));
    const s = summarizeUserNotifications(rows, { topN: 2 });
    expect(s.topNotificationKinds).toHaveLength(2);
  });
});

describe("summarizeUserNotifications — read/unread partition", () => {
  it("readCount + unreadCount === total (complementary)", () => {
    const s = summarizeUserNotifications([
      makeRow({ read: true }),
      makeRow({ read: false }),
      makeRow({ read: true }),
      makeRow({ read: false }),
      makeRow({ read: false }),
    ]);
    expect(s.readCount).toBe(2);
    expect(s.unreadCount).toBe(3);
    expect(s.readCount + s.unreadCount).toBe(s.total);
  });
});

describe("summarizeUserNotifications — gauges", () => {
  it("withPayloadCount counts non-null payloads", () => {
    const s = summarizeUserNotifications([
      makeRow({ payload: { foo: 1 } }),
      makeRow({ payload: null }),
      makeRow({ payload: {} }),
    ]);
    expect(s.withPayloadCount).toBe(2);
  });

  it("distinctUserCount counts unique userIds", () => {
    const s = summarizeUserNotifications([
      makeRow({ userId: 1 }),
      makeRow({ userId: 1 }),
      makeRow({ userId: 2 }),
      makeRow({ userId: 3 }),
    ]);
    expect(s.distinctUserCount).toBe(3);
  });
});

describe("summarizeUserNotifications — ageStats", () => {
  it("computes age stats in ms from createdAt to now", () => {
    const earlier = new Date(FROZEN_NOW.getTime() - 60_000); // 60s ago
    const s = summarizeUserNotifications(
      [makeRow({ createdAt: earlier })],
      { now: FROZEN_NOW },
    );
    expect(s.ageStats).not.toBeNull();
    expect(s.ageStats!.count).toBe(1);
    expect(s.ageStats!.min).toBe(60_000);
    expect(s.ageStats!.max).toBe(60_000);
  });
});

describe("summarizeUserNotifications — total invariant", () => {
  it("total equals input row count", () => {
    const s = summarizeUserNotifications([
      makeRow(),
      makeRow(),
      makeRow(),
    ]);
    expect(s.total).toBe(3);
  });
});
