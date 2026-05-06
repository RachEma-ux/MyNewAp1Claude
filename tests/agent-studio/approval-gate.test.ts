/**
 * Retrofit P9 — Approval gate (pure decision logic + TTL math).
 *
 * The DB-backed paths (evaluateApprovalGate / createApprovalRequest /
 * decideApprovalRequest) live behind getAsDb(); they're exercised in
 * Phase 13 e2e against a live ASDB. Here we test the pure helpers
 * that lock the D-APP-EXT-2 state machine + D-APP-EXT-5 expiry rule.
 */

import { describe, it, expect } from "vitest";
import {
  computeExpiresAt,
  decideApprovalState,
  type ApprovalRowSnapshot,
} from "../../server/agent-studio/services/approval/approval-gate";

const NOW = new Date("2026-05-06T12:00:00.000Z");

function row(over: Partial<ApprovalRowSnapshot>): ApprovalRowSnapshot {
  return {
    status: "pending",
    expiresAt: null,
    proposedToolCallHash: "h",
    ...over,
  };
}

describe("decideApprovalState — D-APP-EXT-2 lattice", () => {
  it("null row → approval_required", () => {
    expect(decideApprovalState(null, NOW)).toBe("approval_required");
  });

  it("allowed + future expiry → permit", () => {
    const r = row({
      status: "allowed",
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    expect(decideApprovalState(r, NOW)).toBe("permit");
  });

  it("allowed + past expiry → expired", () => {
    const r = row({
      status: "allowed",
      expiresAt: new Date(NOW.getTime() - 60_000),
    });
    expect(decideApprovalState(r, NOW)).toBe("expired");
  });

  it("allowed + null expiry → permit (legacy row, no expiry recorded)", () => {
    const r = row({ status: "allowed", expiresAt: null });
    expect(decideApprovalState(r, NOW)).toBe("permit");
  });

  it("denied → denied", () => {
    expect(decideApprovalState(row({ status: "denied" }), NOW)).toBe("denied");
  });

  it("timed_out → expired", () => {
    expect(decideApprovalState(row({ status: "timed_out" }), NOW)).toBe(
      "expired",
    );
  });

  it("pending → pending", () => {
    expect(decideApprovalState(row({ status: "pending" }), NOW)).toBe(
      "pending",
    );
  });

  it("expiry equal to now → expired (strict greater-than)", () => {
    const r = row({ status: "allowed", expiresAt: new Date(NOW.getTime()) });
    expect(decideApprovalState(r, NOW)).toBe("expired");
  });
});

describe("computeExpiresAt — D-APP-EXT-5", () => {
  it("default TTL is 1 hour when override is null", () => {
    const e = computeExpiresAt(NOW, null);
    expect(e.getTime() - NOW.getTime()).toBe(3600 * 1000);
  });

  it("default TTL is 1 hour when override is undefined", () => {
    const e = computeExpiresAt(NOW, undefined);
    expect(e.getTime() - NOW.getTime()).toBe(3600 * 1000);
  });

  it("honors per-tool override when positive", () => {
    const e = computeExpiresAt(NOW, 300); // 5 minutes
    expect(e.getTime() - NOW.getTime()).toBe(300 * 1000);
  });

  it("ignores zero / negative override → falls back to default", () => {
    expect(computeExpiresAt(NOW, 0).getTime() - NOW.getTime()).toBe(
      3600 * 1000,
    );
    expect(computeExpiresAt(NOW, -42).getTime() - NOW.getTime()).toBe(
      3600 * 1000,
    );
  });

  it("supports long overrides (8h ambient credential-sensitive case from ADR)", () => {
    const e = computeExpiresAt(NOW, 8 * 3600);
    expect(e.getTime() - NOW.getTime()).toBe(8 * 3600 * 1000);
  });
});
