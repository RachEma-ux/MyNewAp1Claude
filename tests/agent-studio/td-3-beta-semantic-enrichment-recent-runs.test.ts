/**
 * T-D.3.β — Semantic Enrichment recent-runs + per-run drill-in.
 *
 * Extends the T-D.3.α router with three operator-facing read
 * procedures backed by new `SemanticEnrichmentStore` read methods:
 *
 *   - `listRecentRuns` — newest-first list of recent enrichment runs
 *   - `getRunStats` — per-run proposal counts (kind + status)
 *   - `listProposals` — paged proposals for one run, optional status
 *     filter
 *
 * The store gains three new methods (`listRecentRuns`, `getRunStats`,
 * `listProposals`) — previously the store was write-only, so the
 * operator dashboard could not surface per-run views without a
 * client-side re-implementation.
 */

import { describe, it, expect } from "vitest";

import {
  semanticEnrichmentRouter,
  SEMANTIC_ENRICHMENT_LIST_RUNS_DEFAULT_LIMIT,
  SEMANTIC_ENRICHMENT_LIST_RUNS_ABSOLUTE_LIMIT,
  SEMANTIC_ENRICHMENT_LIST_PROPOSALS_DEFAULT_LIMIT,
  SEMANTIC_ENRICHMENT_LIST_PROPOSALS_ABSOLUTE_LIMIT,
  type ListSemanticEnrichmentRecentRunsEnvelope,
  type GetSemanticEnrichmentRunStatsEnvelope,
  type ListSemanticEnrichmentProposalsEnvelope,
} from "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-router";
import type {
  SemanticEnrichmentRunListRow,
  SemanticEnrichmentProposalListRow,
  SemanticEnrichmentRunStats,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

describe("T-D.3.β — semanticEnrichmentRouter recent-runs + drill-in shape", () => {
  it("router exposes listRecentRuns + getRunStats + listProposals (plus α procedure)", () => {
    const procedures = (semanticEnrichmentRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listRecentRuns");
    expect(keys).toContain("getRunStats");
    expect(keys).toContain("listProposals");
    // α procedure preserved (regression check).
    expect(keys).toContain("listKnownProposalKinds");
  });

  it("default + absolute limit constants are sane", () => {
    expect(SEMANTIC_ENRICHMENT_LIST_RUNS_DEFAULT_LIMIT).toBe(50);
    expect(SEMANTIC_ENRICHMENT_LIST_RUNS_ABSOLUTE_LIMIT).toBe(200);
    expect(SEMANTIC_ENRICHMENT_LIST_PROPOSALS_DEFAULT_LIMIT).toBe(100);
    expect(SEMANTIC_ENRICHMENT_LIST_PROPOSALS_ABSOLUTE_LIMIT).toBe(500);
    expect(SEMANTIC_ENRICHMENT_LIST_RUNS_DEFAULT_LIMIT).toBeLessThan(
      SEMANTIC_ENRICHMENT_LIST_RUNS_ABSOLUTE_LIMIT,
    );
    expect(SEMANTIC_ENRICHMENT_LIST_PROPOSALS_DEFAULT_LIMIT).toBeLessThan(
      SEMANTIC_ENRICHMENT_LIST_PROPOSALS_ABSOLUTE_LIMIT,
    );
  });

  it("listRecentRuns envelope wraps a run-row array", () => {
    const runs: ReadonlyArray<SemanticEnrichmentRunListRow> = [
      {
        id: 7,
        agentKey: "semantic_enrichment_agent",
        status: "completed",
        proposalsCreated: 12,
        startedAt: new Date("2026-05-17T11:00:00Z"),
        completedAt: new Date("2026-05-17T11:05:00Z"),
        createdAt: new Date("2026-05-17T11:00:00Z"),
      },
    ];
    const env: ListSemanticEnrichmentRecentRunsEnvelope = { runs };
    expect(env.runs.length).toBe(1);
    expect(env.runs[0]!.status).toBe("completed");
    expect(env.runs[0]!.proposalsCreated).toBe(12);
  });

  it("getRunStats envelope discriminates ok / not_found", () => {
    const ok: GetSemanticEnrichmentRunStatsEnvelope = {
      status: "ok",
      stats: {
        runId: 7,
        proposalCount: 12,
        proposalsByKind: [
          { proposalKind: "description_enrichment", count: 8 },
          { proposalKind: "missing_property_fill", count: 4 },
        ],
        proposalsByStatus: [
          { status: "pending", count: 9 },
          { status: "rejected_below_threshold", count: 3 },
        ],
      } satisfies SemanticEnrichmentRunStats,
    };
    expect(ok.status).toBe("ok");
    expect(ok.stats!.proposalCount).toBe(12);
    expect(ok.stats!.proposalsByKind[0]!.proposalKind).toBe(
      "description_enrichment",
    );

    const notFound: GetSemanticEnrichmentRunStatsEnvelope = {
      status: "not_found",
    };
    expect(notFound.status).toBe("not_found");
    expect(notFound.stats).toBeUndefined();
  });

  it("listProposals envelope wraps a proposal-row array (kind+status+confidence+ts)", () => {
    const proposals: ReadonlyArray<SemanticEnrichmentProposalListRow> = [
      {
        id: 101,
        runId: 7,
        proposalKind: "description_enrichment",
        targetTypeKey: "person",
        targetId: 42,
        confidence: "0.92",
        status: "pending",
        createdAt: new Date("2026-05-17T11:01:00Z"),
      },
      {
        id: 102,
        runId: 7,
        proposalKind: "missing_property_fill",
        targetTypeKey: "system",
        targetId: 9,
        confidence: "0.55",
        status: "rejected_below_threshold",
        createdAt: new Date("2026-05-17T11:01:30Z"),
      },
    ];
    const env: ListSemanticEnrichmentProposalsEnvelope = { proposals };
    expect(env.proposals.length).toBe(2);
    expect(env.proposals[0]!.status).toBe("pending");
    expect(env.proposals[1]!.status).toBe("rejected_below_threshold");
    // Heavy JSON (payload + sourceEvidence) is intentionally NOT on
    // the list row — detail surfaces re-read with full JSON.
    expect("payload" in env.proposals[0]!).toBe(false);
    expect("sourceEvidence" in env.proposals[0]!).toBe(false);
  });
});
