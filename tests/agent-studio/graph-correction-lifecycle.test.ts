/**
 * Phase 23 — Graph Correction Proposal lifecycle tests.
 *
 * Covers `services/graph-correction/lifecycle.ts`. Uses the
 * active-key fake-DB pattern.
 */

import { describe, it, expect, vi } from "vitest";
import {
  submitCorrectionProposal,
  approveCorrectionProposal,
  rejectCorrectionProposal,
  requestRevisionForProposal,
  bulkApproveCorrectionProposals,
  bulkRejectCorrectionProposals,
  listAuditEvents,
  listProposals,
  getProposalById,
  AsdbUnavailableError,
  CorrectionProposalNotFoundError,
  ProposalAlreadyDecidedError,
} from "../../server/agent-studio/services/graph-correction/lifecycle";

interface ProposalRow {
  id: number;
  proposalKind: string;
  targetTypeKey: string | null;
  targetId: number | null;
  proposedChange: Record<string, unknown>;
  confidence: number | null;
  rationale: string | null;
  proposedByUserId: number | null;
  proposedByAgentId: number | null;
  status: string;
  createdAt: Date;
}

interface DecisionRow {
  id: number;
  proposalId: number;
  decision: string;
  decidedByUserId: number | null;
  rationale: string | null;
  decidedAt: Date;
}

interface AuditRow {
  id: number;
  proposalId: number;
  eventKind: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

interface FakeState {
  proposals: ProposalRow[];
  decisions: DecisionRow[];
  audits: AuditRow[];
  nextProposalId: number;
  nextDecisionId: number;
  nextAuditId: number;
  selectQueue: Array<"byId" | "list" | "audit">;
  active: {
    proposalId?: number;
    status?: string;
    proposalKind?: string;
  };
}

function makeFakeDb(initial?: Partial<FakeState>) {
  const state: FakeState = {
    proposals: initial?.proposals ?? [],
    decisions: initial?.decisions ?? [],
    audits: initial?.audits ?? [],
    nextProposalId: initial?.nextProposalId ?? 1000,
    nextDecisionId: initial?.nextDecisionId ?? 2000,
    nextAuditId: initial?.nextAuditId ?? 3000,
    selectQueue: [],
    active: {},
  };

  function tableName(t: unknown): string {
    if (!t) return "?";
    const sym = Object.getOwnPropertySymbols(t).find(
      (s) => s.description === "drizzle:Name",
    );
    if (sym) return String((t as Record<symbol, unknown>)[sym] ?? "?");
    return "?";
  }

  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => {
        const op = state.selectQueue.shift();
        if (op === "audit") {
          return state.audits
            .filter((a) => a.proposalId === state.active.proposalId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (op === "list") {
          let rows = state.proposals;
          if (state.active.status !== undefined) {
            rows = rows.filter((p) => p.status === state.active.status);
          }
          if (state.active.proposalKind !== undefined) {
            rows = rows.filter(
              (p) => p.proposalKind === state.active.proposalKind,
            );
          }
          return {
            limit: async () =>
              rows.sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
              ),
          };
        }
        return chain;
      },
      limit: async () => {
        const op = state.selectQueue.shift();
        if (op === "byId") {
          const found = state.proposals.find(
            (p) => p.id === state.active.proposalId,
          );
          return found ? [found] : [];
        }
        return [];
      },
    };
    return chain;
  });

  const insert = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      values: (vals: Record<string, unknown>) => {
        // Side-effect: record the insert in the fake state.
        if (name === "ags_graph_correction_proposals") {
          const id = state.nextProposalId++;
          const row: ProposalRow = {
            id,
            proposalKind: String(vals.proposalKind),
            targetTypeKey:
              vals.targetTypeKey == null ? null : String(vals.targetTypeKey),
            targetId: vals.targetId == null ? null : Number(vals.targetId),
            proposedChange:
              (vals.proposedChange as Record<string, unknown>) ?? {},
            confidence:
              vals.confidence == null ? null : Number(vals.confidence),
            rationale: vals.rationale == null ? null : String(vals.rationale),
            proposedByUserId:
              vals.proposedByUserId == null
                ? null
                : Number(vals.proposedByUserId),
            proposedByAgentId:
              vals.proposedByAgentId == null
                ? null
                : Number(vals.proposedByAgentId),
            status: String(vals.status ?? "pending"),
            createdAt: new Date(),
          };
          state.proposals.push(row);
          return {
            returning: async () => [row],
            then: (resolve: (v: void) => unknown) => resolve(undefined),
          };
        }
        if (name === "ags_graph_correction_decisions") {
          state.decisions.push({
            id: state.nextDecisionId++,
            proposalId: Number(vals.proposalId),
            decision: String(vals.decision),
            decidedByUserId:
              vals.decidedByUserId == null
                ? null
                : Number(vals.decidedByUserId),
            rationale:
              vals.rationale == null ? null : String(vals.rationale),
            decidedAt: new Date(),
          });
        }
        if (name === "ags_graph_correction_audit_events") {
          state.audits.push({
            id: state.nextAuditId++,
            proposalId: Number(vals.proposalId),
            eventKind: String(vals.eventKind),
            metadata:
              (vals.metadata as Record<string, unknown> | null | undefined) ??
              null,
            createdAt: new Date(),
          });
        }
        // For non-proposal inserts, the service code awaits the
        // .values() call directly. Return a thenable that resolves
        // immediately.
        return {
          returning: async () => [],
          then: (resolve: (v: void) => unknown) => resolve(undefined),
        };
      },
    };
  });

  const update = vi.fn((_table: unknown) => ({
    set: (vals: Record<string, unknown>) => ({
      where: async () => {
        const id = state.active.proposalId;
        if (id == null) return;
        const target = state.proposals.find((p) => p.id === id);
        if (!target) return;
        if ("status" in vals) target.status = String(vals.status);
      },
    }),
  }));

  return { db: { select, insert, update } as unknown, state };
}

