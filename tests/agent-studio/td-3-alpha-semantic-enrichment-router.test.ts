/**
 * T-D.3.α — Semantic Enrichment tRPC router (read-only enumeration).
 *
 * Mounts the operator-facing surface for the Semantic Enrichment
 * Agent. Contracts (T-D.3 closed taxonomy) + agent runtime + store
 * + proposer + evidence-collector all shipped; this slice adds the
 * tRPC mount so the operator dashboard can populate the
 * proposal-kind picker.
 *
 * Recent-runs + per-run drill-in deferred to T-D.3.β — needs ASDB
 * read methods on the store (currently write-only).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  semanticEnrichmentRouter,
  type ListSemanticEnrichmentProposalKindsEnvelope,
} from "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-router";
import {
  SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA,
  SEMANTIC_ENRICHMENT_PROPOSAL_KINDS,
} from "../../server/agent-studio/services/graph-enrichment/contracts";

describe("T-D.3.α — semanticEnrichmentRouter shape", () => {
  it("exports listKnownProposalKinds procedure", () => {
    const procedures = (semanticEnrichmentRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listKnownProposalKinds");
  });

  it("listKnownProposalKinds envelope passes through the 5 closed-taxonomy kinds", () => {
    expect(SEMANTIC_ENRICHMENT_PROPOSAL_KINDS.length).toBe(5);
    const env: ListSemanticEnrichmentProposalKindsEnvelope = {
      kinds: SEMANTIC_ENRICHMENT_PROPOSAL_KINDS,
      metadata: SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA,
    };
    const kindSet = new Set(env.kinds);
    expect(kindSet.size).toBe(5);
    // Spot-check anchors against silent enum drift — these are the 5
    // kinds from semantic-enrichment-contracts.ts T-D.3.
    expect(kindSet.has("description_enrichment" as never)).toBe(true);
    expect(kindSet.has("missing_property_fill" as never)).toBe(true);
    expect(kindSet.has("stale_fact_refresh" as never)).toBe(true);
    expect(kindSet.has("entity_disambiguation" as never)).toBe(true);
    expect(kindSet.has("relationship_label_repair" as never)).toBe(true);
  });

  it("metadata carries label + description + requiresSourceCitation per kind", () => {
    for (const kind of SEMANTIC_ENRICHMENT_PROPOSAL_KINDS) {
      const meta = SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA[kind];
      expect(meta).toBeDefined();
      expect(meta.key).toBe(kind);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      // All 5 current kinds require source citations — the field is
      // part of the contract so future cite-less kinds can be added
      // without a flag-day cutover.
      expect(meta.requiresSourceCitation).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — mount drift guard.
// ──────────────────────────────────────────────────────────────────

describe("T-D.3.α source-scan — semanticEnrichment router is mounted", () => {
  it("api/router.ts imports semanticEnrichmentRouter and mounts it at `semanticEnrichment`", () => {
    const file = readFileSync(
      resolve(__dirname, "../../server/agent-studio/api/router.ts"),
      "utf-8",
    );
    expect(file).toContain(
      'import { semanticEnrichmentRouter } from "../services/graph-enrichment/semantic-enrichment-router"',
    );
    expect(file).toMatch(/semanticEnrichment:\s*semanticEnrichmentRouter,/);
  });
});
