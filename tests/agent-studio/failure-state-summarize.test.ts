/**
 * Phase 22 §T-I.23 — summarizeFailureStateOccurrences lockstep.
 *
 * Tests the stable-shape aggregator. Every closed-taxonomy key must
 * be present at 0 or higher in the returned summary even with empty
 * input. Unknown kinds in input are silently ignored.
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATES,
  FAILURE_STATE_CATEGORIES,
  FAILURE_STATE_SEVERITIES,
  FAILURE_STATE_METADATA,
  summarizeFailureStateOccurrences,
} from "../../server/agent-studio/services/failure-states/public-api.js";

describe("summarizeFailureStateOccurrences (T-I.23)", () => {
  it("returns total=0 + every key keyed at 0 for empty input", () => {
    const s = summarizeFailureStateOccurrences([]);
    expect(s.total).toBe(0);
    expect(s.byRecoverable.recoverable).toBe(0);
    expect(s.byRecoverable.operatorActionRequired).toBe(0);
    for (const kind of FAILURE_STATES) {
      expect(s.byKind[kind]).toBe(0);
    }
    for (const cat of FAILURE_STATE_CATEGORIES) {
      expect(s.byCategory[cat]).toBe(0);
    }
    for (const sev of FAILURE_STATE_SEVERITIES) {
      expect(s.bySeverity[sev]).toBe(0);
    }
  });

  it("counts a single occurrence in all 4 axes consistently", () => {
    const kind = "neo4j_unavailable";
    const meta = FAILURE_STATE_METADATA[kind];
    const s = summarizeFailureStateOccurrences([kind]);
    expect(s.total).toBe(1);
    expect(s.byKind[kind]).toBe(1);
    expect(s.byCategory[meta.category]).toBe(1);
    expect(s.bySeverity[meta.defaultSeverity]).toBe(1);
    if (meta.recoverable) {
      expect(s.byRecoverable.recoverable).toBe(1);
      expect(s.byRecoverable.operatorActionRequired).toBe(0);
    } else {
      expect(s.byRecoverable.recoverable).toBe(0);
      expect(s.byRecoverable.operatorActionRequired).toBe(1);
    }
  });

  it("aggregates repeated occurrences correctly", () => {
    const s = summarizeFailureStateOccurrences([
      "neo4j_unavailable",
      "neo4j_unavailable",
      "neo4j_unavailable",
    ]);
    expect(s.total).toBe(3);
    expect(s.byKind["neo4j_unavailable"]).toBe(3);
  });

  it("silently ignores unknown kinds in input", () => {
    const s = summarizeFailureStateOccurrences([
      "neo4j_unavailable",
      "not_a_real_kind",
      "definitely_made_up",
    ]);
    expect(s.total).toBe(1);
    expect(s.byKind["neo4j_unavailable"]).toBe(1);
  });

  it("total sum equals sum across byKind values", () => {
    const input = [
      "neo4j_unavailable",
      "neo4j_unavailable",
      "promotion_failed",
      "text2cypher_rejected",
      "text2cypher_rejected",
      "text2cypher_rejected",
    ];
    const s = summarizeFailureStateOccurrences(input);
    const sumKind = Object.values(s.byKind).reduce((a, b) => a + b, 0);
    const sumCat = Object.values(s.byCategory).reduce((a, b) => a + b, 0);
    const sumSev = Object.values(s.bySeverity).reduce((a, b) => a + b, 0);
    const sumRec =
      s.byRecoverable.recoverable + s.byRecoverable.operatorActionRequired;
    expect(s.total).toBe(input.length);
    expect(sumKind).toBe(s.total);
    expect(sumCat).toBe(s.total);
    expect(sumSev).toBe(s.total);
    expect(sumRec).toBe(s.total);
  });

  it("byCategory has every FAILURE_STATE_CATEGORIES key (stable shape)", () => {
    const s = summarizeFailureStateOccurrences(["promotion_failed"]);
    for (const cat of FAILURE_STATE_CATEGORIES) {
      expect(s.byCategory[cat]).toBeGreaterThanOrEqual(0);
      expect(typeof s.byCategory[cat]).toBe("number");
    }
  });

  it("bySeverity has every FAILURE_STATE_SEVERITIES key (stable shape)", () => {
    const s = summarizeFailureStateOccurrences(["promotion_failed"]);
    for (const sev of FAILURE_STATE_SEVERITIES) {
      expect(s.bySeverity[sev]).toBeGreaterThanOrEqual(0);
      expect(typeof s.bySeverity[sev]).toBe("number");
    }
  });

  it("does not mutate the input array", () => {
    const input = ["neo4j_unavailable", "promotion_failed"];
    const before = [...input];
    summarizeFailureStateOccurrences(input);
    expect(input).toEqual(before);
  });

  it("Object.keys(byKind).length equals FAILURE_STATES.length", () => {
    const s = summarizeFailureStateOccurrences([]);
    expect(Object.keys(s.byKind).length).toBe(FAILURE_STATES.length);
  });
});
