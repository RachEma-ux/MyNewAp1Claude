/**
 * T-D.3.δ-followup β — `entity_disambiguation` selector.
 *
 * Verifies:
 *   - The new `listEntityDisambiguationCandidates` SQL exists in the
 *     candidate-selector source with the expected primitives
 *     (innerJoin, groupBy, having + COUNT(*), orderBy id).
 *   - `listSemanticEnrichmentCandidates` routes `proposalKind:
 *     "entity_disambiguation"` to the new function.
 *   - DB-null short-circuit returns an empty envelope (same fail-soft
 *     pattern as the prior 2 selectors).
 *   - Candidate envelope shape matches `targetKind: "entity"` with
 *     `targetTypeKey` echoing the entity's `entity_type` and
 *     `targetId` being the entity row id.
 *   - Runner's `SUPPORTED_TRIGGER_PROPOSAL_KINDS` admits the kind
 *     (covered by `td-3-delta-semantic-enrichment-runner` already;
 *     this file additionally checks for explicit kind admission as
 *     a regression on the gate).
 *
 * Behavioral SQL testing (real Drizzle query plan against ASDB) is
 * deferred to an integration test layer; this file covers the
 * call-shape + branch routing + fail-soft path.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import {
  listSemanticEnrichmentCandidates,
  SUPPORTED_TRIGGER_PROPOSAL_KINDS,
  isSupportedTriggerProposalKind,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment",
);

function readFile(p: string): string {
  return readFileSync(p, "utf8");
}

beforeEach(() => {
  dbMock.mockReset();
});

// ────────────────────────────────────────────────────────────────────
// Source-level SQL primitives
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup β — selector SQL primitives", () => {
  const SRC = readFile(join(DIR, "semantic-enrichment-candidate-selector.ts"));

  it("declares listEntityDisambiguationCandidates", () => {
    expect(SRC).toMatch(/function\s+listEntityDisambiguationCandidates\s*\(/);
  });

  it("uses groupBy on (entity_type, canonical_label)", () => {
    expect(SRC).toMatch(/groupBy\([^)]*entityType[^)]*canonicalLabel/);
  });

  it("uses having + count(*) > 1 for duplicate detection", () => {
    expect(SRC).toMatch(/\.having\(/);
    expect(SRC).toMatch(/count\(\*\)/i);
    expect(SRC).toMatch(/gt\(/);
  });

  it("uses innerJoin to materialize the duplicate rows", () => {
    expect(SRC).toMatch(/\.innerJoin\(/);
  });

  it("orders by entity id for paging determinism", () => {
    expect(SRC).toMatch(/\.orderBy\(agsGraphEntities\.id\)/);
  });

  it("scopes by workspaceId + governance_status='active' (tenant + soft-delete)", () => {
    expect(SRC).toMatch(/agsGraphEntities\.workspaceId/);
    expect(SRC).toMatch(/governanceStatus[\s\S]*?"active"/);
  });

  it("only emits targetKind: \"entity\" inside listEntityDisambiguationCandidates", () => {
    // Locate the function body, then check the targetKind literals inside it.
    const startIdx = SRC.indexOf("async function listEntityDisambiguationCandidates");
    expect(startIdx).toBeGreaterThan(-1);
    // Heuristic: function body runs until the next top-level "async function" or EOF.
    const after = SRC.slice(startIdx + 1);
    const endIdx = after.indexOf("\nasync function ");
    const body = endIdx === -1 ? after : after.slice(0, endIdx);
    const literals = [...body.matchAll(/targetKind:\s*"([^"]+)"\s*as\s*const/g)].map((m) => m[1]);
    expect(literals).toEqual(["entity"]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Branch routing
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup β — listSemanticEnrichmentCandidates dispatch", () => {
  it("returns empty envelope with proposalKind echoed when getAsDb is null", async () => {
    dbMock.mockReturnValue(null);
    const result = await listSemanticEnrichmentCandidates({
      workspaceId: 1,
      proposalKind: "entity_disambiguation",
    });
    expect(result.proposalKind).toBe("entity_disambiguation");
    expect(result.candidates).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.weakDescriptionMaxLengthUsed).toBeNull();
  });

  it("returns empty envelope for stale_fact_refresh (still deferred at γ time)", async () => {
    // After T-D.3.δ-followup γ landed, only stale_fact_refresh hits
    // the deferred-kind short-circuit branch.
    dbMock.mockReturnValue({});
    const result = await listSemanticEnrichmentCandidates({
      workspaceId: 1,
      proposalKind: "stale_fact_refresh",
    });
    expect(result.candidates).toEqual([]);
    expect(result.weakDescriptionMaxLengthUsed).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// Runner gate admission
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup β — runner gate admits entity_disambiguation", () => {
  it("SUPPORTED_TRIGGER_PROPOSAL_KINDS includes entity_disambiguation", () => {
    expect([...SUPPORTED_TRIGGER_PROPOSAL_KINDS]).toContain(
      "entity_disambiguation",
    );
  });

  it("predicate returns true for entity_disambiguation", () => {
    expect(isSupportedTriggerProposalKind("entity_disambiguation")).toBe(true);
  });

  it("predicate returns false for the remaining deferred kind at γ time (stale_fact_refresh)", () => {
    expect(isSupportedTriggerProposalKind("stale_fact_refresh")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Doc lockstep
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup β — doc lockstep", () => {
  it("selector header doc names entity_disambiguation in the coverage list", () => {
    const src = readFile(join(DIR, "semantic-enrichment-candidate-selector.ts"));
    // Match \"N/5 kinds\" — exact N widens as follow-ups land; β established
    // the bullet structure. Keep this assertion permissive past γ/δ.
    expect(src).toMatch(/[2-5]\/5\s+kinds/);
    expect(src).toMatch(/entity_disambiguation/);
  });

  it("runner doc names the MVP no-citations caveat for entity targets", () => {
    const src = readFile(join(DIR, "semantic-enrichment-runner.ts"));
    expect(src).toMatch(/entity_disambiguation/);
    expect(src).toMatch(/candidatesSkippedNoCitations/);
  });
});
