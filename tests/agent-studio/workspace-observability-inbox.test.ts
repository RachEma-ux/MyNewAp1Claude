/**
 * Phase 22 — getInboxComposite per-user inbox bundle (PR #535).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { listMock, countMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  countMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/user-notifications.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return {
      ...real,
      listNotifications: listMock,
      countUnreadNotifications: countMock,
    };
  },
);

import { getInboxComposite } from "../../server/agent-studio/services/workspace-observability/inbox";

beforeEach(() => {
  listMock.mockReset();
  countMock.mockReset();
  listMock.mockResolvedValue([]);
  countMock.mockResolvedValue({ total: 0, byKind: {} });
});

describe("getInboxComposite", () => {
  it("returns the bundled payload from both underlying calls", async () => {
    listMock.mockResolvedValueOnce([
      { id: 1, userId: 42, notificationKind: "x", payload: null, read: false, createdAt: new Date() },
    ]);
    countMock.mockResolvedValueOnce({ total: 1, byKind: { x: 1 } });

    const payload = await getInboxComposite({ userId: 42 });

    expect(payload.notifications).toHaveLength(1);
    expect(payload.unreadCount.total).toBe(1);
  });

  it("defaults the inbox limit to 50 and forwards user filters", async () => {
    await getInboxComposite({
      userId: 42,
      unreadOnly: true,
      notificationKind: "promotion.approved",
    });
    expect(listMock).toHaveBeenCalledWith(
      {
        userId: 42,
        unreadOnly: true,
        notificationKind: "promotion.approved",
        limit: 50,
      },
      {},
    );
    expect(countMock).toHaveBeenCalledWith(42, {});
  });

  it("respects an explicit limit", async () => {
    await getInboxComposite({ userId: 42, limit: 5 });
    expect(listMock.mock.calls[0][0].limit).toBe(5);
  });

  it("fans the two calls out in parallel (Promise.all)", async () => {
    const order: string[] = [];
    listMock.mockImplementationOnce(async () => {
      order.push("list:start");
      await new Promise((r) => setTimeout(r, 25));
      order.push("list:end");
      return [];
    });
    countMock.mockImplementationOnce(async () => {
      order.push("count:start");
      await new Promise((r) => setTimeout(r, 25));
      order.push("count:end");
      return { total: 0, byKind: {} };
    });

    await getInboxComposite({ userId: 1 });

    const starts = [order.indexOf("list:start"), order.indexOf("count:start")];
    const ends = [order.indexOf("list:end"), order.indexOf("count:end")];
    expect(Math.max(...starts)).toBeLessThan(Math.min(...ends));
  });
});