describe("submitCorrectionProposal — Phase 23", () => {
  it("throws AsdbUnavailableError on null DB", async () => {
    await expect(
      submitCorrectionProposal(
        { proposalKind: "x", proposedChange: {} },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("inserts a pending proposal + a `submitted` audit event", async () => {
    const { db, state } = makeFakeDb();
    const result = await submitCorrectionProposal(
      {
        proposalKind: "merge_duplicate_entities",
        targetTypeKey: "Entity",
        targetId: 42,
        proposedChange: { merge: [42, 99] },
        confidence: 0.85,
        rationale: "Both entries refer to the same person",
        proposedByAgentId: 7,
      },
      { getDb: () => db as never },
    );
    expect(result.status).toBe("pending");
    expect(result.proposalKind).toBe("merge_duplicate_entities");
    expect(result.confidence).toBe(0.85);
    expect(state.proposals.length).toBe(1);
    // One audit event (the submitted one).
    expect(state.audits.length).toBe(1);
    expect(state.audits[0].eventKind).toBe("submitted");
  });
});

describe("listProposals + getProposalById — Phase 23", () => {
  it("listProposals filters by status", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      proposals: [
        {
          id: 1,
          proposalKind: "x",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "pending",
          createdAt: now,
        },
        {
          id: 2,
          proposalKind: "x",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "approved",
          createdAt: now,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.status = "approved";
    const result = await listProposals(
      { status: "approved" },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(2);
  });

  it("getProposalById returns null for missing rows", async () => {
    const { db, state } = makeFakeDb({});
    state.selectQueue.push("byId");
    state.active.proposalId = 999;
    const result = await getProposalById(999, { getDb: () => db as never });
    expect(result).toBeNull();
  });
});

describe("approveCorrectionProposal — Phase 23", () => {
  it("flips status to approved + writes decision + audit rows", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      proposals: [
        {
          id: 7,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "pending",
          createdAt: now,
        },
      ],
    });
    // service.decide: getProposalById(byId) → update → insert decision → insert audit → getProposalById(byId)
    state.selectQueue.push("byId", "byId");
    state.active.proposalId = 7;
    const result = await approveCorrectionProposal(7, 42, "Looks correct.", {
      getDb: () => db as never,
    });
    expect(result.status).toBe("approved");
    expect(state.decisions.length).toBe(1);
    expect(state.decisions[0].decision).toBe("approved");
    expect(state.audits.length).toBe(1);
    expect(state.audits[0].eventKind).toBe("approved");
  });

  it("throws CorrectionProposalNotFoundError on missing proposal", async () => {
    const { db, state } = makeFakeDb({});
    state.selectQueue.push("byId");
    state.active.proposalId = 999;
    await expect(
      approveCorrectionProposal(999, 42, null, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(CorrectionProposalNotFoundError);
  });

  it("throws ProposalAlreadyDecidedError when proposal isn't pending", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      proposals: [
        {
          id: 7,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "approved",
          createdAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.proposalId = 7;
    await expect(
      approveCorrectionProposal(7, 42, null, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(ProposalAlreadyDecidedError);
  });
});

describe("rejectCorrectionProposal + requestRevisionForProposal — Phase 23", () => {
  it("reject flips status to rejected + records audit", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      proposals: [
        {
          id: 7,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "pending",
          createdAt: now,
        },
      ],
    });
    state.selectQueue.push("byId", "byId");
    state.active.proposalId = 7;
    const result = await rejectCorrectionProposal(7, 42, "Insufficient evidence", {
      getDb: () => db as never,
    });
    expect(result.status).toBe("rejected");
    expect(state.audits[0].eventKind).toBe("rejected");
  });

  it("requestRevision flips status to revision_requested + records audit", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      proposals: [
        {
          id: 7,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "pending",
          createdAt: now,
        },
      ],
    });
    state.selectQueue.push("byId", "byId");
    state.active.proposalId = 7;
    const result = await requestRevisionForProposal(7, 42, "Add more sources", {
      getDb: () => db as never,
    });
    expect(result.status).toBe("revision_requested");
    expect(state.audits[0].eventKind).toBe("revision_requested");
  });
});

describe("listAuditEvents — Phase 23", () => {
  it("returns the audit chain for a proposal in newest-first order", async () => {
    const now = new Date();
    const older = new Date(now.getTime() - 1000);
    const { db, state } = makeFakeDb({
      audits: [
        {
          id: 1,
          proposalId: 7,
          eventKind: "submitted",
          metadata: null,
          createdAt: older,
        },
        {
          id: 2,
          proposalId: 7,
          eventKind: "approved",
          metadata: null,
          createdAt: now,
        },
        {
          id: 3,
          proposalId: 8,
          eventKind: "submitted",
          metadata: null,
          createdAt: now,
        },
      ],
    });
    state.selectQueue.push("audit");
    state.active.proposalId = 7;
    const result = await listAuditEvents(7, { getDb: () => db as never });
    expect(result.length).toBe(2);
    expect(result[0].eventKind).toBe("approved");
    expect(result[1].eventKind).toBe("submitted");
  });

  it("returns [] on ASDB-null", async () => {
    const result = await listAuditEvents(7, { getDb: () => null as never });
    expect(result).toEqual([]);
  });
});

/**
 * Sequenced fake-DB for bulk-approve testing. Each approve call inside
 * the bulk loop does two byId selects (status check + post-update read);
 * `proposalIdSequence` is a pre-populated queue that pops one id per
 * byId select so the same fake DB can serve multiple sequential
 * approves without per-call state.active manipulation.
 */
function makeBulkFakeDb(initial: {
  proposals: ProposalRow[];
  proposalIdSequence: number[];
}) {
  const state = {
    proposals: initial.proposals,
    decisions: [] as DecisionRow[],
    audits: [] as AuditRow[],
    nextDecisionId: 2000,
    nextAuditId: 3000,
    proposalIdSequence: [...initial.proposalIdSequence],
  };

  function tableName(t: unknown): string {
    if (!t) return "?";
    const sym = Object.getOwnPropertySymbols(t).find(
      (s) => s.description === "drizzle:Name",
    );
    if (sym) return String((t as Record<symbol, unknown>)[sym] ?? "?");
    return "?";
  }

  let lastUpdateId: number | null = null;

  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => {
        const id = state.proposalIdSequence.shift();
        if (id == null) return [];
        const found = state.proposals.find((p) => p.id === id);
        return found ? [found] : [];
      },
    };
    return chain;
  });

  const insert = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      values: (vals: Record<string, unknown>) => {
        if (name === "ags_graph_correction_decisions") {
          state.decisions.push({
            id: state.nextDecisionId++,
            proposalId: Number(vals.proposalId),
            decision: String(vals.decision),
            decidedByUserId:
              vals.decidedByUserId == null
                ? null
                : Number(vals.decidedByUserId),
            rationale: vals.rationale == null ? null : String(vals.rationale),
            decidedAt: new Date(),
          });
        }
        if (name === "ags_graph_correction_audit_events") {
          state.audits.push({
            id: state.nextAuditId++,
            proposalId: Number(vals.proposalId),
            eventKind: String(vals.eventKind),
            metadata:
              (vals.metadata as Record<string, unknown> | null | undefined) ??
              null,
            createdAt: new Date(),
          });
        }
        return {
          returning: async () => [],
          then: (resolve: (v: void) => unknown) => resolve(undefined),
        };
      },
    };
  });

  const update = vi.fn((_table: unknown) => ({
    set: (vals: Record<string, unknown>) => ({
      where: async () => {
        // Mutation target is the proposal whose next byId select would
        // return it — we mutate by peeking at the head of the id
        // sequence (the post-update read uses the same id).
        const id = state.proposalIdSequence[0] ?? lastUpdateId;
        if (id == null) return;
        lastUpdateId = id;
        const target = state.proposals.find((p) => p.id === id);
        if (!target) return;
        if ("status" in vals) target.status = String(vals.status);
      },
    }),
  }));

  return { db: { select, insert, update } as unknown, state };
}

