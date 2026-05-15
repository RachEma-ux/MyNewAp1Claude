/**
 * Phase 22 §T-I.24 — getCanonicalFailureStateAnnotations lockstep.
 *
 * Pins the canonical metadata stamps the bridge applies. This is the
 * dashboard-contract: every failure-state row carries these exact four
 * fields, with the same semantics regardless of bridge entry point
 * (singular helper, batch helper, or future direct caller).
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATES,
  FAILURE_STATE_METADATA,
  getCanonicalFailureStateAnnotations,
  type CanonicalFailureStateAnnotations,
} from "../../server/agent-studio/services/failure-states/public-api.js";

describe("getCanonicalFailureStateAnnotations (T-I.24)", () => {
  it.each([...FAILURE_STATES])(
    "stamps %s with canonical kind/category/severity/recoverable",
    (kind) => {
      const stamps = getCanonicalFailureStateAnnotations(kind);
      const meta = FAILURE_STATE_METADATA[kind];
      expect(stamps.failureStateKind).toBe(kind);
      expect(stamps.failureStateCategory).toBe(meta.category);
      expect(stamps.failureStateSeverity).toBe(meta.defaultSeverity);
      expect(stamps.failureStateRecoverable).toBe(meta.recoverable);
    },
  );

  it("severityOverride is honored", () => {
    const stamps = getCanonicalFailureStateAnnotations(
      "neo4j_unavailable",
      "critical",
    );
    expect(stamps.failureStateSeverity).toBe("critical");
  });

  it("severityOverride does NOT affect other fields", () => {
    const meta = FAILURE_STATE_METADATA["neo4j_unavailable"];
    const stamps = getCanonicalFailureStateAnnotations(
      "neo4j_unavailable",
      "critical",
    );
    expect(stamps.failureStateKind).toBe("neo4j_unavailable");
    expect(stamps.failureStateCategory).toBe(meta.category);
    expect(stamps.failureStateRecoverable).toBe(meta.recoverable);
  });

  it("returns the same shape for every kind (no fields missing)", () => {
    for (const kind of FAILURE_STATES) {
      const stamps: CanonicalFailureStateAnnotations =
        getCanonicalFailureStateAnnotations(kind);
      expect(Object.keys(stamps).sort()).toEqual(
        [
          "failureStateCategory",
          "failureStateKind",
          "failureStateRecoverable",
          "failureStateSeverity",
        ].sort(),
      );
    }
  });

  it("is pure — same input returns same output", () => {
    const a = getCanonicalFailureStateAnnotations("promotion_failed");
    const b = getCanonicalFailureStateAnnotations("promotion_failed");
    expect(a).toEqual(b);
  });
});
