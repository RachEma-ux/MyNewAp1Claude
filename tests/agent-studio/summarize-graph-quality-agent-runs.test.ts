/**
 * Phase D §T-D.17 — `summarizeGraphQualityAgentRuns` lockstep.
 *
 * 13th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  summarizeGraphQualityAgentRuns,
  type SummarizeGraphQualityAgentRunsInput,
} from "../../server/agent-studio/services/graph-quality-agent-runs-summary.js";
import {
  GRAPH_QUALITY_AGENT_RUN_STATUSES,
} from "../../server/agent-studio/services/graph-quality-agent-runs-retention.js";

function makeRow(
  overrides: Partial<SummarizeGraphQualityAgentRunsInput> = {},
): SummarizeGraphQualityAgentRunsInput {
  return {
    status: "running",
    proposalsCreated: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("summarizeGraphQualityAgentRuns — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeGraphQualityAgentRuns([]);
    expect(s.total).toBe(0);
    expect(s.unknownStatusCount).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.successRate).toBeNull();
    expect(s.proposalStats).toBeNull();
    expect(s.durationStats).toBeNull();
  });

  it("byStatus carries every closed status at 0", () => {
    const s = summarizeGraphQualityAgentRuns([]);
    for (const status of GRAPH_QUALITY_AGENT_RUN_STATUSES) {
      expect(s.byStatus[status]).toBe(0);
    }
  });
});

describe("summarizeGraphQualityAgentRuns — status partition", () => {
  it("counts each status correctly", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ status: "running" }),
      makeRow({ status: "completed" }),
      makeRow({ status: "completed" }),
      makeRow({ status: "failed" }),
    ]);
    expect(s.byStatus.running).toBe(1);
    expect(s.byStatus.completed).toBe(2);
    expect(s.byStatus.failed).toBe(1);
  });

  it("terminal + inFlight + unknown sums to total", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ status: "running" }),
      makeRow({ status: "completed" }),
      makeRow({ status: "failed" }),
      makeRow({ status: "stuck" }),
    ]);
    expect(s.terminalCount).toBe(2);
    expect(s.inFlightCount).toBe(1);
    expect(s.unknownStatusCount).toBe(1);
    expect(
      s.terminalCount + s.inFlightCount + s.unknownStatusCount,
    ).toBe(s.total);
  });
});

describe("summarizeGraphQualityAgentRuns — success rate", () => {
  it("null when no terminal rows", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ status: "running" }),
      makeRow({ status: "running" }),
    ]);
    expect(s.successRate).toBeNull();
  });

  it("100% when all terminal rows completed", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ status: "completed" }),
      makeRow({ status: "completed" }),
    ]);
    expect(s.successRate).toBe(100);
  });

  it("0% when all terminal rows failed", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ status: "failed" }),
      makeRow({ status: "failed" }),
    ]);
    expect(s.successRate).toBe(0);
  });

  it("excludes running rows from rate denominator", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ status: "completed" }),
      makeRow({ status: "completed" }),
      makeRow({ status: "failed" }),
      makeRow({ status: "running" }),
      makeRow({ status: "running" }),
    ]);
    // 2 / 3 = 66.7
    expect(s.successRate).toBe(66.7);
  });
});

describe("summarizeGraphQualityAgentRuns — proposal stats", () => {
  it("null when no rows have proposalsCreated", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ proposalsCreated: null }),
      makeRow({ proposalsCreated: null }),
    ]);
    expect(s.proposalStats).toBeNull();
  });

  it("computes stats over rows with non-null proposalsCreated", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ proposalsCreated: null }),
      makeRow({ proposalsCreated: 5 }),
      makeRow({ proposalsCreated: 10 }),
      makeRow({ proposalsCreated: 15 }),
    ]);
    expect(s.proposalStats!.count).toBe(3);
    expect(s.proposalStats!.sum).toBe(30);
    expect(s.proposalStats!.mean).toBe(10);
    expect(s.proposalStats!.min).toBe(5);
    expect(s.proposalStats!.max).toBe(15);
  });

  it("zero proposalsCreated is a valid value (not skipped)", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ proposalsCreated: 0 }),
      makeRow({ proposalsCreated: 0 }),
    ]);
    expect(s.proposalStats!.count).toBe(2);
    expect(s.proposalStats!.sum).toBe(0);
    expect(s.proposalStats!.mean).toBe(0);
  });
});

describe("summarizeGraphQualityAgentRuns — duration stats", () => {
  it("null when no rows have both timestamps", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ startedAt: null, completedAt: null }),
      makeRow({ startedAt: new Date(), completedAt: null }),
    ]);
    expect(s.durationStats).toBeNull();
  });

  it("computes ms duration over rows with both timestamps", () => {
    const start = new Date(2026, 4, 16, 12, 0, 0).getTime();
    const s = summarizeGraphQualityAgentRuns([
      makeRow({
        startedAt: new Date(start),
        completedAt: new Date(start + 5000),
      }),
      makeRow({
        startedAt: new Date(start),
        completedAt: new Date(start + 10000),
      }),
    ]);
    expect(s.durationStats!.count).toBe(2);
    expect(s.durationStats!.sum).toBe(15000);
    expect(s.durationStats!.min).toBe(5000);
    expect(s.durationStats!.max).toBe(10000);
  });
});

describe("summarizeGraphQualityAgentRuns — schema-drift", () => {
  it("partitions unknown status out of byStatus", () => {
    const s = summarizeGraphQualityAgentRuns([
      makeRow({ status: "completed" }),
      makeRow({ status: "fixed_in_future" }),
    ]);
    expect(s.unknownStatusCount).toBe(1);
    expect(s.byStatus.completed).toBe(1);
    let sum = 0;
    for (const status of GRAPH_QUALITY_AGENT_RUN_STATUSES)
      sum += s.byStatus[status];
    expect(sum).toBe(1);
  });
});
