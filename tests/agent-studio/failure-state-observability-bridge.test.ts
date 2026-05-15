/**
 * Failure-state observability bridge — Phase 22 §T-I.5.
 *
 * Pure-function tests on the prefix encoder + stubbed-recorder
 * integration test on the bridge. No real DB.
 */

import { describe, it, expect, vi } from "vitest";
import {
  FAILURE_STATE_ERROR_CLASS_PREFIX,
  failureStateErrorClass,
  parseFailureStateFromErrorClass,
  recordFailureStateEvent,
  FAILURE_STATES,
} from "../../server/agent-studio/services/failure-states/public-api";

describe("failureStateErrorClass — encoder", () => {
  it("prefixes the kind with 'failure_state:'", () => {
    expect(failureStateErrorClass("background_job_failed")).toBe(
      "failure_state:background_job_failed",
    );
  });

  it("produces a stable LIKE-friendly prefix for every kind", () => {
    for (const kind of FAILURE_STATES) {
      const encoded = failureStateErrorClass(kind);
      expect(encoded.startsWith(FAILURE_STATE_ERROR_CLASS_PREFIX)).toBe(true);
    }
  });
});

describe("parseFailureStateFromErrorClass — decoder", () => {
  it("round-trips every closed-taxonomy kind", () => {
    for (const kind of FAILURE_STATES) {
      expect(parseFailureStateFromErrorClass(failureStateErrorClass(kind))).toBe(
        kind,
      );
    }
  });

  it("returns null for non-prefixed errorClass", () => {
    expect(parseFailureStateFromErrorClass("TRPCError:BAD_REQUEST")).toBe(null);
    expect(parseFailureStateFromErrorClass("BackgroundJobFailed")).toBe(null);
    expect(parseFailureStateFromErrorClass("")).toBe(null);
  });

  it("returns null when the prefix is there but the suffix isn't a closed kind", () => {
    expect(
      parseFailureStateFromErrorClass("failure_state:not_a_real_kind"),
    ).toBe(null);
  });
});

describe("recordFailureStateEvent — bridge integration", () => {
  it("calls recordErrorEvent with prefixed errorClass + canonical metadata", async () => {
    // Stub the recorder via the options.getDb hatch — the bridge
    // inherits it from `recordErrorEvent`. We hand back a fake db
    // whose `.insert().values().returning()` chain captures the insert
    // payload, then return a row.
    let capturedInsert: Record<string, unknown> | null = null;
    const fakeDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn((v: Record<string, unknown>) => {
          capturedInsert = v;
          return {
            returning: vi.fn().mockResolvedValue([
              {
                id: 1,
                sourceKind: v.sourceKind,
                sourceId: v.sourceId,
                userId: v.userId,
                errorClass: v.errorClass,
                errorMessage: v.errorMessage,
                metadata: v.metadata,
                createdAt: new Date("2026-05-15T17:00:00Z"),
              },
            ]),
          };
        }),
      }),
    };
    const row = await recordFailureStateEvent(
      {
        failureState: "neo4j_query_timeout",
        sourceKind: "graph-repo",
        sourceId: "query:42",
        errorMessage: "Cypher exceeded 5s budget",
        metadata: { plan: "centrality", elapsedMs: 5273 },
      },
      { getDb: () => fakeDb as unknown as ReturnType<typeof import("../../server/agent-studio/db/connection").getAsDb> },
    );
    expect(row?.errorClass).toBe("failure_state:neo4j_query_timeout");
    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert!.errorClass).toBe(
      "failure_state:neo4j_query_timeout",
    );
    expect(capturedInsert!.metadata).toMatchObject({
      failureStateKind: "neo4j_query_timeout",
      failureStateCategory: "infrastructure",
      // Default severity for neo4j_query_timeout is "warning".
      failureStateSeverity: "warning",
      failureStateRecoverable: true,
      // Caller metadata preserved.
      plan: "centrality",
      elapsedMs: 5273,
    });
  });

  it("severityOverride wins over defaultSeverity", async () => {
    let captured: Record<string, unknown> | null = null;
    const fakeDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return {
            returning: vi
              .fn()
              .mockResolvedValue([{ ...v, id: 1, createdAt: new Date() }]),
          };
        }),
      }),
    };
    await recordFailureStateEvent(
      {
        failureState: "neo4j_query_timeout",
        sourceKind: "graph-repo",
        errorMessage: "huge breach",
        severityOverride: "critical",
      },
      { getDb: () => fakeDb as unknown as ReturnType<typeof import("../../server/agent-studio/db/connection").getAsDb> },
    );
    expect(
      (captured!.metadata as Record<string, unknown>).failureStateSeverity,
    ).toBe("critical");
  });

  it("caller metadata cannot shadow canonical taxonomy fields", async () => {
    let captured: Record<string, unknown> | null = null;
    const fakeDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return {
            returning: vi
              .fn()
              .mockResolvedValue([{ ...v, id: 1, createdAt: new Date() }]),
          };
        }),
      }),
    };
    await recordFailureStateEvent(
      {
        failureState: "background_job_failed",
        sourceKind: "job-cron",
        errorMessage: "boom",
        metadata: {
          // Caller attempts to spoof canonical fields:
          failureStateKind: "promotion_failed",
          failureStateCategory: "governance",
          failureStateSeverity: "info",
          failureStateRecoverable: false,
          // Innocent extra field — preserved.
          jobId: 99,
        },
      },
      { getDb: () => fakeDb as unknown as ReturnType<typeof import("../../server/agent-studio/db/connection").getAsDb> },
    );
    const meta = captured!.metadata as Record<string, unknown>;
    // Canonical fields reflect the actual closed kind (background_job_failed)
    // and not the caller's attempted overrides.
    expect(meta.failureStateKind).toBe("background_job_failed");
    expect(meta.failureStateCategory).toBe("runtime");
    expect(meta.failureStateSeverity).toBe("warning");
    expect(meta.failureStateRecoverable).toBe(true);
    expect(meta.jobId).toBe(99);
  });

  it("fail-soft when ASDB returns null db", async () => {
    const row = await recordFailureStateEvent(
      {
        failureState: "neo4j_unavailable",
        sourceKind: "health-cron",
        errorMessage: "neo4j up timeout",
      },
      { getDb: () => null as unknown as ReturnType<typeof import("../../server/agent-studio/db/connection").getAsDb> },
    );
    expect(row).toBe(null);
  });
});
