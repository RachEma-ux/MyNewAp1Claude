/**
 * Phase I §T-I.36 — `summarizePendingPermissionRequests` lockstep.
 *
 * 22nd instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  PENDING_PERMISSION_REQUEST_STATUSES,
  summarizePendingPermissionRequests,
  type SummarizePendingPermissionRequestsInput,
} from "../../server/agent-studio/services/approval/pending-permission-request-summary.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(
  overrides: Partial<SummarizePendingPermissionRequestsInput> = {},
): SummarizePendingPermissionRequestsInput {
  return {
    status: "pending",
    decidedAt: null,
    createdAt: FROZEN_NOW,
    reason: null,
    proposedToolCallJson: null,
    expiresAt: null,
    ...overrides,
  };
}

describe("PENDING_PERMISSION_REQUEST_STATUSES — invariant", () => {
  it("contains exactly 4 closed values", () => {
    expect(PENDING_PERMISSION_REQUEST_STATUSES.length).toBe(4);
    expect(new Set(PENDING_PERMISSION_REQUEST_STATUSES)).toEqual(
      new Set(["pending", "allowed", "denied", "timed_out"]),
    );
  });
});

describe("summarizePendingPermissionRequests — empty", () => {
  it("zero on every axis", () => {
    const s = summarizePendingPermissionRequests([]);
    expect(s.total).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.unknownStatusCount).toBe(0);
    expect(s.decisionLagStats).toBeNull();
    expect(s.approvalRate).toBeNull();
    expect(s.withReasonCount).toBe(0);
    expect(s.withProposedToolCallCount).toBe(0);
    expect(s.withExpiresAtCount).toBe(0);
  });

  it("byStatus carries every closed status at 0", () => {
    const s = summarizePendingPermissionRequests([]);
    for (const status of PENDING_PERMISSION_REQUEST_STATUSES) {
      expect(s.byStatus[status]).toBe(0);
    }
  });
});

describe("summarizePendingPermissionRequests — status partition", () => {
  it("terminal + inFlight + unknown sums to total", () => {
    const s = summarizePendingPermissionRequests([
      makeRow({ status: "pending" }),
      makeRow({ status: "allowed" }),
      makeRow({ status: "denied" }),
      makeRow({ status: "timed_out" }),
      makeRow({ status: "drift" }),
    ]);
    expect(s.terminalCount).toBe(3); // allowed + denied + timed_out
    expect(s.inFlightCount).toBe(1); // pending
    expect(s.unknownStatusCount).toBe(1);
  });
});

describe("summarizePendingPermissionRequests — approval rate", () => {
  it("null when no decisions yet", () => {
    const s = summarizePendingPermissionRequests([
      makeRow({ status: "pending" }),
      makeRow({ status: "timed_out" }),
    ]);
    expect(s.approvalRate).toBeNull();
  });

  it("excludes timed_out from rate denominator", () => {
    const s = summarizePendingPermissionRequests([
      makeRow({ status: "allowed" }),
      makeRow({ status: "allowed" }),
      makeRow({ status: "denied" }),
      makeRow({ status: "timed_out" }), // excluded
      makeRow({ status: "timed_out" }), // excluded
    ]);
    // 2 / 3 = 66.7
    expect(s.approvalRate).toBe(66.7);
  });
});

describe("summarizePendingPermissionRequests — decision lag stats", () => {
  it("computes ms lag for rows with decidedAt", () => {
    const s = summarizePendingPermissionRequests([
      makeRow({
        status: "allowed",
        createdAt: new Date(FROZEN_NOW.getTime() - 5000),
        decidedAt: new Date(FROZEN_NOW.getTime() - 3000),
      }),
      makeRow({
        status: "denied",
        createdAt: new Date(FROZEN_NOW.getTime() - 10_000),
        decidedAt: new Date(FROZEN_NOW.getTime() - 1000),
      }),
    ]);
    expect(s.decisionLagStats!.count).toBe(2);
    expect(s.decisionLagStats!.sum).toBe(11_000); // 2000 + 9000
  });

  it("null when no rows have decidedAt", () => {
    const s = summarizePendingPermissionRequests([
      makeRow({ status: "pending", decidedAt: null }),
    ]);
    expect(s.decisionLagStats).toBeNull();
  });
});

describe("summarizePendingPermissionRequests — gauges", () => {
  it("withReasonCount counts non-null reason", () => {
    const s = summarizePendingPermissionRequests([
      makeRow({ reason: null }),
      makeRow({ reason: "denied by policy" }),
    ]);
    expect(s.withReasonCount).toBe(1);
  });

  it("withProposedToolCallCount counts non-null proposedToolCallJson", () => {
    const s = summarizePendingPermissionRequests([
      makeRow({ proposedToolCallJson: null }),
      makeRow({ proposedToolCallJson: {} }),
    ]);
    expect(s.withProposedToolCallCount).toBe(1);
  });

  it("withExpiresAtCount counts non-null expiresAt", () => {
    const s = summarizePendingPermissionRequests([
      makeRow({ expiresAt: null }),
      makeRow({ expiresAt: FROZEN_NOW }),
      makeRow({ expiresAt: FROZEN_NOW }),
    ]);
    expect(s.withExpiresAtCount).toBe(2);
  });
});
