/**
 * T-D.3.δ-followup γ — `relationship_label_repair` selector.
 *
 * Verifies:
 *   - `GENERIC_EDGE_TYPE_KEYS` lists the 4 closed-set generic labels
 *   - The new `listRelationshipLabelRepairCandidates` SQL exists in
 *     the candidate-selector with the expected primitives (innerJoin
 *     on source_node_id → ags_graph_nodes.workspace_id, inArray over
 *     the blacklist, orderBy id)
 *   - `listSemanticEnrichmentCandidates` routes the kind correctly
 *   - DB-null short-circuit returns an empty envelope
 *   - Non-blacklisted `typeKey` short-circuits (operator-facing
 *     clarity)
 *   - Candidate envelope shape matches `targetKind: "edge"`
 *   - Runner gate admits the kind
 *   - Public-api re-exports the blacklist
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import {
  GENERIC_EDGE_TYPE_KEYS,
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
// Closed taxonomy — generic-label blacklist
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup γ — GENERIC_EDGE_TYPE_KEYS", () => {
  it("enumerates the 4 canonical generic labels in canonical order", () => {
    expect([...GENERIC_EDGE_TYPE_KEYS]).toEqual([
      "RELATED_TO",
      "ASSOCIATED_WITH",
      "LINKED_TO",
      "CONNECTED_TO",
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Source-level SQL primitives
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup γ — selector SQL primitives", () => {
  const SRC = readFile(join(DIR, "semantic-enrichment-candidate-selector.ts"));

  it("declares listRelationshipLabelRepairCandidates", () => {
    expect(SRC).toMatch(
      /function\s+listRelationshipLabelRepairCandidates\s*\(/,
    );
  });

  it("innerJoins ags_graph_nodes on sourceNodeId for workspace scoping", () => {
    expect(SRC).toMatch(/\.innerJoin\(\s*agsGraphNodes/);
    expect(SRC).toMatch(/agsGraphNodes\.id[\s\S]*?agsGraphEdges\.sourceNodeId/);
    expect(SRC).toMatch(/agsGraphNodes\.workspaceId/);
  });

  it("filters by governance_status='active' on edges", () => {
    expect(SRC).toMatch(/agsGraphEdges\.governanceStatus[\s\S]*?"active"/);
  });

  it("uses inArray over GENERIC_EDGE_TYPE_KEYS for the default case", () => {
    expect(SRC).toMatch(/inArray\(\s*agsGraphEdges\.typeKey/);
    expect(SRC).toMatch(/GENERIC_EDGE_TYPE_KEYS/);
  });

  it("orders by edge id for paging determinism", () => {
    expect(SRC).toMatch(/\.orderBy\(agsGraphEdges\.id\)/);
  });

  it("only emits targetKind: \"edge\" inside listRelationshipLabelRepairCandidates", () => {
    const startIdx = SRC.indexOf(
      "async function listRelationshipLabelRepairCandidates",
    );
    expect(startIdx).toBeGreaterThan(-1);
    const after = SRC.slice(startIdx + 1);
    const endIdx = after.indexOf("\nasync function ");
    const body = endIdx === -1 ? after : after.slice(0, endIdx);
    const literals = [...body.matchAll(/targetKind:\s*"([^"]+)"\s*as\s*const/g)].map((m) => m[1]);
    expect(literals).toEqual(["edge"]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Branch routing
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup γ — listSemanticEnrichmentCandidates dispatch", () => {
  it("returns empty envelope with proposalKind echoed when getAsDb is null", async () => {
    dbMock.mockReturnValue(null);
    const result = await listSemanticEnrichmentCandidates({
      workspaceId: 1,
      proposalKind: "relationship_label_repair",
    });
    expect(result.proposalKind).toBe("relationship_label_repair");
    expect(result.candidates).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.weakDescriptionMaxLengthUsed).toBeNull();
  });

  it("returns empty envelope when typeKey is not on the generic-label blacklist (short-circuit)", async () => {
    dbMock.mockReturnValue({
      // If the SQL is exercised the test fails — short-circuit must run first.
      select: () => {
        throw new Error("DB should NOT be hit for non-blacklisted typeKey");
      },
    });
    const result = await listSemanticEnrichmentCandidates({
      workspaceId: 1,
      proposalKind: "relationship_label_repair",
      typeKey: "OWNS",
    });
    expect(result.candidates).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("still routes stale_fact_refresh to the deferred empty-envelope path", async () => {
    dbMock.mockReturnValue({});
    const result = await listSemanticEnrichmentCandidates({
      workspaceId: 1,
      proposalKind: "stale_fact_refresh",
    });
    expect(result.candidates).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Runner gate admission
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup γ — runner gate admits relationship_label_repair", () => {
  it("SUPPORTED_TRIGGER_PROPOSAL_KINDS includes relationship_label_repair", () => {
    expect([...SUPPORTED_TRIGGER_PROPOSAL_KINDS]).toContain(
      "relationship_label_repair",
    );
  });

  it("predicate returns true for relationship_label_repair", () => {
    expect(isSupportedTriggerProposalKind("relationship_label_repair")).toBe(
      true,
    );
  });

  it("predicate returns false for the 1 remaining deferred kind", () => {
    expect(isSupportedTriggerProposalKind("stale_fact_refresh")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Doc lockstep + public-api re-export
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup γ — doc + barrel lockstep", () => {
  it("selector header doc names the 4/5 coverage state", () => {
    const src = readFile(join(DIR, "semantic-enrichment-candidate-selector.ts"));
    expect(src).toMatch(/4\/5\s+kinds/);
    expect(src).toMatch(/relationship_label_repair/);
  });

  it("runner doc names the MVP no-citations caveat for edge targets too", () => {
    const src = readFile(join(DIR, "semantic-enrichment-runner.ts"));
    expect(src).toMatch(/relationship_label_repair/);
    expect(src).toMatch(/row-id-aware/);
  });

  it("public-api re-exports GENERIC_EDGE_TYPE_KEYS + GenericEdgeTypeKey type", () => {
    const src = readFile(join(DIR, "public-api.ts"));
    expect(src).toMatch(/\bGENERIC_EDGE_TYPE_KEYS\b/);
    expect(src).toMatch(/\bGenericEdgeTypeKey\b/);
  });
});
