/**
 * Phase 22 — runRetentionSweep bundles pruneOldErrorEvents +
 * pruneOldNotifications + pruneOldBackgroundJobs into one call
 * (PR #521 + #523 third leg).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneErrorMock, pruneNotifMock, pruneJobsMock } = vi.hoisted(() => ({
  pruneErrorMock: vi.fn(),
  pruneNotifMock: vi.fn(),
  pruneJobsMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/error-events.js",
  () => ({ pruneOldErrorEvents: pruneErrorMock }),
);
vi.mock(
  "../../server/agent-studio/services/workspace-observability/user-notifications.js",
  () => ({ pruneOldNotifications: pruneNotifMock }),
);
vi.mock(
  "../../server/agent-studio/services/workspace-observability/background-jobs.js",
  () => ({ pruneOldBackgroundJobs: pruneJobsMock }),
);

import { runRetentionSweep } from "../../server/agent-studio/services/workspace-observability/retention-sweep";

beforeEach(() => {
  pruneErrorMock.mockReset();
  pruneNotifMock.mockReset();
  pruneJobsMock.mockReset();
  pruneErrorMock.mockResolvedValue({ deletedCount: 0 });
  pruneNotifMock.mockResolvedValue({ deletedCount: 0 });
  pruneJobsMock.mockResolvedValue({ deletedCount: 0 });
});

describe("runRetentionSweep", () => {
  it("uses 30-day defaults when input is omitted", async () => {
    const now = new Date("2026-05-12T00:00:00Z");
    pruneErrorMock.mockResolvedValueOnce({ deletedCount: 5 });
    pruneNotifMock.mockResolvedValueOnce({ deletedCount: 7 });
    pruneJobsMock.mockResolvedValueOnce({ deletedCount: 9 });

    const result = await runRetentionSweep({}, { now });

    expect(result.errorEventsDeleted).toBe(5);
    expect(result.notificationsDeleted).toBe(7);
    expect(result.backgroundJobsDeleted).toBe(9);
    // 30 days * 86_400_000 ms = 2_592_000_000 → 2026-04-12
    expect(result.errorEventsCutoff.toISOString().slice(0, 10)).toBe(
      "2026-04-12",
    );
    expect(result.notificationsCutoff.toISOString().slice(0, 10)).toBe(
      "2026-04-12",
    );
    expect(result.backgroundJobsCutoff.toISOString().slice(0, 10)).toBe(
      "2026-04-12",
    );
  });

  it("respects independent retention overrides per table", async () => {
    const now = new Date("2026-05-12T00:00:00Z");
    await runRetentionSweep(
      {
        errorEventsRetentionDays: 7,
        notificationsRetentionDays: 60,
        backgroundJobsRetentionDays: 14,
      },
      { now },
    );
    expect(pruneErrorMock).toHaveBeenCalledTimes(1);
    expect(pruneNotifMock).toHaveBeenCalledTimes(1);
    expect(pruneJobsMock).toHaveBeenCalledTimes(1);
    const errorCutoff = pruneErrorMock.mock.calls[0][0].olderThan as Date;
    const notifCutoff = pruneNotifMock.mock.calls[0][0].olderThan as Date;
    const jobsCutoff = pruneJobsMock.mock.calls[0][0].olderThan as Date;
    expect(errorCutoff.toISOString().slice(0, 10)).toBe("2026-05-05");
    expect(notifCutoff.toISOString().slice(0, 10)).toBe("2026-03-13");
    expect(jobsCutoff.toISOString().slice(0, 10)).toBe("2026-04-28");
  });

  it("passes notificationsReadOnly through to the notification prune", async () => {
    await runRetentionSweep(
      { notificationsReadOnly: true },
      { now: new Date() },
    );
    expect(pruneNotifMock.mock.calls[0][0].readOnly).toBe(true);
  });

  it("passes notificationsNotificationKind through (single, #551)", async () => {
    await runRetentionSweep(
      { notificationsNotificationKind: "graph_quality_run_completed" },
      { now: new Date() },
    );
    expect(pruneNotifMock.mock.calls[0][0].notificationKind).toBe(
      "graph_quality_run_completed",
    );
  });

  it("passes notificationsNotificationKind through (array, #551)", async () => {
    await runRetentionSweep(
      {
        notificationsNotificationKind: [
          "graph_quality_run_completed",
          "import_complete",
        ],
      },
      { now: new Date() },
    );
    expect(pruneNotifMock.mock.calls[0][0].notificationKind).toEqual([
      "graph_quality_run_completed",
      "import_complete",
    ]);
  });

  it("passes backgroundJobsStatuses through to the jobs prune (aggressive cleanup)", async () => {
    await runRetentionSweep(
      { backgroundJobsStatuses: ["completed", "failed", "cancelled"] },
      { now: new Date() },
    );
    expect(pruneJobsMock.mock.calls[0][0].statuses).toEqual([
      "completed",
      "failed",
      "cancelled",
    ]);
  });

  it("passes backgroundJobsJobKind through to the jobs prune (single kind, #549)", async () => {
    await runRetentionSweep(
      { backgroundJobsJobKind: "projection.rebuild" },
      { now: new Date() },
    );
    expect(pruneJobsMock.mock.calls[0][0].jobKind).toBe("projection.rebuild");
  });

  it("passes backgroundJobsJobKind through to the jobs prune (array, #549)", async () => {
    await runRetentionSweep(
      { backgroundJobsJobKind: ["projection.rebuild", "import.scan"] },
      { now: new Date() },
    );
    expect(pruneJobsMock.mock.calls[0][0].jobKind).toEqual([
      "projection.rebuild",
      "import.scan",
    ]);
  });

  it("passes backgroundJobsJobKindLike through to the jobs prune (#602)", async () => {
    await runRetentionSweep(
      { backgroundJobsJobKindLike: "projection.%" },
      { now: new Date() },
    );
    expect(pruneJobsMock.mock.calls[0][0].jobKindLike).toBe("projection.%");
  });

  it("ANDs backgroundJobsJobKindLike with backgroundJobsLastErrorLike (#602)", async () => {
    await runRetentionSweep(
      {
        backgroundJobsJobKindLike: "ingestion.%",
        backgroundJobsLastErrorLike: "%timeout%",
        backgroundJobsStatuses: ["failed"],
      },
      { now: new Date() },
    );
    expect(pruneJobsMock.mock.calls[0][0]).toMatchObject({
      jobKindLike: "ingestion.%",
      lastErrorLike: "%timeout%",
      statuses: ["failed"],
    });
  });

  it("passes notificationsNotificationKindLike through to the notifications prune (#603)", async () => {
    await runRetentionSweep(
      { notificationsNotificationKindLike: "promotion.%" },
      { now: new Date() },
    );
    expect(pruneNotifMock.mock.calls[0][0].notificationKindLike).toBe(
      "promotion.%",
    );
  });

  it("ANDs notificationsNotificationKindLike with notificationsReadOnly (#603)", async () => {
    await runRetentionSweep(
      {
        notificationsNotificationKindLike: "import.%",
        notificationsReadOnly: true,
      },
      { now: new Date() },
    );
    expect(pruneNotifMock.mock.calls[0][0]).toMatchObject({
      notificationKindLike: "import.%",
      readOnly: true,
    });
  });

  it("passes errorEventsErrorClass through to the errors prune (single, #550)", async () => {
    await runRetentionSweep(
      { errorEventsErrorClass: "ValidationError" },
      { now: new Date() },
    );
    expect(pruneErrorMock.mock.calls[0][0].errorClass).toBe("ValidationError");
  });

  it("passes errorEventsErrorClass through to the errors prune (array, #550)", async () => {
    await runRetentionSweep(
      { errorEventsErrorClass: ["ValidationError", "RateLimitError"] },
      { now: new Date() },
    );
    expect(pruneErrorMock.mock.calls[0][0].errorClass).toEqual([
      "ValidationError",
      "RateLimitError",
    ]);
  });

  it("passes errorEventsSourceKindLike through to the errors prune (#604)", async () => {
    await runRetentionSweep(
      { errorEventsSourceKindLike: "trpc.chat.%" },
      { now: new Date() },
    );
    expect(pruneErrorMock.mock.calls[0][0].sourceKindLike).toBe("trpc.chat.%");
  });

  it("ANDs errorEventsSourceKindLike with errorEventsErrorClass (#604)", async () => {
    await runRetentionSweep(
      {
        errorEventsSourceKindLike: "vault.%",
        errorEventsErrorClass: "ValidationError",
      },
      { now: new Date() },
    );
    expect(pruneErrorMock.mock.calls[0][0]).toMatchObject({
      sourceKindLike: "vault.%",
      errorClass: "ValidationError",
    });
  });

  it("runs all three prunes in parallel (not serially)", async () => {
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
    pruneJobsMock.mockImplementationOnce(async () => {
      callOrder.push("jobs:start");
      await new Promise((r) => setTimeout(r, 30));
      callOrder.push("jobs:end");
      return { deletedCount: 0 };
    });

    await runRetentionSweep({}, { now: new Date() });

    // All three :start markers must precede any :end marker (parallel via Promise.all).
    const starts = [
      callOrder.indexOf("error:start"),
      callOrder.indexOf("notif:start"),
      callOrder.indexOf("jobs:start"),
    ];
    const ends = [
      callOrder.indexOf("error:end"),
      callOrder.indexOf("notif:end"),
      callOrder.indexOf("jobs:end"),
    ];
    expect(Math.max(...starts)).toBeLessThan(Math.min(...ends));
  });

  it("returns zero counts when all prunes return zero", async () => {
    const result = await runRetentionSweep({}, { now: new Date() });
    expect(result.errorEventsDeleted).toBe(0);
    expect(result.notificationsDeleted).toBe(0);
    expect(result.backgroundJobsDeleted).toBe(0);
  });
});
