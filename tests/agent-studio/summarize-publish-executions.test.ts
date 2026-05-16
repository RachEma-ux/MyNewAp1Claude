/**
 * Phase E §T-E.7 — `summarizePublishExecutions` lockstep.
 *
 * Stable-shape row-state aggregator over `PublishExecutionRow[]`.
 * Companion to T-X.7 `summarizePublishTargets` (#1188) — the
 * configured-targets row aggregator. 8th instantiation of the
 * lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import { summarizePublishExecutions } from "../../server/agent-studio/services/publish-targets/publish-execution-summary.js";
import {
  PUBLISH_EXECUTION_STATUSES,
} from "../../server/agent-studio/services/publish-targets/types.js";
import type { PublishExecutionRow } from "../../server/agent-studio/services/publish-targets/admin-queries.js";

function makeRow(overrides: Partial<PublishExecutionRow> = {}): PublishExecutionRow {
  return {
    id: 1,
    targetId: 1,
    sourcePromotionId: 100,
    sourceVersionId: null,
    attempt: 1,
    status: "pending",
    payloadDigest: null,
    upstreamArtifactId: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("summarizePublishExecutions — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizePublishExecutions([]);
    expect(s.total).toBe(0);
    expect(s.unknownStatusCount).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.succeededCount).toBe(0);
    expect(s.failedCount).toBe(0);
    expect(s.successRate).toBeNull();
    expect(s.withErrorMessageCount).toBe(0);
    expect(s.withUpstreamArtifactCount).toBe(0);
    expect(s.distinctTargetCount).toBe(0);
    expect(s.distinctPromotionCount).toBe(0);
    expect(s.durationStats).toBeNull();
  });

  it("byStatus carries every closed status at 0 (stable shape)", () => {
    const s = summarizePublishExecutions([]);
    for (const status of PUBLISH_EXECUTION_STATUSES) {
      expect(s.byStatus[status]).toBe(0);
    }
  });
});

describe("summarizePublishExecutions — status partition", () => {
  it("counts each status correctly", () => {
    const s = summarizePublishExecutions([
      makeRow({ status: "pending" }),
      makeRow({ status: "in_flight" }),
      makeRow({ status: "succeeded" }),
      makeRow({ status: "succeeded" }),
      makeRow({ status: "failed" }),
    ]);
    expect(s.byStatus.pending).toBe(1);
    expect(s.byStatus.in_flight).toBe(1);
    expect(s.byStatus.succeeded).toBe(2);
    expect(s.byStatus.failed).toBe(1);
  });

  it("terminal + inFlight sums to total", () => {
    const s = summarizePublishExecutions([
      makeRow({ status: "pending" }),
      makeRow({ status: "in_flight" }),
      makeRow({ status: "succeeded" }),
      makeRow({ status: "failed" }),
    ]);
    expect(s.terminalCount).toBe(2); // succeeded + failed
    expect(s.inFlightCount).toBe(2); // pending + in_flight
    expect(s.terminalCount + s.inFlightCount).toBe(s.total);
  });

  it("unknown status counted via separate axis, not byStatus", () => {
    const s = summarizePublishExecutions([
      makeRow({ status: "succeeded" }),
      makeRow({ status: "totally_made_up_status" }),
    ]);
    expect(s.unknownStatusCount).toBe(1);
    expect(s.byStatus.succeeded).toBe(1);
    expect(s.terminalCount).toBe(1); // unknown not counted
  });
});

describe("summarizePublishExecutions — success rate", () => {
  it("null when no settled rows", () => {
    const s = summarizePublishExecutions([
      makeRow({ status: "pending" }),
      makeRow({ status: "in_flight" }),
    ]);
    expect(s.successRate).toBeNull();
  });

  it("100% when all settled rows succeeded", () => {
    const s = summarizePublishExecutions([
      makeRow({ status: "succeeded" }),
      makeRow({ status: "succeeded" }),
    ]);
    expect(s.successRate).toBe(100);
  });

  it("0% when all settled rows failed", () => {
    const s = summarizePublishExecutions([
      makeRow({ status: "failed" }),
      makeRow({ status: "failed" }),
    ]);
    expect(s.successRate).toBe(0);
  });

  it("excludes pending/in_flight from rate denominator", () => {
    const s = summarizePublishExecutions([
      makeRow({ status: "succeeded" }),
      makeRow({ status: "succeeded" }),
      makeRow({ status: "failed" }),
      makeRow({ status: "pending" }), // excluded
      makeRow({ status: "in_flight" }), // excluded
    ]);
    // 2 / 3 = 66.7
    expect(s.successRate).toBe(66.7);
  });
});

describe("summarizePublishExecutions — gauge axes", () => {
  it("withErrorMessageCount counts non-null errorMessage", () => {
    const s = summarizePublishExecutions([
      makeRow({ errorMessage: null }),
      makeRow({ errorMessage: "" }),
      makeRow({ errorMessage: "fail" }),
    ]);
    // "" is non-null (and falsy); contract is non-null, not truthy.
    expect(s.withErrorMessageCount).toBe(2);
  });

  it("withUpstreamArtifactCount counts non-null upstreamArtifactId", () => {
    const s = summarizePublishExecutions([
      makeRow({ upstreamArtifactId: null }),
      makeRow({ upstreamArtifactId: "abc" }),
    ]);
    expect(s.withUpstreamArtifactCount).toBe(1);
  });

  it("distinct counts track unique ids", () => {
    const s = summarizePublishExecutions([
      makeRow({ targetId: 1, sourcePromotionId: 100 }),
      makeRow({ targetId: 1, sourcePromotionId: 100 }),
      makeRow({ targetId: 2, sourcePromotionId: 100 }),
      makeRow({ targetId: 1, sourcePromotionId: 200 }),
    ]);
    expect(s.distinctTargetCount).toBe(2);
    expect(s.distinctPromotionCount).toBe(2);
  });
});

describe("summarizePublishExecutions — duration stats", () => {
  it("null when no rows have both startedAt + completedAt", () => {
    const s = summarizePublishExecutions([
      makeRow({ startedAt: null, completedAt: null }),
      makeRow({
        startedAt: new Date(),
        completedAt: null,
      }),
    ]);
    expect(s.durationStats).toBeNull();
  });

  it("computes stats over the rows that have both timestamps", () => {
    const start = new Date(2026, 4, 16, 12, 0, 0).getTime();
    const s = summarizePublishExecutions([
      makeRow({
        startedAt: new Date(start),
        completedAt: new Date(start + 100),
      }),
      makeRow({
        startedAt: new Date(start),
        completedAt: new Date(start + 200),
      }),
      makeRow({
        startedAt: new Date(start),
        completedAt: new Date(start + 300),
      }),
    ]);
    expect(s.durationStats).not.toBeNull();
    expect(s.durationStats!.count).toBe(3);
    expect(s.durationStats!.sumMs).toBe(600);
    expect(s.durationStats!.meanMs).toBe(200);
    expect(s.durationStats!.minMs).toBe(100);
    expect(s.durationStats!.maxMs).toBe(300);
  });

  it("excludes rows missing either timestamp from duration sample", () => {
    const start = new Date(2026, 4, 16).getTime();
    const s = summarizePublishExecutions([
      makeRow({
        startedAt: new Date(start),
        completedAt: new Date(start + 1000),
      }),
      makeRow({ startedAt: new Date(start), completedAt: null }),
      makeRow({ startedAt: null, completedAt: new Date(start + 1000) }),
    ]);
    expect(s.durationStats!.count).toBe(1);
    expect(s.durationStats!.sumMs).toBe(1000);
  });
});
