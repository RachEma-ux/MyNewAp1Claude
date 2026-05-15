/**
 * Phase 22 §T-I.26 — extractFailureStateAnnotations lockstep.
 *
 * Inverse of `getCanonicalFailureStateAnnotations` — reads canonical
 * stamps off an `ErrorEventRow`. Round-trip property: extract(encode(x))
 * should equal getCanonicalFailureStateAnnotations(x).
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATES,
  FAILURE_STATE_METADATA,
  failureStateErrorClass,
  extractFailureStateAnnotations,
  getCanonicalFailureStateAnnotations,
} from "../../server/agent-studio/services/failure-states/public-api.js";

describe("extractFailureStateAnnotations (T-I.26)", () => {
  it("returns null for free-form errorClass", () => {
    const out = extractFailureStateAnnotations({
      errorClass: "LegacyFreeForm",
      metadata: { foo: "bar" },
    });
    expect(out).toBeNull();
  });

  it("returns null for unknown failure_state: kind (stale ingest)", () => {
    const out = extractFailureStateAnnotations({
      errorClass: "failure_state:not_a_real_kind",
      metadata: null,
    });
    expect(out).toBeNull();
  });

  it("returns null for empty errorClass", () => {
    expect(
      extractFailureStateAnnotations({ errorClass: "", metadata: null }),
    ).toBeNull();
  });

  it.each([...FAILURE_STATES])(
    "round-trips canonical annotations for %s",
    (kind) => {
      const canonical = getCanonicalFailureStateAnnotations(kind);
      const out = extractFailureStateAnnotations({
        errorClass: failureStateErrorClass(kind),
        metadata: { ...canonical },
      });
      expect(out).toEqual(canonical);
    },
  );

  it("falls back to default severity when metadata missing", () => {
    const kind = "neo4j_unavailable";
    const out = extractFailureStateAnnotations({
      errorClass: failureStateErrorClass(kind),
      metadata: null,
    });
    expect(out?.failureStateKind).toBe(kind);
    expect(out?.failureStateSeverity).toBe(
      FAILURE_STATE_METADATA[kind].defaultSeverity,
    );
  });

  it("honors metadata severity override (info / warning / critical)", () => {
    const kind = "neo4j_unavailable";
    const out = extractFailureStateAnnotations({
      errorClass: failureStateErrorClass(kind),
      metadata: { failureStateSeverity: "critical" },
    });
    expect(out?.failureStateSeverity).toBe("critical");
  });

  it("ignores invalid metadata severity values (falls back to default)", () => {
    const kind = "neo4j_unavailable";
    const meta = FAILURE_STATE_METADATA[kind];
    const out = extractFailureStateAnnotations({
      errorClass: failureStateErrorClass(kind),
      metadata: { failureStateSeverity: "made_up_severity" },
    });
    expect(out?.failureStateSeverity).toBe(meta.defaultSeverity);
  });

  it("returns category + recoverable from canonical metadata regardless of input metadata", () => {
    const kind = "promotion_failed";
    const meta = FAILURE_STATE_METADATA[kind];
    const out = extractFailureStateAnnotations({
      errorClass: failureStateErrorClass(kind),
      // Intentionally garbage metadata — extractor should NOT trust it
      // for category/recoverable; only kind+severityOverride matter.
      metadata: {
        failureStateCategory: "totally_wrong",
        failureStateRecoverable: 42,
      },
    });
    expect(out?.failureStateCategory).toBe(meta.category);
    expect(out?.failureStateRecoverable).toBe(meta.recoverable);
  });

  it("does not mutate the input row", () => {
    const row = {
      errorClass: failureStateErrorClass("neo4j_unavailable"),
      metadata: { failureStateSeverity: "critical" as const },
    };
    const before = JSON.parse(JSON.stringify(row));
    extractFailureStateAnnotations(row);
    expect(JSON.parse(JSON.stringify(row))).toEqual(before);
  });
});
