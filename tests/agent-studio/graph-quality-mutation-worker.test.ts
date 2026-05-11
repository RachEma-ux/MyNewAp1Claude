/**
 * Phase 23 §1 — approved-proposal mutation worker (stub).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyApprovedProposal,
  DEFAULT_APPLIER_REGISTRY,
  AsdbUnavailableError,
  ProposalNotFoundError,
  ProposalNotApprovedError,
  ProposalAlreadyAppliedError,
  InvalidProposalPayloadError,
  type ApplierRegistry,
} from "../../server/agent-studio/services/graph-quality/mutation-worker";

interface FakeProposalRow {
  id: number;
  status: string;
  proposedChange: Record<string, unknown> | null;
}

interface FakeAuditRow {
  proposalId: number;
  eventKind: string;
  metadata: Record<string, unknown> | null;
}

function makeFakeDb(rows: FakeProposalRow[], priorAudits: FakeAuditRow[] = []) {
  const state = {
    proposals: rows,
    audits: [...priorAudits] as FakeAuditRow[],
    nextAuditId: 1,
  };

  const tableName = (t: unknown): string => {
    const sym = Object.getOwnPropertySymbols(t as object).find(
      (s) => s.description === "drizzle:Name",
    );
    return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
  };

  const select = vi.fn(() => ({
    from: (t: unknown) => {
      const tname = tableName(t);
      const buildChain = (predicate: (r: any) => boolean) => ({
        where: (_w: unknown) => {
          // Return both a thenable (for the audit lookup path that does
          // not call .limit) and a builder that supports .orderBy().limit
          const proposalChain = {
            limit: async (_n: number) => {
              if (tname === "ags_graph_correction_proposals") {
                return state.proposals.filter(predicate);
              }
              if (tname === "ags_graph_correction_audit_events") {
                return state.audits.filter(predicate);
              }
              return [];
            },
            orderBy: (_o: unknown) => ({
              limit: async (_n: number) => {
                if (tname === "ags_graph_correction_audit_events") {
                  return state.audits.filter(predicate);
                }
                return [];
              },
            }),
          };
          return proposalChain;
        },
      });

      // Capture the predicate from the where() call — but our fake
      // doesn't actually parse Drizzle conditions. We approximate by:
      //   - on ags_graph_correction_proposals: predicate=always-true,
      //     since the orchestrator always selects exactly one proposal
      //     by id; rows are seeded with one proposal in tests.
      //   - on ags_graph_correction_audit_events: predicate=always-true,
      //     since tests seed exactly the audits they want returned.
      return buildChain(() => true);
    },
  }));

  const insert = vi.fn((t: unknown) => {
    const tname = tableName(t);
    return {
      values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
        if (tname === "ags_graph_correction_audit_events") {
          const rows = Array.isArray(vals) ? vals : [vals];
          for (const r of rows) {
            state.audits.push({
              proposalId: Number(r.proposalId),
              eventKind: String(r.eventKind),
              metadata: (r.metadata as Record<string, unknown> | null) ?? null,
            });
          }
        }
        return undefined;
      },
    };
  });

  return { db: { select, insert }, state };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyApprovedProposal — state guards", () => {
  it("throws AsdbUnavailableError when ASDB is null", async () => {
    await expect(
      applyApprovedProposal(
        { proposalId: 1 },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("throws ProposalNotFoundError when proposal id is unknown", async () => {
    const { db } = makeFakeDb([]);
    await expect(
      applyApprovedProposal(
        { proposalId: 99 },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(ProposalNotFoundError);
  });

  it("throws ProposalNotApprovedError when proposal is still pending", async () => {
    const { db } = makeFakeDb([
      {
        id: 5,
        status: "pending",
        proposedChange: {
          payload: { kind: "archive_node", typeKey: "X", nodeId: "n", reason: "r" },
        },
      },
    ]);
    await expect(
      applyApprovedProposal(
        { proposalId: 5 },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(ProposalNotApprovedError);
  });

  it("throws ProposalAlreadyAppliedError when a prior 'applied' audit exists", async () => {
    const { db } = makeFakeDb(
      [
        {
          id: 8,
          status: "approved",
          proposedChange: {
            payload: { kind: "archive_node", typeKey: "X", nodeId: "n", reason: "r" },
          },
        },
      ],
      [{ proposalId: 8, eventKind: "applied", metadata: null }],
    );
    await expect(
      applyApprovedProposal(
        { proposalId: 8 },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(ProposalAlreadyAppliedError);
  });

  it("throws InvalidProposalPayloadError when payload is missing", async () => {
    const { db } = makeFakeDb([
      {
        id: 9,
        status: "approved",
        proposedChange: { finding: { id: 1 } /* no payload */ },
      },
    ]);
    await expect(
      applyApprovedProposal(
        { proposalId: 9 },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(InvalidProposalPayloadError);
  });

  it("throws InvalidProposalPayloadError when proposedChange is null", async () => {
    const { db } = makeFakeDb([
      { id: 10, status: "approved", proposedChange: null },
    ]);
    await expect(
      applyApprovedProposal(
        { proposalId: 10 },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(InvalidProposalPayloadError);
  });
});

