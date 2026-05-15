/**
 * Phase 22 §T-I.30 — row-collection helpers (partition + group).
 *
 * Helpers operating over lists of observability rows:
 * - `partitionRowsByFailureState` splits into closed / free-form
 * - `groupRowsByFailureStateKind` groups closed rows by kind
 */

import { describe, it, expect } from "vitest";
import {
  failureStateErrorClass,
  partitionRowsByFailureState,
  groupRowsByFailureStateKind,
} from "../../server/agent-studio/services/failure-states/public-api.js";

interface Row {
  readonly id: number;
  readonly errorClass: string;
}

const getEc = (r: Row) => r.errorClass;

describe("partitionRowsByFailureState (T-I.30)", () => {
  it("empty input → empty closed + empty freeForm", () => {
    const { closed, freeForm } = partitionRowsByFailureState<Row>([], getEc);
    expect(closed).toEqual([]);
    expect(freeForm).toEqual([]);
  });

  it("splits closed-taxonomy from free-form correctly", () => {
    const { closed, freeForm } = partitionRowsByFailureState(
      [
        { id: 1, errorClass: failureStateErrorClass("neo4j_unavailable") },
        { id: 2, errorClass: "LegacyFreeForm" },
        { id: 3, errorClass: failureStateErrorClass("promotion_failed") },
        { id: 4, errorClass: "AnotherLegacy" },
      ],
      getEc,
    );
    expect(closed.map((r) => r.id)).toEqual([1, 3]);
    expect(freeForm.map((r) => r.id)).toEqual([2, 4]);
  });

  it("treats unknown failure_state: kinds as free-form", () => {
    const { closed, freeForm } = partitionRowsByFailureState(
      [{ id: 1, errorClass: "failure_state:not_a_real_kind" }],
      getEc,
    );
    expect(closed).toEqual([]);
    expect(freeForm).toHaveLength(1);
  });

  it("preserves input order within each partition", () => {
    const { closed, freeForm } = partitionRowsByFailureState(
      [
        { id: 1, errorClass: failureStateErrorClass("neo4j_unavailable") },
        { id: 2, errorClass: "x" },
        { id: 3, errorClass: failureStateErrorClass("neo4j_degraded") },
        { id: 4, errorClass: "y" },
      ],
      getEc,
    );
    expect(closed.map((r) => r.id)).toEqual([1, 3]);
    expect(freeForm.map((r) => r.id)).toEqual([2, 4]);
  });

  it("closed.length + freeForm.length == input.length", () => {
    const input = [
      { id: 1, errorClass: failureStateErrorClass("neo4j_unavailable") },
      { id: 2, errorClass: "x" },
      { id: 3, errorClass: "y" },
    ];
    const { closed, freeForm } = partitionRowsByFailureState(input, getEc);
    expect(closed.length + freeForm.length).toBe(input.length);
  });

  it("does not mutate input", () => {
    const input: Row[] = [{ id: 1, errorClass: "x" }];
    const before = JSON.parse(JSON.stringify(input));
    partitionRowsByFailureState(input, getEc);
    expect(JSON.parse(JSON.stringify(input))).toEqual(before);
  });
});

describe("groupRowsByFailureStateKind (T-I.30)", () => {
  it("empty input → empty Map", () => {
    const groups = groupRowsByFailureStateKind<Row>([], getEc);
    expect(groups.size).toBe(0);
  });

  it("groups rows by closed-taxonomy kind", () => {
    const groups = groupRowsByFailureStateKind(
      [
        { id: 1, errorClass: failureStateErrorClass("neo4j_unavailable") },
        { id: 2, errorClass: failureStateErrorClass("promotion_failed") },
        { id: 3, errorClass: failureStateErrorClass("neo4j_unavailable") },
      ],
      getEc,
    );
    expect(groups.get("neo4j_unavailable")?.map((r) => r.id)).toEqual([1, 3]);
    expect(groups.get("promotion_failed")?.map((r) => r.id)).toEqual([2]);
  });

  it("silently drops free-form rows", () => {
    const groups = groupRowsByFailureStateKind(
      [
        { id: 1, errorClass: failureStateErrorClass("neo4j_unavailable") },
        { id: 2, errorClass: "Legacy" },
        { id: 3, errorClass: failureStateErrorClass("neo4j_unavailable") },
      ],
      getEc,
    );
    expect(groups.get("neo4j_unavailable")?.length).toBe(2);
    expect(groups.size).toBe(1);
  });

  it("Map iteration preserves first-observed-kind order", () => {
    const groups = groupRowsByFailureStateKind(
      [
        { id: 1, errorClass: failureStateErrorClass("promotion_failed") },
        { id: 2, errorClass: failureStateErrorClass("neo4j_unavailable") },
        { id: 3, errorClass: failureStateErrorClass("promotion_failed") },
      ],
      getEc,
    );
    const orderedKinds = Array.from(groups.keys());
    expect(orderedKinds).toEqual(["promotion_failed", "neo4j_unavailable"]);
  });

  it("Σ across all buckets equals count of closed-taxonomy rows", () => {
    const groups = groupRowsByFailureStateKind(
      [
        { id: 1, errorClass: failureStateErrorClass("neo4j_unavailable") },
        { id: 2, errorClass: "Legacy" },
        { id: 3, errorClass: failureStateErrorClass("promotion_failed") },
      ],
      getEc,
    );
    let sum = 0;
    for (const bucket of groups.values()) sum += bucket.length;
    expect(sum).toBe(2); // 2 closed-taxonomy, 1 free-form (dropped)
  });

  it("does not mutate input", () => {
    const input: Row[] = [
      { id: 1, errorClass: failureStateErrorClass("neo4j_unavailable") },
    ];
    const before = JSON.parse(JSON.stringify(input));
    groupRowsByFailureStateKind(input, getEc);
    expect(JSON.parse(JSON.stringify(input))).toEqual(before);
  });
});
