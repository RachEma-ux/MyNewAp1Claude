/**
 * Phase D §T-D.18 — `summarizeGraphCorrectionProposals` lockstep.
 *
 * Composite aggregator over the graph-correction `ProposalRow`
 * surface combining closed-status taxonomy + terminal-set companion +
 * sparse open-ended proposalKind axis + top-N truncation + NumericStats
 * (confidence + age) + derived 3-way proposer partition. Also
 * lockstep-tests the `PROPOSAL_STATUSES` / `TERMINAL_PROPOSAL_STATUSES`
 * tuple promotions per lesson-26 combined-slice pattern.
 *
 * 27th instantiation of the lesson-30 aggregator-pair pattern.
 * No new structural variant.
 */

import { describe, expect, it } from "vitest";
import {
  PROPOSAL_STATUSES,
  TERMINAL_PROPOSAL_STATUSES,
  type ProposalRow,
} from "../../server/agent-studio/services/graph-correction/lifecycle.js";
import { summarizeGraphCorrectionProposals } from "../../server/agent-studio/services/graph-correction/proposal-summary.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: 1,
    proposalKind: "entity_merge",
    targetTypeKey: null,
    targetId: null,
    proposedChange: {},
    confidence: null,
    rationale: null,
    proposedByUserId: null,
    proposedByAgentId: null,
    status: "pending",
    createdAt: FROZEN_NOW,
    ...overrides,
  };
}

describe("PROPOSAL_STATUSES — closed taxonomy invariant", () => {
  it("contains exactly the 5 expected values", () => {
    expect(PROPOSAL_STATUSES).toEqual([
      "pending",
      "approved",
      "rejected",
      "revision_requested",
      "withdrawn",
    ]);
  });

  it("TERMINAL_PROPOSAL_STATUSES is a strict subset", () => {
    for (const v of TERMINAL_PROPOSAL_STATUSES) {
      expect(PROPOSAL_STATUSES).toContain(v);
    }
    expect(TERMINAL_PROPOSAL_STATUSES.size).toBe(3);
  });
});

describe("summarizeGraphCorrectionProposals — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeGraphCorrectionProposals([]);
    expect(s.total).toBe(0);
    expect(s.unknownStatusCount).toBe(0);
    expect(s.distinctProposalKindCount).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.withRationaleCount).toBe(0);
    expect(s.confidenceStats).toBeNull();
    expect(s.ageStats).toBeNull();
  });

  it("zero-fills the closed status taxonomy on empty", () => {
    const s = summarizeGraphCorrectionProposals([]);
    for (const status of PROPOSAL_STATUSES) {
      expect(s.byStatus[status]).toBe(0);
    }
  });

  it("zero-fills the proposer partition on empty", () => {
    const s = summarizeGraphCorrectionProposals([]);
    expect(s.byProposer).toEqual({ user: 0, agent: 0, anonymous: 0 });
  });
});

describe("summarizeGraphCorrectionProposals — closed status axis", () => {
  it("counts per status; zero-fills absent statuses", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ status: "pending" }),
      makeRow({ status: "approved" }),
      makeRow({ status: "approved" }),
      makeRow({ status: "rejected" }),
    ]);
    expect(s.byStatus.pending).toBe(1);
    expect(s.byStatus.approved).toBe(2);
    expect(s.byStatus.rejected).toBe(1);
    expect(s.byStatus.revision_requested).toBe(0);
    expect(s.byStatus.withdrawn).toBe(0);
  });

  it("unknown statuses partition separately, not in byStatus", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ status: "pending" }),
      makeRow({ status: "alien_status" as unknown as ProposalRow["status"] }),
      makeRow({ status: "another_unknown" as unknown as ProposalRow["status"] }),
    ]);
    expect(s.byStatus.pending).toBe(1);
    expect(s.unknownStatusCount).toBe(2);
  });

  it("terminal + inflight equals (total - unknown)", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ status: "pending" }),
      makeRow({ status: "approved" }),
      makeRow({ status: "rejected" }),
      makeRow({ status: "withdrawn" }),
      makeRow({ status: "revision_requested" }),
      makeRow({ status: "alien" as unknown as ProposalRow["status"] }),
    ]);
    expect(s.terminalCount).toBe(3);
    expect(s.inFlightCount).toBe(2);
    expect(s.terminalCount + s.inFlightCount).toBe(s.total - s.unknownStatusCount);
  });
});

