/**
 * Phase 22 §T-I.11 — Bulk failure-state emission helper.
 *
 * Tests `recordFailureStateEvents` parallels the singular variant
 * with the same encoding semantics + canonical metadata stamping +
 * empty-batch short-circuit + ASDB-null fail-soft.
 */

import { describe, it, expect, vi } from "vitest";
import {
  recordFailureStateEvents,
  type RecordFailureStateEventInput,
} from "../../server/agent-studio/services/failure-states/public-api";

function makeFakeDb(captureBucket: { calls: Array<Record<string, unknown>[]> }) {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn((v: Record<string, unknown>[]) => {
        captureBucket.calls.push(v);
        return {
          returning: vi.fn().mockResolvedValue(
            v.map((row, idx) => ({
              ...row,
              id: idx + 1,
              createdAt: new Date("2026-05-15T18:00:00Z"),
            })),
          ),
        };
      }),
    }),
  };
}

describe("recordFailureStateEvents — bulk emission", () => {
  it("empty input → empty output WITHOUT touching the db", async () => {
    const getDb = vi.fn();
    const out = await recordFailureStateEvents([], {
      getDb: getDb as unknown as () => ReturnType<
        typeof import("../../server/agent-studio/db/connection").getAsDb
      >,
    });
    expect(out).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("encodes each input with prefixed errorClass + canonical metadata", async () => {
    const captureBucket: { calls: Array<Record<string, unknown>[]> } = {
      calls: [],
    };
    const fakeDb = makeFakeDb(captureBucket);
    const inputs: RecordFailureStateEventInput[] = [
      {
        failureState: "neo4j_unavailable",
        sourceKind: "health-cron",
        errorMessage: "up timeout",
      },
      {
        failureState: "neo4j_degraded",
        sourceKind: "health-cron",
        errorMessage: "p95 spike",
      },
    ];
    const rows = await recordFailureStateEvents(inputs, {
      getDb: () =>
        fakeDb as unknown as ReturnType<
          typeof import("../../server/agent-studio/db/connection").getAsDb
        >,
    });
    expect(rows).toHaveLength(2);
    expect(captureBucket.calls).toHaveLength(1);
    const values = captureBucket.calls[0];
    expect(values[0].errorClass).toBe("failure_state:neo4j_unavailable");
    expect(values[1].errorClass).toBe("failure_state:neo4j_degraded");
    // Canonical fields present on both.
    expect((values[0].metadata as Record<string, unknown>).failureStateCategory).toBe(
      "infrastructure",
    );
    expect((values[1].metadata as Record<string, unknown>).failureStateCategory).toBe(
      "infrastructure",
    );
  });

  it("severityOverride preserved per-input across the batch", async () => {
    const captureBucket: { calls: Array<Record<string, unknown>[]> } = {
      calls: [],
    };
    const fakeDb = makeFakeDb(captureBucket);
    await recordFailureStateEvents(
      [
        {
          failureState: "neo4j_query_timeout",
          sourceKind: "graph-repo",
          errorMessage: "first",
          severityOverride: "info",
        },
        {
          failureState: "neo4j_query_timeout",
          sourceKind: "graph-repo",
          errorMessage: "second — SLO breach",
          severityOverride: "critical",
        },
      ],
      {
        getDb: () =>
          fakeDb as unknown as ReturnType<
            typeof import("../../server/agent-studio/db/connection").getAsDb
          >,
      },
    );
    const values = captureBucket.calls[0];
    expect((values[0].metadata as Record<string, unknown>).failureStateSeverity).toBe(
      "info",
    );
    expect((values[1].metadata as Record<string, unknown>).failureStateSeverity).toBe(
      "critical",
    );
  });

  it("caller metadata fields stamped on top of canonical (canonical wins)", async () => {
    const captureBucket: { calls: Array<Record<string, unknown>[]> } = {
      calls: [],
    };
    const fakeDb = makeFakeDb(captureBucket);
    await recordFailureStateEvents(
      [
        {
          failureState: "background_job_failed",
          sourceKind: "job-cron",
          errorMessage: "boom",
          metadata: {
            // Attempt spoof:
            failureStateKind: "promotion_failed",
            failureStateCategory: "governance",
            // Innocent:
            jobId: 7,
          },
        },
      ],
      {
        getDb: () =>
          fakeDb as unknown as ReturnType<
            typeof import("../../server/agent-studio/db/connection").getAsDb
          >,
      },
    );
    const meta = captureBucket.calls[0][0].metadata as Record<string, unknown>;
    expect(meta.failureStateKind).toBe("background_job_failed");
    expect(meta.failureStateCategory).toBe("runtime");
    expect(meta.jobId).toBe(7);
  });

  it("fail-soft when ASDB returns null db", async () => {
    const out = await recordFailureStateEvents(
      [
        {
          failureState: "neo4j_unavailable",
          sourceKind: "x",
          errorMessage: "y",
        },
      ],
      {
        getDb: () =>
          null as unknown as ReturnType<
            typeof import("../../server/agent-studio/db/connection").getAsDb
          >,
      },
    );
    expect(out).toEqual([]);
  });
});
