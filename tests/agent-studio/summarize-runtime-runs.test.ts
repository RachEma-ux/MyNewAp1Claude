/**
 * Phase G §T-G.64 — `summarizeRuntimeRuns` lockstep + `RUNTIME_RUN_STATUS_METADATA`
 * canonization.
 *
 * 16th instantiation of the lesson-30 aggregator-pair pattern.
 * Combined slice per lesson 26 — promotes the prior literal-union
 * `RuntimeRunStatus` to a tuple-derived constant + ships the
 * metadata table + ships the aggregator.
 */

import { describe, expect, it } from "vitest";
import { summarizeRuntimeRuns } from "../../server/agent-studio/services/runtime-runs-summary.js";
import {
  RUNTIME_RUN_STATUSES,
  RUNTIME_RUN_STATUS_METADATA,
} from "../../server/agent-studio/services/runtime-runs-retention.js";

interface FakeRow {
  status: string;
}

const getStatus = (r: FakeRow) => r.status;

describe("RUNTIME_RUN_STATUSES — closed taxonomy invariant", () => {
  it("contains exactly 7 values", () => {
    expect(RUNTIME_RUN_STATUSES.length).toBe(7);
  });

  it("each status has a metadata entry", () => {
    for (const status of RUNTIME_RUN_STATUSES) {
      const meta = RUNTIME_RUN_STATUS_METADATA[status];
      expect(meta).toBeDefined();
      expect(typeof meta.label).toBe("string");
      expect(typeof meta.description).toBe("string");
      expect(typeof meta.terminal).toBe("boolean");
      expect(typeof meta.successful).toBe("boolean");
    }
  });

  it("only completed is marked successful", () => {
    const successful = RUNTIME_RUN_STATUSES.filter(
      (s) => RUNTIME_RUN_STATUS_METADATA[s].successful,
    );
    expect(successful).toEqual(["completed"]);
  });

  it("3 statuses are terminal (completed / failed / cancelled)", () => {
    const terminal = RUNTIME_RUN_STATUSES.filter(
      (s) => RUNTIME_RUN_STATUS_METADATA[s].terminal,
    );
    expect(new Set(terminal)).toEqual(
      new Set(["completed", "failed", "cancelled"]),
    );
  });

  it("4 statuses are non-terminal", () => {
    const nonTerminal = RUNTIME_RUN_STATUSES.filter(
      (s) => !RUNTIME_RUN_STATUS_METADATA[s].terminal,
    );
    expect(new Set(nonTerminal)).toEqual(
      new Set(["queued", "pending", "running", "awaiting_approval"]),
    );
  });

  it("metadata fields are non-empty strings", () => {
    for (const status of RUNTIME_RUN_STATUSES) {
      const meta = RUNTIME_RUN_STATUS_METADATA[status];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(30);
    }
  });
});

describe("summarizeRuntimeRuns — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeRuntimeRuns<FakeRow>([], getStatus);
    expect(s.total).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.unknownStatusCount).toBe(0);
    expect(s.awaitingApprovalCount).toBe(0);
    expect(s.successRate).toBeNull();
  });

  it("byStatus carries every closed status at 0", () => {
    const s = summarizeRuntimeRuns<FakeRow>([], getStatus);
    for (const status of RUNTIME_RUN_STATUSES) {
      expect(s.byStatus[status]).toBe(0);
    }
  });
});

describe("summarizeRuntimeRuns — status partition", () => {
  it("counts each status across the 7-state ladder", () => {
    const s = summarizeRuntimeRuns<FakeRow>(
      RUNTIME_RUN_STATUSES.map((status) => ({ status }) as FakeRow),
      getStatus,
    );
    for (const status of RUNTIME_RUN_STATUSES) {
      expect(s.byStatus[status]).toBe(1);
    }
  });

  it("terminal + inFlight + unknown sums to total", () => {
    const s = summarizeRuntimeRuns<FakeRow>(
      [
        { status: "queued" },
        { status: "running" },
        { status: "completed" },
        { status: "failed" },
        { status: "cancelled" },
        { status: "drift" },
      ] as FakeRow[],
      getStatus,
    );
    expect(s.terminalCount).toBe(3);
    expect(s.inFlightCount).toBe(2);
    expect(s.unknownStatusCount).toBe(1);
    expect(
      s.terminalCount + s.inFlightCount + s.unknownStatusCount,
    ).toBe(s.total);
  });

  it("awaitingApprovalCount surfaces the approval-pause subset", () => {
    const s = summarizeRuntimeRuns<FakeRow>(
      [
        { status: "running" },
        { status: "awaiting_approval" },
        { status: "awaiting_approval" },
        { status: "completed" },
      ] as FakeRow[],
      getStatus,
    );
    expect(s.awaitingApprovalCount).toBe(2);
    expect(s.inFlightCount).toBe(3); // running + 2 * awaiting_approval
  });
});

describe("summarizeRuntimeRuns — success rate", () => {
  it("null when no terminal rows", () => {
    const s = summarizeRuntimeRuns<FakeRow>(
      [{ status: "queued" }, { status: "running" }] as FakeRow[],
      getStatus,
    );
    expect(s.successRate).toBeNull();
  });

  it("100% when all terminal rows completed", () => {
    const s = summarizeRuntimeRuns<FakeRow>(
      [{ status: "completed" }, { status: "completed" }] as FakeRow[],
      getStatus,
    );
    expect(s.successRate).toBe(100);
  });

  it("includes cancelled in denominator (non-success terminal)", () => {
    const s = summarizeRuntimeRuns<FakeRow>(
      [
        { status: "completed" },
        { status: "completed" },
        { status: "failed" },
        { status: "cancelled" },
      ] as FakeRow[],
      getStatus,
    );
    // 2 / (2 + 1 + 1) = 50.0
    expect(s.successRate).toBe(50);
  });

  it("excludes in-flight statuses from denominator", () => {
    const s = summarizeRuntimeRuns<FakeRow>(
      [
        { status: "completed" },
        { status: "running" }, // excluded
        { status: "awaiting_approval" }, // excluded
        { status: "queued" }, // excluded
      ] as FakeRow[],
      getStatus,
    );
    expect(s.successRate).toBe(100);
  });
});

describe("summarizeRuntimeRuns — schema-drift", () => {
  it("partitions unknown status out of byStatus", () => {
    const s = summarizeRuntimeRuns<FakeRow>(
      [
        { status: "completed" },
        { status: "future_unseen_status" },
      ] as FakeRow[],
      getStatus,
    );
    expect(s.unknownStatusCount).toBe(1);
    expect(s.byStatus.completed).toBe(1);
    let sum = 0;
    for (const status of RUNTIME_RUN_STATUSES) sum += s.byStatus[status];
    expect(sum).toBe(1);
  });
});