describe("summarizeGraphCorrectionProposals — sparse proposalKind + top-N", () => {
  it("counts per proposalKind", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ proposalKind: "entity_merge" }),
      makeRow({ proposalKind: "entity_merge" }),
      makeRow({ proposalKind: "description_enrichment" }),
    ]);
    expect(s.byProposalKind.entity_merge).toBe(2);
    expect(s.byProposalKind.description_enrichment).toBe(1);
    expect(s.distinctProposalKindCount).toBe(2);
  });

  it("topProposalKinds sorted descending; ties alphabetical", () => {
    const rows: ProposalRow[] = [];
    for (let i = 0; i < 5; i++) rows.push(makeRow({ proposalKind: "a" }));
    for (let i = 0; i < 3; i++) rows.push(makeRow({ proposalKind: "b" }));
    rows.push(makeRow({ proposalKind: "c" }));
    rows.push(makeRow({ proposalKind: "d" }));
    const s = summarizeGraphCorrectionProposals(rows);
    expect(s.topProposalKinds).toEqual([
      { key: "a", count: 5 },
      { key: "b", count: 3 },
      { key: "c", count: 1 },
      { key: "d", count: 1 },
    ]);
  });
});

describe("summarizeGraphCorrectionProposals — proposer 3-way partition", () => {
  it("derives user / agent / anonymous from nullable fields", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ proposedByUserId: 1, proposedByAgentId: null }),
      makeRow({ proposedByUserId: null, proposedByAgentId: 5 }),
      makeRow({ proposedByUserId: null, proposedByAgentId: null }),
      makeRow({ proposedByUserId: 2, proposedByAgentId: null }),
    ]);
    expect(s.byProposer.user).toBe(2);
    expect(s.byProposer.agent).toBe(1);
    expect(s.byProposer.anonymous).toBe(1);
  });

  it("byProposer sums to total (partition invariant)", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ proposedByUserId: 1 }),
      makeRow({ proposedByAgentId: 1 }),
      makeRow(),
    ]);
    expect(s.byProposer.user + s.byProposer.agent + s.byProposer.anonymous).toBe(s.total);
  });

  it("user priority — when both fields set, classified as user", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ proposedByUserId: 1, proposedByAgentId: 5 }),
    ]);
    expect(s.byProposer.user).toBe(1);
    expect(s.byProposer.agent).toBe(0);
  });
});

describe("summarizeGraphCorrectionProposals — confidence + age stats", () => {
  it("confidenceStats null when no row carries a confidence", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ confidence: null }),
      makeRow({ confidence: null }),
    ]);
    expect(s.confidenceStats).toBeNull();
  });

  it("confidenceStats includes only confidence-carrying rows", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ confidence: 0.5 }),
      makeRow({ confidence: 0.9 }),
      makeRow({ confidence: null }),
    ]);
    expect(s.confidenceStats).not.toBeNull();
    expect(s.confidenceStats!.count).toBe(2);
    expect(s.confidenceStats!.min).toBe(0.5);
    expect(s.confidenceStats!.max).toBe(0.9);
  });

  it("withRationaleCount counts non-null rationales", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow({ rationale: "because" }),
      makeRow({ rationale: null }),
      makeRow({ rationale: "" }),
    ]);
    expect(s.withRationaleCount).toBe(2);
  });

  it("ageStats computes ms from createdAt to now", () => {
    const earlier = new Date(FROZEN_NOW.getTime() - 120_000);
    const s = summarizeGraphCorrectionProposals(
      [makeRow({ createdAt: earlier })],
      { now: FROZEN_NOW },
    );
    expect(s.ageStats).not.toBeNull();
    expect(s.ageStats!.min).toBe(120_000);
  });
});

describe("summarizeGraphCorrectionProposals — total invariant", () => {
  it("total equals input row count", () => {
    const s = summarizeGraphCorrectionProposals([
      makeRow(),
      makeRow(),
      makeRow(),
    ]);
    expect(s.total).toBe(3);
  });
});
