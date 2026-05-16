/**
 * Phase G §T-G.65 — `summarizeIngestionJobs` + `INGESTION_JOB_STATUS_METADATA`
 * canonization.
 *
 * 17th instantiation of the lesson-30 aggregator-pair pattern.
 * Combined slice: literal-union → tuple promotion + metadata table +
 * aggregator.
 */

import { describe, expect, it } from "vitest";
import {
  summarizeIngestionJobs,
  type SummarizeIngestionJobsInput,
} from "../../server/agent-studio/services/ingestion/ingestion-job-summary.js";
import {
  INGESTION_JOB_STATUSES,
  INGESTION_JOB_STATUS_METADATA,
} from "../../server/agent-studio/services/ingestion/types.js";

function makeRow(
  overrides: Partial<SummarizeIngestionJobsInput> = {},
): SummarizeIngestionJobsInput {
  return {
    status: "pending",
    artifactsCreated: 0,
    unitsCreated: 0,
    chunksCreated: 0,
    extractionsCreated: 0,
    failureReason: null,
    ...overrides,
  };
}

describe("INGESTION_JOB_STATUSES — closed-taxonomy invariants", () => {
  it("contains exactly 5 values", () => {
    expect(INGESTION_JOB_STATUSES.length).toBe(5);
  });

  it("each status has metadata with the expected shape", () => {
    for (const status of INGESTION_JOB_STATUSES) {
      const meta = INGESTION_JOB_STATUS_METADATA[status];
      expect(typeof meta.label).toBe("string");
      expect(meta.description.length).toBeGreaterThan(30);
      expect(typeof meta.terminal).toBe("boolean");
      expect(typeof meta.successful).toBe("boolean");
    }
  });

  it("only succeeded is successful", () => {
    const successful = INGESTION_JOB_STATUSES.filter(
      (s) => INGESTION_JOB_STATUS_METADATA[s].successful,
    );
    expect(successful).toEqual(["succeeded"]);
  });

  it("3 statuses are terminal", () => {
    const terminal = INGESTION_JOB_STATUSES.filter(
      (s) => INGESTION_JOB_STATUS_METADATA[s].terminal,
    );
    expect(new Set(terminal)).toEqual(
      new Set(["succeeded", "failed", "unsupported_type"]),
    );
  });
});

describe("summarizeIngestionJobs — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeIngestionJobs([]);
    expect(s.total).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.unknownStatusCount).toBe(0);
    expect(s.successRate).toBeNull();
    expect(s.artifactStats).toBeNull();
    expect(s.unitStats).toBeNull();
    expect(s.chunkStats).toBeNull();
    expect(s.extractionStats).toBeNull();
    expect(s.withFailureReasonCount).toBe(0);
  });

  it("byStatus carries every closed status at 0", () => {
    const s = summarizeIngestionJobs([]);
    for (const status of INGESTION_JOB_STATUSES) {
      expect(s.byStatus[status]).toBe(0);
    }
  });
});

describe("summarizeIngestionJobs — status partition", () => {
  it("counts each status across the 5-state ladder", () => {
    const s = summarizeIngestionJobs(
      INGESTION_JOB_STATUSES.map(
        (status) => makeRow({ status }),
      ),
    );
    for (const status of INGESTION_JOB_STATUSES) {
      expect(s.byStatus[status]).toBe(1);
    }
  });

  it("terminal + inFlight + unknown sums to total", () => {
    const s = summarizeIngestionJobs([
      makeRow({ status: "pending" }),
      makeRow({ status: "running" }),
      makeRow({ status: "succeeded" }),
      makeRow({ status: "failed" }),
      makeRow({ status: "unsupported_type" }),
      makeRow({ status: "drift" }),
    ]);
    expect(s.terminalCount).toBe(3);
    expect(s.inFlightCount).toBe(2);
    expect(s.unknownStatusCount).toBe(1);
    expect(
      s.terminalCount + s.inFlightCount + s.unknownStatusCount,
    ).toBe(s.total);
  });
});

describe("summarizeIngestionJobs — success rate", () => {
  it("null when no terminal rows", () => {
    const s = summarizeIngestionJobs([
      makeRow({ status: "pending" }),
      makeRow({ status: "running" }),
    ]);
    expect(s.successRate).toBeNull();
  });

  it("includes unsupported_type in denominator", () => {
    const s = summarizeIngestionJobs([
      makeRow({ status: "succeeded" }),
      makeRow({ status: "failed" }),
      makeRow({ status: "unsupported_type" }),
    ]);
    // 1 / 3 = 33.3
    expect(s.successRate).toBe(33.3);
  });

  it("100% when all terminal succeeded", () => {
    const s = summarizeIngestionJobs([
      makeRow({ status: "succeeded" }),
      makeRow({ status: "succeeded" }),
    ]);
    expect(s.successRate).toBe(100);
  });
});

describe("summarizeIngestionJobs — counter stats", () => {
  it("artifactStats computes over all rows (zeros included)", () => {
    const s = summarizeIngestionJobs([
      makeRow({ artifactsCreated: 0 }),
      makeRow({ artifactsCreated: 100 }),
      makeRow({ artifactsCreated: 200 }),
    ]);
    expect(s.artifactStats!.count).toBe(3);
    expect(s.artifactStats!.sum).toBe(300);
    expect(s.artifactStats!.min).toBe(0);
    expect(s.artifactStats!.max).toBe(200);
    expect(s.artifactStats!.mean).toBe(100);
  });

  it("all 4 counters track independently", () => {
    const s = summarizeIngestionJobs([
      makeRow({
        artifactsCreated: 5,
        unitsCreated: 10,
        chunksCreated: 100,
        extractionsCreated: 3,
      }),
    ]);
    expect(s.artifactStats!.sum).toBe(5);
    expect(s.unitStats!.sum).toBe(10);
    expect(s.chunkStats!.sum).toBe(100);
    expect(s.extractionStats!.sum).toBe(3);
  });
});

describe("summarizeIngestionJobs — failure reason gauge", () => {
  it("counts rows with non-null failureReason", () => {
    const s = summarizeIngestionJobs([
      makeRow({ failureReason: null }),
      makeRow({ failureReason: "parse-error" }),
      makeRow({ failureReason: "" }),
    ]);
    expect(s.withFailureReasonCount).toBe(2);
  });
});

describe("summarizeIngestionJobs — schema drift", () => {
  it("partitions unknown status out of byStatus", () => {
    const s = summarizeIngestionJobs([
      makeRow({ status: "succeeded" }),
      makeRow({ status: "future_status" }),
    ]);
    expect(s.unknownStatusCount).toBe(1);
    expect(s.byStatus.succeeded).toBe(1);
    let sum = 0;
    for (const status of INGESTION_JOB_STATUSES)
      sum += s.byStatus[status];
    expect(sum).toBe(1);
  });
});