describe("bulkApproveCorrectionProposals — Phase 23", () => {
  it("returns empty result for empty input", async () => {
    const { db } = makeBulkFakeDb({ proposals: [], proposalIdSequence: [] });
    const result = await bulkApproveCorrectionProposals(
      { proposalIds: [], decidedByUserId: 42 },
      { getDb: () => db as never },
    );
    expect(result.approved).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("approves a single pending proposal", async () => {
    const now = new Date();
    const { db, state } = makeBulkFakeDb({
      proposals: [
        {
          id: 7,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "pending",
          createdAt: now,
        },
      ],
      proposalIdSequence: [7, 7],
    });
    const result = await bulkApproveCorrectionProposals(
      { proposalIds: [7], decidedByUserId: 42, rationale: "looks good" },
      { getDb: () => db as never },
    );
    expect(result.approved).toHaveLength(1);
    expect(result.approved[0].id).toBe(7);
    expect(result.approved[0].status).toBe("approved");
    expect(result.skipped).toEqual([]);
    expect(state.decisions[0].decision).toBe("approved");
  });

  it("dedups duplicate ids in input list", async () => {
    const now = new Date();
    const { db } = makeBulkFakeDb({
      proposals: [
        {
          id: 7,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "pending",
          createdAt: now,
        },
      ],
      proposalIdSequence: [7, 7],
    });
    const result = await bulkApproveCorrectionProposals(
      { proposalIds: [7, 7, 7], decidedByUserId: 42 },
      { getDb: () => db as never },
    );
    expect(result.approved).toHaveLength(1);
  });

  it("collects skipped entries for not-found and already-decided", async () => {
    const now = new Date();
    const { db } = makeBulkFakeDb({
      proposals: [
        {
          id: 7,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "pending",
          createdAt: now,
        },
        {
          id: 8,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "approved",
          createdAt: now,
        },
      ],
      // 7 pending → 2 selects; 8 already-decided → 1 select; 999 not-found → 1 select.
      proposalIdSequence: [7, 7, 8, 999],
    });
    const result = await bulkApproveCorrectionProposals(
      { proposalIds: [7, 8, 999], decidedByUserId: 42 },
      { getDb: () => db as never },
    );
    expect(result.approved).toHaveLength(1);
    expect(result.approved[0].id).toBe(7);
    expect(result.skipped).toHaveLength(2);
    const skippedByReason = Object.fromEntries(
      result.skipped.map((s) => [s.proposalId, s.reason]),
    );
    expect(skippedByReason).toEqual({
      8: "already_decided",
      999: "not_found",
    });
  });

  it("bubbles out AsdbUnavailable instead of swallowing", async () => {
    await expect(
      bulkApproveCorrectionProposals(
        { proposalIds: [7], decidedByUserId: 42 },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });
});

describe("bulkRejectCorrectionProposals — Phase 23", () => {
  it("returns empty result for empty input", async () => {
    const { db } = makeBulkFakeDb({ proposals: [], proposalIdSequence: [] });
    const result = await bulkRejectCorrectionProposals(
      { proposalIds: [], decidedByUserId: 42 },
      { getDb: () => db as never },
    );
    expect(result.rejected).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("rejects a single pending proposal", async () => {
    const now = new Date();
    const { db, state } = makeBulkFakeDb({
      proposals: [
        {
          id: 7,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "pending",
          createdAt: now,
        },
      ],
      proposalIdSequence: [7, 7],
    });
    const result = await bulkRejectCorrectionProposals(
      { proposalIds: [7], decidedByUserId: 42, rationale: "stale finding" },
      { getDb: () => db as never },
    );
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].id).toBe(7);
    expect(result.rejected[0].status).toBe("rejected");
    expect(result.skipped).toEqual([]);
    expect(state.decisions[0].decision).toBe("rejected");
  });

  it("collects skipped entries for not-found and already-decided", async () => {
    const now = new Date();
    const { db } = makeBulkFakeDb({
      proposals: [
        {
          id: 7,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "pending",
          createdAt: now,
        },
        {
          id: 8,
          proposalKind: "merge",
          targetTypeKey: null,
          targetId: null,
          proposedChange: {},
          confidence: null,
          rationale: null,
          proposedByUserId: null,
          proposedByAgentId: null,
          status: "approved",
          createdAt: now,
        },
      ],
      proposalIdSequence: [7, 7, 8, 999],
    });
    const result = await bulkRejectCorrectionProposals(
      { proposalIds: [7, 8, 999], decidedByUserId: 42 },
      { getDb: () => db as never },
    );
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].id).toBe(7);
    expect(result.skipped).toHaveLength(2);
    const skippedByReason = Object.fromEntries(
      result.skipped.map((s) => [s.proposalId, s.reason]),
    );
    expect(skippedByReason).toEqual({
      8: "already_decided",
      999: "not_found",
    });
  });

  it("bubbles out AsdbUnavailable instead of swallowing", async () => {
    await expect(
      bulkRejectCorrectionProposals(
        { proposalIds: [7], decidedByUserId: 42 },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });
});
