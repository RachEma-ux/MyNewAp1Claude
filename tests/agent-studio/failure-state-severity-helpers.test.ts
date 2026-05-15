/**
 * Phase 22 §T-I.27 — failure-state severity ordering helpers.
 *
 * Mirror of T-G.12 + T-D.9 applied to the 3-key FAILURE_STATE_SEVERITIES
 * taxonomy (info / warning / critical). Operator triage panels sort
 * event rows critical-first.
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATE_SEVERITIES,
  failureStateSeverityRank,
  compareFailureStateSeverity,
  sortFailureStateItemsBySeverityDesc,
  getMostSevereFailureStateItem,
  type FailureStateSeverity,
} from "../../server/agent-studio/services/failure-states/public-api.js";

describe("failure-state severity helpers (T-I.27)", () => {
  it("rank monotone 0..2", () => {
    expect(failureStateSeverityRank("info")).toBe(0);
    expect(failureStateSeverityRank("warning")).toBe(1);
    expect(failureStateSeverityRank("critical")).toBe(2);
  });

  it.each(FAILURE_STATE_SEVERITIES)(
    "rank round-trips for %s",
    (s) => {
      expect(FAILURE_STATE_SEVERITIES[failureStateSeverityRank(s)]).toBe(s);
    },
  );

  it("comparator: ascending Array.sort", () => {
    const arr: FailureStateSeverity[] = ["critical", "info", "warning"];
    expect([...arr].sort(compareFailureStateSeverity)).toEqual([
      "info",
      "warning",
      "critical",
    ]);
  });

  it("comparator: equal returns 0", () => {
    expect(compareFailureStateSeverity("warning", "warning")).toBe(0);
  });

  it("sort-desc: critical first, info last", () => {
    const items = [
      { id: "a", sev: "info" as const },
      { id: "b", sev: "critical" as const },
      { id: "c", sev: "warning" as const },
    ];
    expect(
      sortFailureStateItemsBySeverityDesc(items, (x) => x.sev).map((x) => x.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("sort-desc: stable for ties", () => {
    const items = [
      { id: "x1", sev: "warning" as const },
      { id: "x2", sev: "warning" as const },
    ];
    expect(
      sortFailureStateItemsBySeverityDesc(items, (x) => x.sev).map((x) => x.id),
    ).toEqual(["x1", "x2"]);
  });

  it("sort-desc: non-mutating", () => {
    const items = [{ id: "a", sev: "info" as const }];
    const before = [...items];
    sortFailureStateItemsBySeverityDesc(items, (x) => x.sev);
    expect(items).toEqual(before);
  });

  it("sort-desc: empty stays empty", () => {
    expect(
      sortFailureStateItemsBySeverityDesc(
        [],
        (x: { sev: FailureStateSeverity }) => x.sev,
      ),
    ).toEqual([]);
  });

  it("most-severe: picks first critical", () => {
    const items = [
      { id: "a", sev: "warning" as const },
      { id: "b", sev: "critical" as const },
      { id: "c", sev: "critical" as const },
    ];
    expect(getMostSevereFailureStateItem(items, (x) => x.sev)?.id).toBe("b");
  });

  it("most-severe: first-tie wins", () => {
    const items = [
      { id: "first", sev: "warning" as const },
      { id: "second", sev: "warning" as const },
    ];
    expect(getMostSevereFailureStateItem(items, (x) => x.sev)?.id).toBe(
      "first",
    );
  });

  it("most-severe: undefined for empty", () => {
    expect(
      getMostSevereFailureStateItem(
        [],
        (x: { sev: FailureStateSeverity }) => x.sev,
      ),
    ).toBeUndefined();
  });
});
