/**
 * Phase 22 — workspaceObservability.getMyInbox router smoke test
 * (PR #535).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { inboxMock } = vi.hoisted(() => ({ inboxMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/inbox.js",
  () => ({ getInboxComposite: inboxMock }),
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  inboxMock.mockReset();
  inboxMock.mockResolvedValue({
    notifications: [],
    unreadCount: { total: 0, byKind: {} },
  });
});

describe("workspaceObservabilityRouter.getMyInbox", () => {
  it("is mounted as a procedure", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.getMyInbox).toBeDefined();
  });

  it("scopes the call to ctx.user.id and forwards filters", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    await caller.getMyInbox({
      unreadOnly: true,
      notificationKind: "promotion.approved",
      limit: 25,
    });
    expect(inboxMock).toHaveBeenCalledWith({
      userId: 42,
      unreadOnly: true,
      notificationKind: "promotion.approved",
      limit: 25,
    });
  });

  it("rejects unauthenticated callers (protectedProcedure gate)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({} as never);
    await expect(caller.getMyInbox(undefined)).rejects.toThrow();
    expect(inboxMock).not.toHaveBeenCalled();
  });

  it("rejects out-of-range limit at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(caller.getMyInbox({ limit: 0 })).rejects.toThrow();
    await expect(caller.getMyInbox({ limit: 999 })).rejects.toThrow();
    expect(inboxMock).not.toHaveBeenCalled();
  });
});
