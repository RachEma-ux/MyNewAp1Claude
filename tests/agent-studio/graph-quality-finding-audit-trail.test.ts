/**
 * Phase 23 §1 — single-finding audit trail.
 *
 * Verifies the walk: finding → proposal → audit events.
 */

import { describe, it, expect, vi } from "vitest";
import { getFindingAuditTrail } from "../../server/agent-studio/services/graph-quality/finding-audit-trail";

interface SeededFinding {
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

interface SeededProposal {
  id: number;
  proposalKind: string;
  status: string;
  confidence: string | null;
  rationale: string | null;
  proposedByUserId: number | null;
  proposedByAgentId: number | null;
  createdAt: Date;
}

interface SeededAudit {
  id: number;
  proposalId: number;
  eventKind: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

function makeFakeDb({
  findings = [],
  proposals = [],
  audits = [],
}: {
  findings?: SeededFinding[];
  proposals?: SeededProposal[];
  audits?: SeededAudit[];
} = {}) {
  const tableName = (t: unknown): string => {
    const sym = Object.getOwnPropertySymbols(t as object).find(
      (s) => s.description === "drizzle:Name",
    );
    return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
  };

  const select = vi.fn(() => ({
    from: (t: unknown) => {
      const tname = tableName(t);
      return {
        where: (_w: unknown) => ({
          limit: async (_n: number) => {
            if (tname === "ags_graph_quality_findings") return findings;
            if (tname === "ags_graph_correction_proposals") return proposals;
            return [];
          },
          orderBy: (_o: unknown) =>
            (async () => audits)() as unknown as Promise<unknown[]>,
          then: (resolve: (rows: unknown[]) => void) => {
            // The audit-events chain doesn't call .limit; only .orderBy
            // which returns a thenable. Make .where().then work too as a fallback.
            if (tname === "ags_graph_correction_audit_events") resolve(audits);
            else if (tname === "ags_graph_quality_findings") resolve(findings);
            else if (tname === "ags_graph_correction_proposals") resolve(proposals);
            else resolve([]);
          },
        }),
      };
    },
  }));

  return { db: { select } };
}

describe("getFindingAuditTrail", () => {
  it("returns null when ASDB is unavailable", async () => {
    const result = await getFindingAuditTrail(1, { getDb: () => null as never });
    expect(result).toBeNull();
  });

  it("returns null when the finding id is unknown", async () => {
    const { db } = makeFakeDb({});
    const result = await getFindingAuditTrail(99, { getDb: () => db as never });
    expect(result).toBeNull();
  });

  it("returns the finding alone when no proposal is linked", async () => {
    const finding: SeededFinding = {
      id: 5,
      scanId: 1,
      findingClass: "orphan_node",
      severity: "medium",
      sourceTypeKey: "Note",
      sourceId: "n:1",
      details: null,
      proposalId: null,
      createdAt: new Date(),
    };
    const { db } = makeFakeDb({ findings: [finding] });
    const result = await getFindingAuditTrail(5, { getDb: () => db as never });
    expect(result).not.toBeNull();
    expect(result!.finding.id).toBe(5);
    expect(result!.proposal).toBeNull();
    expect(result!.auditEvents).toEqual([]);
    expect(result!.state).toEqual({
      hasProposal: false,
      isApplied: false,
      hasApplyFailed: false,
      currentProposalStatus: null,
    });
  });

  it("walks finding → proposal → audit events when linked", async () => {
    const finding: SeededFinding = {
      id: 7,
      scanId: 2,
      findingClass: "duplicate_entity",
      severity: "high",
      sourceTypeKey: "Entity",
      sourceId: "src-1",
      details: null,
      proposalId: 42,
      createdAt: new Date(),
    };
    const proposal: SeededProposal = {
      id: 42,
      proposalKind: "merge_duplicate_entities",
      status: "approved",
      confidence: "0.80",
      rationale: "Auto-generated",
      proposedByUserId: 1,
      proposedByAgentId: null,
      createdAt: new Date(),
    };
    const audits: SeededAudit[] = [
      {
        id: 100,
        proposalId: 42,
        eventKind: "applied",
        metadata: { payloadKind: "merge_into_canonical" },
        createdAt: new Date(),
      },
      {
        id: 99,
        proposalId: 42,
        eventKind: "approved",
        metadata: { decidedByUserId: 1 },
        createdAt: new Date(),
      },
      {
        id: 98,
        proposalId: 42,
        eventKind: "submitted",
        metadata: null,
        createdAt: new Date(),
      },
    ];
    const { db } = makeFakeDb({
      findings: [finding],
      proposals: [proposal],
      audits,
    });
    const result = await getFindingAuditTrail(7, { getDb: () => db as never });
    expect(result).not.toBeNull();
    expect(result!.finding.id).toBe(7);
    expect(result!.proposal?.id).toBe(42);
    expect(result!.auditEvents).toHaveLength(3);
    expect(result!.state).toEqual({
      hasProposal: true,
      isApplied: true,
      hasApplyFailed: false,
      currentProposalStatus: "approved",
    });
  });

  it("flags hasApplyFailed when an apply_failed audit row is present", async () => {
    const finding: SeededFinding = {
      id: 8,
      scanId: 1,
      findingClass: "stale_node",
      severity: "medium",
      sourceTypeKey: "Note",
      sourceId: "doc-1",
      details: null,
      proposalId: 50,
      createdAt: new Date(),
    };
    const proposal: SeededProposal = {
      id: 50,
      proposalKind: "re_promote_with_source_version",
      status: "approved",
      confidence: null,
      rationale: null,
      proposedByUserId: null,
      proposedByAgentId: null,
      createdAt: new Date(),
    };
    const audits: SeededAudit[] = [
      {
        id: 200,
        proposalId: 50,
        eventKind: "apply_failed",
        metadata: { reason: "applier exploded" },
        createdAt: new Date(),
      },
    ];
    const { db } = makeFakeDb({
      findings: [finding],
      proposals: [proposal],
      audits,
    });
    const result = await getFindingAuditTrail(8, { getDb: () => db as never });
    expect(result!.state.hasApplyFailed).toBe(true);
    expect(result!.state.isApplied).toBe(false);
  });

  it("returns proposal=null when proposal_id is set but the row is missing (defensive)", async () => {
    const finding: SeededFinding = {
      id: 9,
      scanId: 1,
      findingClass: "orphan_node",
      severity: "medium",
      sourceTypeKey: null,
      sourceId: null,
      details: null,
      proposalId: 999, // not in seeded proposals
      createdAt: new Date(),
    };
    const { db } = makeFakeDb({ findings: [finding] });
    const result = await getFindingAuditTrail(9, { getDb: () => db as never });
    expect(result).not.toBeNull();
    expect(result!.proposal).toBeNull();
    expect(result!.auditEvents).toEqual([]);
    expect(result!.state.hasProposal).toBe(false);
  });
});
