/**
 * Phase 22 — runRetentionSweep bundles pruneOldErrorEvents +
 * pruneOldNotifications into one call (PR #521).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneErrorMock, pruneNotifMock } = vi.hoisted(() => ({
  pruneErrorMock: vi.fn(),
  pruneNotifMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/error-events.js",
  () => ({ pruneOldErrorEvents: pruneErrorMock }),
);
vi.mock(
  "../../server/agent-studio/services/workspace-observability/user-notifications.js",
  () => ({ pruneOldNotifications: pruneNotifMock }),
);

import { runRetentionSweep } from "../../server/agent-studio/services/workspace-observability/retention-sweep";

beforeEach(() => {
  pruneErrorMock.mockReset();
  pruneNotifMock.mockReset();
  pruneErrorMock.mockResolvedValue({ deletedCount: 0 });
  pruneNotifMock.mockResolvedValue({ deletedCount: 0 });
});

describe("runRetentionSweep", () => {
  it("uses 30-day defaults when input is omitted", async () => {
    const now = new Date("2026-05-12T00:00:00Z");
    pruneErrorMock.mockResolvedValueOnce({ deletedCount: 5 });
    pruneNotifMock.mockResolvedValueOnce({ deletedCount: 7 });

    const result = await runRetentionSweep({}, { now });

    expect(result.errorEventsDeleted).toBe(5);
    expect(result.notificationsDeleted).toBe(7);
    // 30 days * 86_400_000 ms = 2_592_000_000 → 2026-04-12
    expect(result.errorEventsCutoff.toISOString().slice(0, 10)).toBe(
      "2026-04-12",
    );
    expect(result.notificationsCutoff.toISOString().slice(0, 10)).toBe(
      "2026-04-12",
    );
  });

  it("respects independent retention overrides per table", async () => {
    const now = new Date("2026-05-12T00:00:00Z");
    await runRetentionSweep(
      { errorEventsRetentionDays: 7, notificationsRetentionDays: 60 },
      { now },
    );
    expect(pruneErrorMock).toHaveBeenCalledTimes(1);
    expect(pruneNotifMock).toHaveBeenCalledTimes(1);
    const errorCutoff = pruneErrorMock.mock.calls[0][0].olderThan as Date;
    const notifCutoff = pruneNotifMock.mock.calls[0][0].olderThan as Date;
    expect(errorCutoff.toISOString().slice(0, 10)).toBe("2026-05-05");
    expect(notifCutoff.toISOString().slice(0, 10)).toBe("2026-03-13");
  });

  it("passes notificationsReadOnly through to the notification prune", async () => {
    await runRetentionSweep(
      { notificationsReadOnly: true },
      { now: new Date() },
    );
    expect(pruneNotifMock.mock.calls[0][0].readOnly).toBe(true);
  });

  it("runs both prunes in parallel (not serially)", async () => {
    const callOrder: string[] = [];
    pruneErrorMock.mockImplementationOnce(async () => {
      callOrder.push("error:start");
      await new Promise((r) => setTimeout(r, 30));
      callOrder.push("error:end");
      return { deletedCount: 0 };
    });
    pruneNotifMock.mockImplementationOnce(async () => {
      callOrder.push("notif:start");
      await new Promise((r) => setTimeout(r, 30));
      callOrder.push("notif:end");
      return { deletedCount: 0 };
    });

    await runRetentionSweep({}, { now: new Date() });

    // Both :start markers must precede any :end marker (parallel via Promise.all).
    const errorStart = callOrder.indexOf("error:start");
    const notifStart = callOrder.indexOf("notif:start");
    const errorEnd = callOrder.indexOf("error:end");
    const notifEnd = callOrder.indexOf("notif:end");
    expect(Math.max(errorStart, notifStart)).toBeLessThan(
      Math.min(errorEnd, notifEnd),
    );
  });

  it("returns zero counts when both prunes return zero", async () => {
    const result = await runRetentionSweep({}, { now: new Date() });
    expect(result.errorEventsDeleted).toBe(0);
    expect(result.notificationsDeleted).toBe(0);
  });
});
