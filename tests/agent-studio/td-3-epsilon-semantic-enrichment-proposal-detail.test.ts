/**
 * T-D.3.ε — Semantic Enrichment proposal detail surface.
 *
 * Closes the §22 "DEFERRED — proposal detail surface" item. The
 * T-D.3.β list view (`listProposals`) intentionally omits the
 * heavy `payload` + `sourceEvidence` JSON for over-fetch avoidance
 * per the §22 carry-forward lesson #4. This slice ships the
 * complementary detail surface for the per-proposal triage drill-in.
 *
 * Mirrors `securityGraph.getIngestionStats` / `goldenQuestions.getRunStats`
 * discriminated envelope pattern — stale-link safety since proposals
 * can be retention-pruned per the existing approval-lifecycle
 * retention chain.
 */

import { describe, it, expect } from "vitest";

import {
  semanticEnrichmentRouter,
  type GetSemanticEnrichmentProposalDetailEnvelope,
} from "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-router";
import type { SemanticEnrichmentProposalDetail } from "../../server/agent-studio/services/graph-enrichment/public-api";

describe("T-D.3.ε — semanticEnrichmentRouter.getProposalDetail shape", () => {
  it("router exposes getProposalDetail (plus α/β/γ procedures)", () => {
    const procedures = (semanticEnrichmentRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("getProposalDetail");
    // α/β/γ procedures preserved (regression check).
    expect(keys).toContain("listKnownProposalKinds");
    expect(keys).toContain("listRecentRuns");
    expect(keys).toContain("getRunStats");
    expect(keys).toContain("listProposals");
    expect(keys).toContain("listRecentRejectionsByKind");
  });

  it("envelope discriminates ok / not_found", () => {
    const ok: GetSemanticEnrichmentProposalDetailEnvelope = {
      status: "ok",
      proposalId: 101,
      proposal: {
        id: 101,
        runId: 7,
        proposalKind: "description_enrichment",
        targetTypeKey: "person",
        targetId: 42,
        confidence: "0.92",
        status: "pending",
        payload: {
          proposedChange: { description: "Long-form rewrite text" },
          rationale: "Source note v17 supersedes prior empty description",
        },
        sourceEvidence: {
          citations: [
            {
              noteId: 99,
              noteVersionId: 17,
              excerpt: "Person bio paragraph",
            },
          ],
        },
        createdAt: new Date("2026-05-18T12:00:00Z"),
      } satisfies SemanticEnrichmentProposalDetail,
    };
    expect(ok.status).toBe("ok");
    expect(ok.proposal!.id).toBe(101);
    // Heavy JSON IS present in the detail view (the whole point
    // of this slice vs the list view which strips it).
    expect(ok.proposal!.payload).toBeDefined();
    expect(ok.proposal!.sourceEvidence).toBeDefined();
    expect(
      (ok.proposal!.payload as { rationale: string }).rationale,
    ).toMatch(/supersedes/);

    const notFound: GetSemanticEnrichmentProposalDetailEnvelope = {
      status: "not_found",
      proposalId: 9999,
    };
    expect(notFound.status).toBe("not_found");
    expect(notFound.proposal).toBeUndefined();
  });

  it("detail row carries fields list row omits (payload + sourceEvidence)", () => {
    // The whole point of this slice: list-rows-strip-heavy-JSON
    // (§22 lesson #4); detail-rows include the heavy JSON for
    // operator triage. Surface this invariant explicitly.
    const detail: SemanticEnrichmentProposalDetail = {
      id: 1,
      runId: 1,
      proposalKind: "missing_property_fill",
      targetTypeKey: "system",
      targetId: 9,
      confidence: "0.85",
      status: "pending",
      payload: { proposedChange: { owner: "team-platform" } },
      sourceEvidence: { citations: [] },
      createdAt: new Date(),
    };
    expect("payload" in detail).toBe(true);
    expect("sourceEvidence" in detail).toBe(true);
    expect(detail.payload).not.toBeNull();
  });
});
