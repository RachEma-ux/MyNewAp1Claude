/**
 * Handoff Wiring — round-trip tests
 *
 * Proves the handoff manager round-trip:
 *   - submit handoff → acceptor invoked → status accepted
 *   - reject path
 *   - completion via transitionHandoff
 *   - invalid transition (fromModule == toModule) fails
 *   - all 8 statuses are usable
 *   - handoff carries actor / workspace / correlation / governance receipt
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetHandoffsForTests,
  getHandoff,
  listHandoffs,
  registerHandoffAcceptor,
  submitHandoff,
  transitionHandoff,
} from ".";
import type { HandoffStatus } from "./types";

beforeEach(() => {
  __resetHandoffsForTests();
});

describe("Handoff Manager — round-trip", () => {
  it("submit → acceptor → accepted", async () => {
    let acceptorCalledWith: { actorId: number | string; workspaceId: number | string } | null = null;
    registerHandoffAcceptor("pmCentral", "ps.pmCentral", async (h) => {
      acceptorCalledWith = { actorId: h.actorId, workspaceId: h.workspaceId };
      return { accepted: true };
    });
    const h = await submitHandoff({
      fromModule: "ps",
      toModule: "pmCentral",
      type: "ps.pmCentral",
      payload: { ideationId: 7 },
      actorId: 42,
      workspaceId: 1,
      governanceReceipt: "rcpt-1",
    });
    expect(h.status).toBe("accepted");
    expect(h.governanceReceipt).toBe("rcpt-1");
    expect(h.correlationId).toBeTruthy();
    expect(acceptorCalledWith).toEqual({ actorId: 42, workspaceId: 1 });
  });

  it("acceptor returning {accepted:false, reason} → rejected", async () => {
    registerHandoffAcceptor("pmCentral", "ps.pmCentral", async () => ({
      accepted: false,
      reason: "not in scope",
    }));
    const h = await submitHandoff({
      fromModule: "ps",
      toModule: "pmCentral",
      type: "ps.pmCentral",
      payload: {},
      actorId: 1,
      workspaceId: 1,
    });
    expect(h.status).toBe("rejected");
    expect(h.failureReason).toBe("not in scope");
  });

  it("acceptor throwing → failed", async () => {
    registerHandoffAcceptor("pmCentral", "ps.pmCentral", async () => {
      throw new Error("boom");
    });
    const h = await submitHandoff({
      fromModule: "ps",
      toModule: "pmCentral",
      type: "ps.pmCentral",
      payload: {},
      actorId: 1,
      workspaceId: 1,
    });
    expect(h.status).toBe("failed");
    expect(h.failureReason).toBe("boom");
  });

  it("rejects fromModule == toModule", async () => {
    await expect(
      submitHandoff({
        fromModule: "alpha",
        toModule: "alpha",
        type: "alpha.x",
        payload: {},
        actorId: 1,
        workspaceId: 1,
      }),
    ).rejects.toThrow(/must differ/);
  });

  it("all 8 statuses are valid for transitionHandoff", async () => {
    registerHandoffAcceptor("alpha", "alpha.x", async () => ({ accepted: true }));
    const h = await submitHandoff({
      fromModule: "ps",
      toModule: "alpha",
      type: "alpha.x",
      payload: {},
      actorId: 1,
      workspaceId: 1,
    });
    const statuses: HandoffStatus[] = [
      "draft",
      "submitted",
      "accepted",
      "rejected",
      "in_progress",
      "completed",
      "failed",
      "cancelled",
    ];
    for (const s of statuses) {
      await transitionHandoff(h.handoffId, s);
      const fresh = await getHandoff(h.handoffId);
      expect(fresh?.status).toBe(s);
    }
  });

  it("completedAt is set on terminal transitions", async () => {
    registerHandoffAcceptor("alpha", "alpha.x", async () => ({ accepted: true }));
    const h = await submitHandoff({
      fromModule: "ps",
      toModule: "alpha",
      type: "alpha.x",
      payload: {},
      actorId: 1,
      workspaceId: 1,
    });
    await transitionHandoff(h.handoffId, "completed");
    const fresh = await getHandoff(h.handoffId);
    expect(fresh?.completedAt).toBeTruthy();

    const h2 = await submitHandoff({
      fromModule: "ps",
      toModule: "alpha",
      type: "alpha.x",
      payload: {},
      actorId: 1,
      workspaceId: 1,
    });
    await transitionHandoff(h2.handoffId, "in_progress");
    const fresh2 = await getHandoff(h2.handoffId);
    expect(fresh2?.completedAt).toBeFalsy();
  });

  it("listHandoffs supports filtering by workspace and status", async () => {
    registerHandoffAcceptor("alpha", "alpha.x", async () => ({ accepted: true }));
    await submitHandoff({
      fromModule: "ps",
      toModule: "alpha",
      type: "alpha.x",
      payload: {},
      actorId: 1,
      workspaceId: 1,
    });
    await submitHandoff({
      fromModule: "ps",
      toModule: "alpha",
      type: "alpha.x",
      payload: {},
      actorId: 1,
      workspaceId: 2,
    });

    const ws1 = await listHandoffs({ workspaceId: 1 });
    expect(ws1.length).toBe(1);

    const accepted = await listHandoffs({ status: "accepted" });
    expect(accepted.length).toBe(2);
  });
});
