/**
 * T-D.3.δ-followup δ — `stale_fact_refresh` selector.
 *
 * Verifies:
 *   - `DEFAULT_STALE_FACT_GRACE_MS` is exported with the documented 1-hour default
 *   - The new `listStaleFactRefreshCandidates` SQL exists in the
 *     candidate-selector with the expected primitives (innerJoin on
 *     node_id, sql template using updatedAt + INTERVAL grace, orderBy
 *     node id + property_key)
 *   - `listSemanticEnrichmentCandidates` routes the kind correctly
 *   - DB-null short-circuit returns an empty envelope
 *   - Runner gate admits the kind (5/5 — gate is fully open)
 *   - Runner input + router input both accept `staleFactGraceMs`
 *   - Candidate envelope shape carries `targetKind: "node_property"`
 *     + `propertyKey`
 *   - Public-api re-exports `DEFAULT_STALE_FACT_GRACE_MS`
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import {
  DEFAULT_STALE_FACT_GRACE_MS,
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
// Default grace
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup δ — DEFAULT_STALE_FACT_GRACE_MS", () => {
  it("is 1 hour in milliseconds", () => {
    expect(DEFAULT_STALE_FACT_GRACE_MS).toBe(60 * 60 * 1000);
  });
});

// ────────────────────────────────────────────────────────────────────
// Source-level SQL primitives
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup δ — selector SQL primitives", () => {
  const SRC = readFile(join(DIR, "semantic-enrichment-candidate-selector.ts"));

  it("declares listStaleFactRefreshCandidates", () => {
    expect(SRC).toMatch(/function\s+listStaleFactRefreshCandidates\s*\(/);
  });

  it("innerJoins ags_graph_nodes on node_id (parent of properties)", () => {
    expect(SRC).toMatch(/\.innerJoin\(\s*agsGraphNodes/);
    expect(SRC).toMatch(/agsGraphNodes\.id[\s\S]*?agsGraphNodeProperties\.nodeId/);
  });

  it("scopes by workspaceId + governance_status='active' on the node side", () => {
    // Body of listStaleFactRefreshCandidates uses these node-side filters.
    const startIdx = SRC.indexOf("async function listStaleFactRefreshCandidates");
    expect(startIdx).toBeGreaterThan(-1);
    const after = SRC.slice(startIdx + 1);
    const endIdx = after.indexOf("\nasync function ");
    const body = endIdx === -1 ? after : after.slice(0, endIdx);
    expect(body).toMatch(/agsGraphNodes\.workspaceId/);
    expect(body).toMatch(/governanceStatus[\s\S]*?"active"/);
  });

  it("uses sql template for `node.updatedAt > property.updatedAt + grace INTERVAL`", () => {
    expect(SRC).toMatch(
      /sql`\$\{agsGraphNodes\.updatedAt\}\s*>\s*\$\{agsGraphNodeProperties\.updatedAt\}\s*\+\s*\(\$\{graceMs\}::bigint\s*\*\s*INTERVAL/,
    );
  });

  it("orders by node id then property_key for deterministic paging", () => {
    expect(SRC).toMatch(
      /\.orderBy\(agsGraphNodes\.id,\s*agsGraphNodeProperties\.propertyKey\)/,
    );
  });

  it("only emits targetKind: \"node_property\" inside listStaleFactRefreshCandidates", () => {
    const startIdx = SRC.indexOf("async function listStaleFactRefreshCandidates");
    expect(startIdx).toBeGreaterThan(-1);
    const after = SRC.slice(startIdx + 1);
    const endIdx = after.indexOf("\nasync function ");
    const body = endIdx === -1 ? after : after.slice(0, endIdx);
    const literals = [...body.matchAll(/targetKind:\s*"([^"]+)"\s*as\s*const/g)].map((m) => m[1]);
    expect(literals).toEqual(["node_property"]);
  });

  it("candidate carries propertyKey (the discriminator-specific field)", () => {
    const startIdx = SRC.indexOf("async function listStaleFactRefreshCandidates");
    const after = SRC.slice(startIdx + 1);
    const endIdx = after.indexOf("\nasync function ");
    const body = endIdx === -1 ? after : after.slice(0, endIdx);
    expect(body).toMatch(/propertyKey:\s*r\.propertyKey/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Branch routing
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup δ — listSemanticEnrichmentCandidates dispatch", () => {
  it("returns empty envelope with proposalKind echoed when getAsDb is null", async () => {
    dbMock.mockReturnValue(null);
    const result = await listSemanticEnrichmentCandidates({
      workspaceId: 1,
      proposalKind: "stale_fact_refresh",
    });
    expect(result.proposalKind).toBe("stale_fact_refresh");
    expect(result.candidates).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.weakDescriptionMaxLengthUsed).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// Runner gate — 5/5 fully open
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup δ — runner gate is fully open (5/5)", () => {
  it("SUPPORTED_TRIGGER_PROPOSAL_KINDS includes stale_fact_refresh", () => {
    expect([...SUPPORTED_TRIGGER_PROPOSAL_KINDS]).toContain("stale_fact_refresh");
  });

  it("SUPPORTED_TRIGGER_PROPOSAL_KINDS has exactly 5 entries (all SemanticEnrichmentProposalKind values)", () => {
    expect([...SUPPORTED_TRIGGER_PROPOSAL_KINDS].sort()).toEqual(
      [
        "description_enrichment",
        "entity_disambiguation",
        "missing_property_fill",
        "relationship_label_repair",
        "stale_fact_refresh",
      ].sort(),
    );
  });

  it("predicate returns true for stale_fact_refresh", () => {
    expect(isSupportedTriggerProposalKind("stale_fact_refresh")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Operator tuning surface (staleFactGraceMs)
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup δ — staleFactGraceMs threading", () => {
  it("runner input declares optional staleFactGraceMs", () => {
    const src = readFile(join(DIR, "semantic-enrichment-runner.ts"));
    expect(src).toMatch(/staleFactGraceMs\?:\s*number/);
  });

  it("runner threads staleFactGraceMs through to listSemanticEnrichmentCandidates", () => {
    const src = readFile(join(DIR, "semantic-enrichment-runner.ts"));
    expect(src).toMatch(/staleFactGraceMs:\s*input\.staleFactGraceMs/);
  });

  it("router input schema accepts staleFactGraceMs with the documented bounds", () => {
    const src = readFile(join(DIR, "semantic-enrichment-router.ts"));
    // 0 → 24h (24 * 60 * 60 * 1000 = 86_400_000)
    expect(src).toMatch(/staleFactGraceMs:[\s\S]*?\.min\(0\)/);
    expect(src).toMatch(/staleFactGraceMs:[\s\S]*?24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Doc lockstep + public-api re-export
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ-followup δ — doc + barrel lockstep", () => {
  it("selector header doc names the 5/5 coverage state", () => {
    const src = readFile(join(DIR, "semantic-enrichment-candidate-selector.ts"));
    expect(src).toMatch(/5\/5\s+kinds/);
    expect(src).toMatch(/stale_fact_refresh/);
  });

  it("runner doc names all 5 kinds in the coverage matrix", () => {
    const src = readFile(join(DIR, "semantic-enrichment-runner.ts"));
    for (const k of [
      "description_enrichment",
      "missing_property_fill",
      "entity_disambiguation",
      "relationship_label_repair",
      "stale_fact_refresh",
    ]) {
      expect(src, `runner doc must name ${k}`).toMatch(new RegExp(k));
    }
  });

  it("public-api re-exports DEFAULT_STALE_FACT_GRACE_MS", () => {
    const src = readFile(join(DIR, "public-api.ts"));
    expect(src).toMatch(/\bDEFAULT_STALE_FACT_GRACE_MS\b/);
  });
});
