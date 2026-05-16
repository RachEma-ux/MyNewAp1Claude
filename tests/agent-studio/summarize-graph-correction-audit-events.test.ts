/**
 * Phase D §T-D.19 — `summarizeGraphCorrectionAuditEvents` lockstep.
 *
 * Sparse-axis aggregator over the graph-correction `AuditEventRow`
 * surface (per-proposal lifecycle event stream). Companion to
 * T-D.18 proposal aggregator (#1209).
 *
 * 28th instantiation of the lesson-30 aggregator-pair pattern.
 * No new structural variant.
 */

import { describe, expect, it } from "vitest";
import { summarizeGraphCorrectionAuditEvents } from "../../server/agent-studio/services/graph-correction/audit-event-summary.js";
import type { AuditEventRow } from "../../server/agent-studio/services/graph-correction/lifecycle.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(overrides: Partial<AuditEventRow> = {}): AuditEventRow {
  return {
    id: 1,
    proposalId: 1,
    eventKind: "submitted",
    metadata: null,
    createdAt: FROZEN_NOW,
    ...overrides,
  };
}

describe("summarizeGraphCorrectionAuditEvents — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeGraphCorrectionAuditEvents([]);
    expect(s.total).toBe(0);
    expect(s.distinctEventKindCount).toBe(0);
    expect(s.distinctProposalCount).toBe(0);
    expect(s.topEventKinds).toEqual([]);
    expect(s.withMetadataCount).toBe(0);
    expect(s.ageStats).toBeNull();
    expect(s.byEventKind).toEqual({});
  });
});

describe("summarizeGraphCorrectionAuditEvents — sparse eventKind axis", () => {
  it("counts per eventKind", () => {
    const s = summarizeGraphCorrectionAuditEvents([
      makeRow({ eventKind: "submitted" }),
      makeRow({ eventKind: "submitted" }),
      makeRow({ eventKind: "approved" }),
      makeRow({ eventKind: "applied" }),
    ]);
    expect(s.byEventKind.submitted).toBe(2);
    expect(s.byEventKind.approved).toBe(1);
    expect(s.byEventKind.applied).toBe(1);
    expect(s.distinctEventKindCount).toBe(3);
  });

  it("unregistered keys absent from sparse axis", () => {
    const s = summarizeGraphCorrectionAuditEvents([
      makeRow({ eventKind: "submitted" }),
    ]);
    expect(s.byEventKind.never_seen).toBeUndefined();
  });
});

describe("summarizeGraphCorrectionAuditEvents — top-N truncation", () => {
  it("topEventKinds sorted descending; ties alphabetical", () => {
    const rows: AuditEventRow[] = [];
    for (let i = 0; i < 5; i++) rows.push(makeRow({ eventKind: "a" }));
    for (let i = 0; i < 3; i++) rows.push(makeRow({ eventKind: "b" }));
    rows.push(makeRow({ eventKind: "c" }));
    rows.push(makeRow({ eventKind: "d" }));
    const s = summarizeGraphCorrectionAuditEvents(rows);
    expect(s.topEventKinds).toEqual([
      { key: "a", count: 5 },
      { key: "b", count: 3 },
      { key: "c", count: 1 },
      { key: "d", count: 1 },
    ]);
  });

  it("default truncates at 10; custom topN works", () => {
    const rows: AuditEventRow[] = [];
    for (let i = 0; i < 15; i++) rows.push(makeRow({ eventKind: `k${i}` }));
    expect(summarizeGraphCorrectionAuditEvents(rows).topEventKinds).toHaveLength(10);
    expect(summarizeGraphCorrectionAuditEvents(rows, { topN: 3 }).topEventKinds).toHaveLength(3);
  });
});

describe("summarizeGraphCorrectionAuditEvents — gauges", () => {
  it("withMetadataCount counts non-null metadata payloads", () => {
    const s = summarizeGraphCorrectionAuditEvents([
      makeRow({ metadata: { foo: 1 } }),
      makeRow({ metadata: null }),
      makeRow({ metadata: {} }),
    ]);
    expect(s.withMetadataCount).toBe(2);
  });

  it("distinctProposalCount counts unique proposalIds", () => {
    const s = summarizeGraphCorrectionAuditEvents([
      makeRow({ proposalId: 1 }),
      makeRow({ proposalId: 1 }),
      makeRow({ proposalId: 2 }),
      makeRow({ proposalId: 3 }),
    ]);
    expect(s.distinctProposalCount).toBe(3);
  });
});

describe("summarizeGraphCorrectionAuditEvents — ageStats", () => {
  it("computes ms from createdAt to now", () => {
    const earlier = new Date(FROZEN_NOW.getTime() - 120_000);
    const s = summarizeGraphCorrectionAuditEvents(
      [makeRow({ createdAt: earlier })],
      { now: FROZEN_NOW },
    );
    expect(s.ageStats).not.toBeNull();
    expect(s.ageStats!.min).toBe(120_000);
  });
});

describe("summarizeGraphCorrectionAuditEvents — total invariant", () => {
  it("total equals input row count", () => {
    const s = summarizeGraphCorrectionAuditEvents([
      makeRow(),
      makeRow(),
      makeRow(),
    ]);
    expect(s.total).toBe(3);
  });
});
