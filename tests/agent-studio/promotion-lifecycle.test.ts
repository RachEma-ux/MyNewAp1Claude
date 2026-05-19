/**
 * Phase 11 — promotion lifecycle tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  PromotionLifecycle,
  type PromotionAdapter,
  type PromotionRequest,
  type PromotionStatus,
} from "../../server/agent-studio/services/promotion/public-api.js";

class PromotionAdapterStub implements PromotionAdapter {
  validateResult = { ok: true, errors: [] };
  governanceResult: { approved: boolean; approvalRequired: boolean; reason?: string } = {
    approved: true,
    approvalRequired: false,
  };
  createdPromotions: Array<{ noteId: number; kind: string }> = [];
  activatedVersionIds: number[] = [];
  rollbacks: number[] = [];
  emittedEvents: Array<{ promotionId: number; status: PromotionStatus }> = [];
  private nextId = 1;

  async validate(_request: PromotionRequest) {
    return this.validateResult;
  }
  async evaluateGovernance() {
    return this.governanceResult;
  }
  async createDraft(request: PromotionRequest) {
    const promotionId = this.nextId++;
    this.createdPromotions.push({ noteId: request.noteId, kind: request.promotionKind });
    return { promotionId };
  }
  async activateVersion(promotionId: number) {
    const versionId = 2000 + promotionId;
    this.activatedVersionIds.push(versionId);
    // Slice 16 no-deferral: activateVersion owns the target-asset
    // binding. The version id is the target asset id by construction.
    return { versionId, targetAssetId: versionId };
  }
  async rollback(promotionId: number) {
    this.rollbacks.push(promotionId);
    return { activatedVersionId: 1234 };
  }
  async emitProjectionEvent(promotionId: number, status: PromotionStatus) {
    this.emittedEvents.push({ promotionId, status });
  }
}

describe("PromotionLifecycle — submit", () => {
  let adapter: PromotionAdapterStub;
  let lifecycle: PromotionLifecycle;

  beforeEach(() => {
    adapter = new PromotionAdapterStub();
    lifecycle = new PromotionLifecycle(adapter);
  });

  it("approves immediately when no approval required", async () => {
    adapter.governanceResult = { approved: true, approvalRequired: false };
    const r = await lifecycle.submit({
      noteId: 1,
      noteVersionId: 100,
      promotionKind: "cag_block",
      initiatedByUserId: 7,
    });
    expect(r.status).toBe("approved");
    expect(adapter.activatedVersionIds.length).toBe(1);
    expect(adapter.emittedEvents.at(-1)).toEqual({ promotionId: 1, status: "approved" });
  });

  it("queues for review when approval required and not pre-approved", async () => {
    adapter.governanceResult = { approved: false, approvalRequired: true };
    const r = await lifecycle.submit({
      noteId: 1,
      noteVersionId: 100,
      promotionKind: "policy",
      initiatedByUserId: 7,
    });
    expect(r.status).toBe("in_review");
    expect(adapter.activatedVersionIds.length).toBe(0);
    expect(adapter.emittedEvents.at(-1)).toEqual({ promotionId: 1, status: "in_review" });
  });

  it("rejects when validation fails", async () => {
    adapter.validateResult = { ok: false, errors: [{ field: "frontmatter", message: "missing" }] };
    const r = await lifecycle.submit({
      noteId: 1,
      noteVersionId: 100,
      promotionKind: "policy",
      initiatedByUserId: 7,
    });
    expect(r.status).toBe("rejected");
    expect(adapter.activatedVersionIds.length).toBe(0);
  });
});

describe("PromotionLifecycle — approve / reject / rollback", () => {
  let adapter: PromotionAdapterStub;
  let lifecycle: PromotionLifecycle;

  beforeEach(() => {
    adapter = new PromotionAdapterStub();
    lifecycle = new PromotionLifecycle(adapter);
  });

  it("approve activates version + emits approved event", async () => {
    const r = await lifecycle.approve(42, 99);
    expect(r.status).toBe("approved");
    expect(adapter.activatedVersionIds).toEqual([2042]);
    expect(adapter.emittedEvents.at(-1)).toEqual({ promotionId: 42, status: "approved" });
  });

  it("reject emits rejected event without activating", async () => {
    const r = await lifecycle.reject(42, 99);
    expect(r.status).toBe("rejected");
    expect(adapter.activatedVersionIds.length).toBe(0);
    expect(adapter.emittedEvents.at(-1)).toEqual({ promotionId: 42, status: "rejected" });
  });

  it("rollback restores previous version + emits rolled_back event", async () => {
    const r = await lifecycle.rollback(42, 99);
    expect(r.status).toBe("rolled_back");
    expect(r.activatedVersionId).toBe(1234);
    expect(adapter.rollbacks).toEqual([42]);
    expect(adapter.emittedEvents.at(-1)).toEqual({ promotionId: 42, status: "rolled_back" });
  });
});
