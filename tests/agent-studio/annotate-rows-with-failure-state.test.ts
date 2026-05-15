/**
 * Phase 22 §T-I.29 — annotateRowsWithFailureState lockstep.
 *
 * Batch wrapper around extractFailureStateAnnotations (T-I.26 #1058).
 * Use case: dashboard queries return mixed rows; annotate each so
 * downstream code can filter / group / render without re-extracting.
 */

import { describe, it, expect } from "vitest";
import {
  failureStateErrorClass,
  annotateRowsWithFailureState,
  getCanonicalFailureStateAnnotations,
} from "../../server/agent-studio/services/failure-states/public-api.js";

interface MixedRow {
  readonly id: number;
  readonly errorClass: string;
  readonly metadata: Record<string, unknown> | null;
}

const getEc = (r: MixedRow) => r.errorClass;
const getMeta = (r: MixedRow) => r.metadata;

describe("annotateRowsWithFailureState (T-I.29)", () => {
  it("returns empty array for empty input", () => {
    expect(annotateRowsWithFailureState<MixedRow>([], getEc, getMeta)).toEqual(
      [],
    );
  });

  it("annotates closed-taxonomy rows with canonical annotations", () => {
    const out = annotateRowsWithFailureState<MixedRow>(
      [
        {
          id: 1,
          errorClass: failureStateErrorClass("neo4j_unavailable"),
          metadata: null,
        },
      ],
      getEc,
      getMeta,
    );
    expect(out).toHaveLength(1);
    expect(out[0].annotations).toEqual(
      getCanonicalFailureStateAnnotations("neo4j_unavailable"),
    );
  });

  it("returns null annotations for free-form rows", () => {
    const out = annotateRowsWithFailureState<MixedRow>(
      [{ id: 1, errorClass: "LegacyFreeForm", metadata: null }],
      getEc,
      getMeta,
    );
    expect(out[0].annotations).toBeNull();
  });

  it("preserves the original row reference (no copy)", () => {
    const original: MixedRow = {
      id: 1,
      errorClass: "x",
      metadata: { k: "v" },
    };
    const out = annotateRowsWithFailureState<MixedRow>(
      [original],
      getEc,
      getMeta,
    );
    expect(out[0].row).toBe(original);
  });

  it("handles mixed batch of closed + free-form", () => {
    const rows: MixedRow[] = [
      {
        id: 1,
        errorClass: failureStateErrorClass("neo4j_unavailable"),
        metadata: null,
      },
      { id: 2, errorClass: "FreeForm", metadata: null },
      {
        id: 3,
        errorClass: failureStateErrorClass("promotion_failed"),
        metadata: null,
      },
    ];
    const out = annotateRowsWithFailureState(rows, getEc, getMeta);
    expect(out[0].annotations?.failureStateKind).toBe("neo4j_unavailable");
    expect(out[1].annotations).toBeNull();
    expect(out[2].annotations?.failureStateKind).toBe("promotion_failed");
  });

  it("honors metadata severity override per-row", () => {
    const out = annotateRowsWithFailureState<MixedRow>(
      [
        {
          id: 1,
          errorClass: failureStateErrorClass("neo4j_unavailable"),
          metadata: { failureStateSeverity: "critical" },
        },
      ],
      getEc,
      getMeta,
    );
    expect(out[0].annotations?.failureStateSeverity).toBe("critical");
  });

  it("does not mutate the input array", () => {
    const rows: MixedRow[] = [
      { id: 1, errorClass: "x", metadata: null },
    ];
    const before = JSON.parse(JSON.stringify(rows));
    annotateRowsWithFailureState(rows, getEc, getMeta);
    expect(JSON.parse(JSON.stringify(rows))).toEqual(before);
  });

  it("output length matches input length", () => {
    const rows: MixedRow[] = [
      { id: 1, errorClass: "a", metadata: null },
      { id: 2, errorClass: "b", metadata: null },
      { id: 3, errorClass: "c", metadata: null },
      { id: 4, errorClass: "d", metadata: null },
    ];
    expect(annotateRowsWithFailureState(rows, getEc, getMeta)).toHaveLength(
      rows.length,
    );
  });
});
