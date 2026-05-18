/**
 * T-D.3.δ-followup α — Candidate-contract discriminated-union extension.
 *
 * Tests pin:
 *   - The 4-value closed taxonomy of `targetKind` values
 *   - All 4 variant interfaces are exported from the barrel
 *   - The existing 2 selectors (`description_enrichment`,
 *     `missing_property_fill`) now produce `targetKind: "node"`
 *   - The 3 deferred selectors still return empty + record the
 *     contract reference in source (doc-block lockstep)
 *   - Predicate `isSemanticEnrichmentCandidateTargetKind` correctly
 *     narrows
 *
 * No new selector behavior ships in this slice — the contract
 * extension is the foundation for the β/γ/δ per-kind selector PRs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

import {
  SEMANTIC_ENRICHMENT_CANDIDATE_TARGET_KINDS,
  isSemanticEnrichmentCandidateTargetKind,
  type SemanticEnrichmentCandidate,
  type SemanticEnrichmentCandidateTargetKind,
  type SemanticEnrichmentEdgeCandidate,
  type SemanticEnrichmentEntityCandidate,
  type SemanticEnrichmentNodeCandidate,
  type SemanticEnrichmentNodePropertyCandidate,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment",
);

function readFile(p: string): string {
  return readFileSync(p, "utf8");
}

// ────────────────────────────────────────────────────────────────────
// Closed taxonomy
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup α — closed targetKind taxonomy", () => {
  it("enumerates exactly the 4 variants in canonical order", () => {
    expect([...SEMANTIC_ENRICHMENT_CANDIDATE_TARGET_KINDS]).toEqual([
      "node",
      "node_property",
      "entity",
      "edge",
    ]);
  });

  it("predicate accepts each canonical value", () => {
    for (const k of SEMANTIC_ENRICHMENT_CANDIDATE_TARGET_KINDS) {
      expect(isSemanticEnrichmentCandidateTargetKind(k)).toBe(true);
    }
  });

  it("predicate rejects unrelated strings + non-strings", () => {
    expect(isSemanticEnrichmentCandidateTargetKind("nodes")).toBe(false);
    expect(isSemanticEnrichmentCandidateTargetKind("vertex")).toBe(false);
    expect(isSemanticEnrichmentCandidateTargetKind("")).toBe(false);
    expect(isSemanticEnrichmentCandidateTargetKind(null)).toBe(false);
    expect(isSemanticEnrichmentCandidateTargetKind(undefined)).toBe(false);
    expect(isSemanticEnrichmentCandidateTargetKind(42)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Type-level discrimination (compile-time check via type assertions)
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup α — discriminated union narrowing", () => {
  it("node variant has no extra fields beyond the base", () => {
    const c: SemanticEnrichmentNodeCandidate = {
      targetKind: "node",
      targetTypeKey: "service",
      targetId: 1,
      proposalKind: "description_enrichment",
    };
    expect(c.targetKind).toBe("node");
  });

  it("node_property variant carries propertyKey", () => {
    const c: SemanticEnrichmentNodePropertyCandidate = {
      targetKind: "node_property",
      targetTypeKey: "service",
      targetId: 1,
      propertyKey: "owner",
      proposalKind: "stale_fact_refresh",
    };
    expect(c.propertyKey).toBe("owner");
  });

  it("entity variant uses entity row id", () => {
    const c: SemanticEnrichmentEntityCandidate = {
      targetKind: "entity",
      targetTypeKey: "person",
      targetId: 99,
      proposalKind: "entity_disambiguation",
    };
    expect(c.targetKind).toBe("entity");
  });

  it("edge variant uses edge row id", () => {
    const c: SemanticEnrichmentEdgeCandidate = {
      targetKind: "edge",
      targetTypeKey: "RELATED_TO",
      targetId: 7,
      proposalKind: "relationship_label_repair",
    };
    expect(c.targetKind).toBe("edge");
  });

  it("discriminator narrows the union to a single variant in a switch", () => {
    function describeCandidate(c: SemanticEnrichmentCandidate): string {
      switch (c.targetKind) {
        case "node":
          return `node:${c.targetTypeKey}/${c.targetId}`;
        case "node_property":
          return `node_property:${c.targetTypeKey}/${c.targetId}#${c.propertyKey}`;
        case "entity":
          return `entity:${c.targetTypeKey}/${c.targetId}`;
        case "edge":
          return `edge:${c.targetTypeKey}/${c.targetId}`;
      }
    }
    expect(
      describeCandidate({
        targetKind: "node_property",
        targetTypeKey: "service",
        targetId: 1,
        propertyKey: "owner",
        proposalKind: "stale_fact_refresh",
      }),
    ).toBe("node_property:service/1#owner");
  });
});

// ────────────────────────────────────────────────────────────────────
// Per-kind ↔ targetKind mapping (source-level lockstep)
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup α — per-variant proposalKind constraint", () => {
  /**
   * The runtime kinds aren't constrained inside the discriminated
   * union (every variant accepts every proposalKind to keep the
   * runtime contract permissive); the constraint lives in the agent
   * documentation + the selectors themselves. This test pins the
   * intended pairing at the doc-block level so a future contributor
   * adding a selector knows what targetKind to emit.
   */
  it("agent doc-block names the 1:1 targetKind ↔ proposalKind pairing", () => {
    const src = readFile(join(DIR, "semantic-enrichment-agent.ts"));
    expect(src).toMatch(/"node_property"[\s\S]*?stale_fact_refresh/);
    expect(src).toMatch(/"entity"[\s\S]*?entity_disambiguation/);
    expect(src).toMatch(/"edge"[\s\S]*?relationship_label_repair/);
  });

  it("selector doc-block names the contract-extension landing", () => {
    const src = readFile(join(DIR, "semantic-enrichment-candidate-selector.ts"));
    expect(src).toMatch(/T-D\.3\.δ-followup α/);
    // Allow either "discriminated union" or "discriminated-union" so
    // β can refine wording without coupling.
    expect(src).toMatch(/discriminated[\s-]union/);
    expect(src).toMatch(/"node_property"/);
    expect(src).toMatch(/"entity"/);
    expect(src).toMatch(/"edge"/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Existing selector candidate-shape regression
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup α — existing 2 selectors emit targetKind=\"node\"", () => {
  /**
   * Source-level regression: every `targetKind:` literal currently
   * inside the candidate-selector must be `"node"` (the only variant
   * the SQL paths produce today). When β/γ/δ land, those PRs add
   * `"entity"` / `"edge"` / `"node_property"` literals — at which
   * point this assertion's allowed-set widens.
   */
  it("candidate-selector targetKind literals are within the wired allow-set", () => {
    // Allow-set widens as per-kind selectors land:
    //   T-D.3.δ-followup α (this file)  → only "node"
    //   T-D.3.δ-followup β              → adds "entity"
    //   T-D.3.δ-followup γ              → adds "edge"
    //   T-D.3.δ-followup δ              → adds "node_property"
    // Each follow-up PR widens this set + adds its own selector test.
    const ALLOWED: ReadonlyArray<string> = ["node", "entity"];
    const src = readFile(join(DIR, "semantic-enrichment-candidate-selector.ts"));
    const allLiterals = [
      ...src.matchAll(/targetKind:\s*"([^"]+)"\s*as\s*const/g),
    ].map((m) => m[1]);
    expect(allLiterals.length).toBeGreaterThan(0);
    for (const k of allLiterals) {
      expect(ALLOWED).toContain(k);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// Variant type-key constraint type assertion (compile-time)
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup α — barrel re-exports", () => {
  it("public-api re-exports the 4 variant types + taxonomy array + predicate", () => {
    const src = readFile(join(DIR, "public-api.ts"));
    for (const sym of [
      "SemanticEnrichmentCandidateBase",
      "SemanticEnrichmentCandidateTargetKind",
      "SemanticEnrichmentNodeCandidate",
      "SemanticEnrichmentNodePropertyCandidate",
      "SemanticEnrichmentEntityCandidate",
      "SemanticEnrichmentEdgeCandidate",
      "SEMANTIC_ENRICHMENT_CANDIDATE_TARGET_KINDS",
      "isSemanticEnrichmentCandidateTargetKind",
    ]) {
      expect(src, `barrel must re-export ${sym}`).toMatch(
        new RegExp(`\\b${sym}\\b`),
      );
    }
  });

  // Tautological assertion that proves the static type alias is the
  // 4-literal union (catches accidental widening at compile-time).
  it("SemanticEnrichmentCandidateTargetKind is exactly the 4-literal union", () => {
    type Expected = "node" | "node_property" | "entity" | "edge";
    type AssertExact = SemanticEnrichmentCandidateTargetKind extends Expected
      ? Expected extends SemanticEnrichmentCandidateTargetKind
        ? true
        : false
      : false;
    const proof: AssertExact = true;
    expect(proof).toBe(true);
  });
});
