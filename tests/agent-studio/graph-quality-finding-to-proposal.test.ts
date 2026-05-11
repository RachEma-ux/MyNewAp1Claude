/**
 * Phase 23 §1 — finding → graph-correction proposal converter.
 *
 * Pure unit tests via fake DB + mocked submitCorrectionProposal.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { submitCorrectionProposalMock } = vi.hoisted(() => ({
  submitCorrectionProposalMock: vi.fn(),
}));
vi.mock(
  "../../server/agent-studio/services/graph-correction/public-api.js",
  () => ({
    submitCorrectionProposal: submitCorrectionProposalMock,
  }),
);

import {
  convertFindingToProposal,
  proposalKindForFinding,
  severityToConfidence,
  FindingNotFoundError,
  FindingAlreadyConvertedError,
  AsdbUnavailableError,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/finding-to-proposal";

interface FakeFindingRow {
  id: number;
  scanId: number;
  findingClass: string;
  severity: string;
  sourceTypeKey: string | null;
  sourceId: string | null;
  details: Record<string, unknown> | null;
  proposalId: number | null;
  createdAt: Date;
}

function makeFakeDb(rows: FakeFindingRow[]) {
  const state = {
    findings: rows,
    updates: [] as Record<string, unknown>[],
  };

  const select = vi.fn(() => ({
    from: (_t: unknown) => ({
      where: (_w: unknown) => ({
        limit: async (_n: number) => state.findings,
      }),
    }),
  }));

  const update = vi.fn((_t: unknown) => ({
    set: (patch: Record<string, unknown>) => ({
      where: async () => {
        state.updates.push(patch);
      },
    }),
  }));

  return { db: { select, update }, state };
}

beforeEach(() => {
  submitCorrectionProposalMock.mockReset();
});

describe("proposalKindForFinding", () => {
  it("maps known finding classes via the canonical table", () => {
    expect(proposalKindForFinding("orphan_node")).toBe(
      "link_or_archive_orphan_node",
    );
    expect(proposalKindForFinding("duplicate_entity")).toBe(
      "merge_duplicate_entities",
    );
  });

  it("falls back to review_<class> for unknown finding classes", () => {
    expect(proposalKindForFinding("future_kind_xyz")).toBe(
      "review_future_kind_xyz",
    );
  });

  it("FINDING_CLASS_TO_PROPOSAL_KIND covers both PR #473 + #474 scanners", () => {
    expect(FINDING_CLASS_TO_PROPOSAL_KIND.orphan_node).toBeDefined();
    expect(FINDING_CLASS_TO_PROPOSAL_KIND.duplicate_entity).toBeDefined();
  });
});

describe("severityToConfidence", () => {
  it("maps severity tiers to monotonically increasing confidence", () => {
    expect(severityToConfidence("low")).toBeLessThan(
      severityToConfidence("medium"),
    );
    expect(severityToConfidence("medium")).toBeLessThan(
      severityToConfidence("high"),
    );
    expect(severityToConfidence("high")).toBeLessThan(
      severityToConfidence("critical"),
    );
    expect(severityToConfidence("critical")).toBeLessThanOrEqual(1);
  });

  it("falls back to 0.5 for an unknown severity", () => {
    expect(severityToConfidence("weird")).toBe(0.5);
  });
});

describe("convertFindingToProposal", () => {
  it("throws AsdbUnavailableError when ASDB is null", async () => {
    await expect(
      convertFindingToProposal(
        { findingId: 1 },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("throws FindingNotFoundError for an unknown finding id", async () => {
    const { db } = makeFakeDb([]);
    await expect(
      convertFindingToProposal(
        { findingId: 999 },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(FindingNotFoundError);
  });

  it("throws FindingAlreadyConvertedError when proposal_id is set", async () => {
    const { db } = makeFakeDb([
      {
        id: 5,
        scanId: 1,
        findingClass: "orphan_node",
        severity: "medium",
        sourceTypeKey: "Note",
        sourceId: "note:1",
        details: null,
        proposalId: 42, // already linked
        createdAt: new Date(),
      },
    ]);
    await expect(
      convertFindingToProposal(
        { findingId: 5 },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(FindingAlreadyConvertedError);
  });

  it("submits a proposal carrying the finding payload + back-links the finding", async () => {
    const { db, state } = makeFakeDb([
      {
        id: 7,
        scanId: 3,
        findingClass: "orphan_node",
        severity: "medium",
        sourceTypeKey: "Note",
        sourceId: "note:42",
        details: { sampleTruncated: false, nodeSourceId: "42" },
        proposalId: null,
        createdAt: new Date(),
      },
    ]);
    submitCorrectionProposalMock.mockResolvedValueOnce({
      id: 101,
      proposalKind: "link_or_archive_orphan_node",
      status: "pending",
    });

    const result = await convertFindingToProposal(
      { findingId: 7, proposedByUserId: 1 },
      { getDb: () => db as never },
    );

    expect(result).toEqual({
      findingId: 7,
      proposalId: 101,
      proposalKind: "link_or_archive_orphan_node",
    });

    expect(submitCorrectionProposalMock).toHaveBeenCalledTimes(1);
    const submitArgs = submitCorrectionProposalMock.mock.calls[0][0];
    expect(submitArgs).toMatchObject({
      proposalKind: "link_or_archive_orphan_node",
      targetTypeKey: "Note",
      targetId: null,
      confidence: 0.6, // severity=medium
      proposedByUserId: 1,
    });
    expect(submitArgs.proposedChange.finding).toMatchObject({
      id: 7,
      findingClass: "orphan_node",
      sourceId: "note:42",
    });
    expect(submitArgs.proposedChange.suggestedAction).toBe(
      "link_or_archive_orphan_node",
    );

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toEqual({ proposalId: 101, status: "triaged" });
  });

  it("uses the unknown-kind fallback for a scanner kind without a mapping", async () => {
    const { db } = makeFakeDb([
      {
        id: 11,
        scanId: 1,
        findingClass: "weird_kind",
        severity: "high",
        sourceTypeKey: null,
        sourceId: null,
        details: null,
        proposalId: null,
        createdAt: new Date(),
      },
    ]);
    submitCorrectionProposalMock.mockResolvedValueOnce({
      id: 50,
      proposalKind: "review_weird_kind",
      status: "pending",
    });

    const result = await convertFindingToProposal(
      { findingId: 11 },
      { getDb: () => db as never },
    );
    expect(result.proposalKind).toBe("review_weird_kind");
    expect(submitCorrectionProposalMock.mock.calls[0][0].proposalKind).toBe(
      "review_weird_kind",
    );
  });

  it("uses operator-provided rationale when given, otherwise auto-fills", async () => {
    const { db } = makeFakeDb([
      {
        id: 2,
        scanId: 1,
        findingClass: "orphan_node",
        severity: "low",
        sourceTypeKey: "X",
        sourceId: "x:1",
        details: null,
        proposalId: null,
        createdAt: new Date(),
      },
    ]);
    submitCorrectionProposalMock.mockResolvedValueOnce({ id: 9 });

    await convertFindingToProposal(
      { findingId: 2, rationale: "Operator override" },
      { getDb: () => db as never },
    );
    expect(submitCorrectionProposalMock.mock.calls[0][0].rationale).toBe(
      "Operator override",
    );

    submitCorrectionProposalMock.mockReset();
    submitCorrectionProposalMock.mockResolvedValueOnce({ id: 10 });

    const { db: db2 } = makeFakeDb([
      {
        id: 3,
        scanId: 1,
        findingClass: "orphan_node",
        severity: "medium",
        sourceTypeKey: "X",
        sourceId: "x:1",
        details: null,
        proposalId: null,
        createdAt: new Date(),
      },
    ]);
    await convertFindingToProposal(
      { findingId: 3 },
      { getDb: () => db2 as never },
    );
    expect(submitCorrectionProposalMock.mock.calls[0][0].rationale).toMatch(
      /Auto-generated from graph-quality finding 3/,
    );
  });
});
