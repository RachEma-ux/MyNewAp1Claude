/**
 * T-D.3.γ — semanticEnrichment rejection telemetry.
 *
 * Optional follow-up to T-D.3.β (recent-runs + per-run drill-in).
 * Flattens below-threshold rejections across the most-recent N
 * runs, grouped by `(runId, proposalKind)` — actionable signal for
 * confidence-threshold tuning + per-kind proposer improvement.
 *
 * Mirrors `securityGraph.listRecentRejectionsByReason` (T-G.3.ε)
 * row shape — source-of-record context attached at read-time
 * (here: runId + runStartedAt; there: ingestionId + sourceKey).
 */

import { describe, it, expect } from "vitest";

import {
  semanticEnrichmentRouter,
  SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_RUN_LIMIT,
  SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_ROW_LIMIT,
  SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_RUN_LIMIT,
  SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_ROW_LIMIT,
  type ListSemanticEnrichmentRecentRejectionsEnvelope,
} from "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-router";

describe("T-D.3.γ — semanticEnrichmentRouter.listRecentRejectionsByKind shape", () => {
  it("router exposes listRecentRejectionsByKind procedure", () => {
    const procedures = (semanticEnrichmentRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listRecentRejectionsByKind");
    // Prior α + β procedures still present (regression check).
    expect(keys).toContain("listKnownProposalKinds");
    expect(keys).toContain("listRecentRuns");
    expect(keys).toContain("getRunStats");
    expect(keys).toContain("listProposals");
  });

  it("default + absolute limit constants are sane", () => {
    expect(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_RUN_LIMIT).toBe(20);
    expect(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_ROW_LIMIT).toBe(100);
    expect(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_RUN_LIMIT).toBe(200);
    expect(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_ROW_LIMIT).toBe(500);
    expect(
      SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_RUN_LIMIT,
    ).toBeLessThan(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_RUN_LIMIT);
    expect(
      SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_ROW_LIMIT,
    ).toBeLessThan(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_ROW_LIMIT);
  });

  it("envelope wraps a rejection-row array with run context", () => {
    const env: ListSemanticEnrichmentRecentRejectionsEnvelope = {
      rejections: [
        {
          runId: 9,
          proposalKind: "missing_property_fill",
          count: 14,
          runStartedAt: new Date("2026-05-17T13:00:00Z"),
        },
        {
          runId: 9,
          proposalKind: "stale_fact_refresh",
          count: 3,
          runStartedAt: new Date("2026-05-17T13:00:00Z"),
        },
        {
          runId: 8,
          proposalKind: "description_enrichment",
          count: 7,
          runStartedAt: new Date("2026-05-17T12:00:00Z"),
        },
      ],
    };
    expect(env.rejections.length).toBe(3);
    // Same run-id, multiple kinds — proposer-improvement target.
    expect(env.rejections[0]!.runId).toBe(9);
    expect(env.rejections[1]!.runId).toBe(9);
    expect(env.rejections[0]!.proposalKind).toBe("missing_property_fill");
    expect(env.rejections[0]!.count).toBe(14);
    // Older run preserved with its own context.
    expect(env.rejections[2]!.runId).toBe(8);
    expect(env.rejections[2]!.proposalKind).toBe("description_enrichment");
  });
});
