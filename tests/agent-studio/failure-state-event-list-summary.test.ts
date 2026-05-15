/**
 * Phase 22 §T-I.25 — summarizeFailureStateEventList lockstep.
 *
 * Aggregates raw observability `ErrorEventRow`s (the dashboard-query
 * output) into the canonical failure-state operator summary.
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATES,
  FAILURE_STATE_CATEGORIES,
  FAILURE_STATE_SEVERITIES,
  failureStateErrorClass,
  summarizeFailureStateEventList,
} from "../../server/agent-studio/services/failure-states/public-api.js";

type EventInput = {
  errorClass: string;
  sourceKind: string;
  createdAt: Date;
};

function build(
  errorClass: string,
  sourceKind: string,
  createdAt: Date,
): EventInput {
  return { errorClass, sourceKind, createdAt };
}

describe("summarizeFailureStateEventList (T-I.25)", () => {
  it("empty input → zeros + null dates + stable-shape on closed axes", () => {
    const s = summarizeFailureStateEventList([]);
    expect(s.totalEvents).toBe(0);
    expect(s.closedTaxonomyEvents).toBe(0);
    expect(s.freeFormEvents).toBe(0);
    expect(s.distinctSourceKinds).toBe(0);
    expect(s.oldestAt).toBeNull();
    expect(s.newestAt).toBeNull();
    // Stable shape on inner summary
    for (const k of FAILURE_STATES) {
      expect(s.occurrenceSummary.byKind[k]).toBe(0);
    }
    for (const c of FAILURE_STATE_CATEGORIES) {
      expect(s.occurrenceSummary.byCategory[c]).toBe(0);
    }
    for (const sev of FAILURE_STATE_SEVERITIES) {
      expect(s.occurrenceSummary.bySeverity[sev]).toBe(0);
    }
  });

  it("classifies closed-taxonomy vs free-form events correctly", () => {
    const t1 = new Date(2026, 4, 15, 10, 0, 0);
    const t2 = new Date(2026, 4, 15, 11, 0, 0);
    const t3 = new Date(2026, 4, 15, 12, 0, 0);
    const s = summarizeFailureStateEventList([
      build(failureStateErrorClass("neo4j_unavailable"), "health-alert", t1),
      build("LegacyFreeForm", "legacy-scanner", t2),
      build(failureStateErrorClass("promotion_failed"), "promotion", t3),
    ]);
    expect(s.totalEvents).toBe(3);
    expect(s.closedTaxonomyEvents).toBe(2);
    expect(s.freeFormEvents).toBe(1);
    expect(s.occurrenceSummary.byKind.neo4j_unavailable).toBe(1);
    expect(s.occurrenceSummary.byKind.promotion_failed).toBe(1);
  });

  it("treats unknown failure_state: prefixes as free-form (closed-taxonomy guard)", () => {
    const s = summarizeFailureStateEventList([
      build("failure_state:not_a_real_kind", "src", new Date()),
    ]);
    expect(s.closedTaxonomyEvents).toBe(0);
    expect(s.freeFormEvents).toBe(1);
  });

  it("computes distinctSourceKinds correctly", () => {
    const t = new Date();
    const s = summarizeFailureStateEventList([
      build("a", "src1", t),
      build("b", "src1", t),
      build("c", "src2", t),
      build("d", "src3", t),
    ]);
    expect(s.distinctSourceKinds).toBe(3);
  });

  it("computes oldestAt + newestAt", () => {
    const t1 = new Date(2026, 4, 15, 10, 0, 0);
    const t2 = new Date(2026, 4, 15, 12, 0, 0);
    const t3 = new Date(2026, 4, 15, 11, 0, 0);
    const s = summarizeFailureStateEventList([
      build("a", "x", t2),
      build("b", "x", t1),
      build("c", "x", t3),
    ]);
    expect(s.oldestAt).toEqual(t1);
    expect(s.newestAt).toEqual(t2);
  });

  it("closedTaxonomyEvents + freeFormEvents == totalEvents", () => {
    const t = new Date();
    const s = summarizeFailureStateEventList([
      build(failureStateErrorClass("neo4j_unavailable"), "a", t),
      build("FreeForm", "b", t),
      build(failureStateErrorClass("promotion_failed"), "c", t),
    ]);
    expect(s.closedTaxonomyEvents + s.freeFormEvents).toBe(s.totalEvents);
  });

  it("does not mutate input", () => {
    const events: EventInput[] = [
      build(failureStateErrorClass("neo4j_unavailable"), "a", new Date()),
    ];
    const before = JSON.parse(JSON.stringify(events));
    summarizeFailureStateEventList(events);
    expect(JSON.parse(JSON.stringify(events))).toEqual(before);
  });
});