describe("applyApprovedProposal — dispatch + audit", () => {
  it("dispatches archive_node to the archive_node applier", async () => {
    const { db, state } = makeFakeDb([
      {
        id: 11,
        status: "approved",
        proposedChange: {
          payload: {
            kind: "archive_node",
            typeKey: "Note",
            nodeId: "n:1",
            reason: "test",
          },
        },
      },
    ]);
    const result = await applyApprovedProposal(
      { proposalId: 11 },
      { getDb: () => db as never },
    );
    expect(result.payloadKind).toBe("archive_node");
    expect(result.result.applied).toBe(true);
    expect(result.result.details).toMatchObject({ stub: true });

    const auditRow = state.audits.find((a) => a.eventKind === "applied");
    expect(auditRow).toBeDefined();
    expect(auditRow?.proposalId).toBe(11);
    expect(auditRow?.metadata).toMatchObject({ payloadKind: "archive_node" });
  });

  it("dispatches merge_into_canonical and writes the applied audit", async () => {
    const { db, state } = makeFakeDb([
      {
        id: 12,
        status: "approved",
        proposedChange: {
          payload: {
            kind: "merge_into_canonical",
            typeKey: "Entity",
            canonicalNodeId: "a",
            duplicateNodeId: "b",
            groupSize: 2,
          },
        },
      },
    ]);
    const result = await applyApprovedProposal(
      { proposalId: 12 },
      { getDb: () => db as never },
    );
    expect(result.payloadKind).toBe("merge_into_canonical");
    expect(state.audits.some((a) => a.eventKind === "applied")).toBe(true);
  });

  it("dispatches re_promote_with_source_version", async () => {
    const { db } = makeFakeDb([
      {
        id: 13,
        status: "approved",
        proposedChange: {
          payload: {
            kind: "re_promote_with_source_version",
            sourceTypeKey: "Note",
            sourceId: "doc-1",
            targetNodeId: "n:1",
          },
        },
      },
    ]);
    const result = await applyApprovedProposal(
      { proposalId: 13 },
      { getDb: () => db as never },
    );
    expect(result.payloadKind).toBe("re_promote_with_source_version");
    expect(result.result.applied).toBe(true);
  });

  it("dispatches manual_review and records apply_failed (applied=false by design)", async () => {
    const { db, state } = makeFakeDb([
      {
        id: 14,
        status: "approved",
        proposedChange: {
          payload: {
            kind: "manual_review",
            findingClass: "weird",
            note: "no applier",
          },
        },
      },
    ]);
    const result = await applyApprovedProposal(
      { proposalId: 14 },
      { getDb: () => db as never },
    );
    expect(result.result.applied).toBe(false);
    expect(state.audits.some((a) => a.eventKind === "apply_failed")).toBe(true);
  });

  it("records apply_failed when an applier throws", async () => {
    const throwingRegistry: ApplierRegistry = {
      ...DEFAULT_APPLIER_REGISTRY,
      archive_node: async () => {
        throw new Error("applier exploded");
      },
    };
    const { db, state } = makeFakeDb([
      {
        id: 15,
        status: "approved",
        proposedChange: {
          payload: {
            kind: "archive_node",
            typeKey: "X",
            nodeId: "n",
            reason: "r",
          },
        },
      },
    ]);
    const result = await applyApprovedProposal(
      { proposalId: 15 },
      { getDb: () => db as never, registry: throwingRegistry },
    );
    expect(result.result.applied).toBe(false);
    expect(result.result.reason).toMatch(/applier exploded/);
    expect(state.audits.some((a) => a.eventKind === "apply_failed")).toBe(true);
  });

  it("custom registry is used when supplied", async () => {
    const calls: string[] = [];
    const registry: ApplierRegistry = {
      ...DEFAULT_APPLIER_REGISTRY,
      archive_node: async (p) => {
        calls.push("archive_node:" + p.nodeId);
        return { applied: true, details: { custom: true } };
      },
    };
    const { db } = makeFakeDb([
      {
        id: 16,
        status: "approved",
        proposedChange: {
          payload: {
            kind: "archive_node",
            typeKey: "X",
            nodeId: "abc",
            reason: "r",
          },
        },
      },
    ]);
    await applyApprovedProposal(
      { proposalId: 16 },
      { getDb: () => db as never, registry },
    );
    expect(calls).toEqual(["archive_node:abc"]);
  });
});
