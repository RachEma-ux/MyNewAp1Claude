/**
 * T-D.3.1 — Semantic Enrichment Agent skeleton.
 *
 * Source-scan integrity test locking the boundary contract for the
 * LLM-driven graph enrichment proposer. The four factories were
 * landed via precedent (p) skeleton-first; this test now reflects
 * the FULLY-WIRED runtime after T-D.3.2-5:
 *
 *   T-D.3.2 → store (ASDB persistence to ags_semantic_enrichment_*)
 *   T-D.3.3 → evidence collector (KB / RAC source-note read path)
 *   T-D.3.4 → LLM proposer (via OpenRouter Model Access)
 *   T-D.3.5 → agent runtime composing all three
 *
 * Hard-rule boundary scans:
 *   - No neo4j-driver import anywhere in graph-enrichment/.
 *   - No openrouter SDK direct import (LLM access must go through
 *     the Model Access boundary, threaded as a factory option).
 *   - No process.env.*_API_KEY reads (credential resolution lives
 *     on the Model Access surface).
 *   - No dispatchMcpToolCall import (proposer is read-only; no
 *     tool execution).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { resolve, join } from "path";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment",
);

function readDirAll(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...readDirAll(p));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

function readFile(p: string): string {
  return readFileSync(p, "utf8");
}

describe("T-D.3.1 — Semantic Enrichment Agent skeleton", () => {
  // ── directory + barrel ────────────────────────────────────────

  it("graph-enrichment/ directory exists with public-api barrel", () => {
    expect(existsSync(DIR)).toBe(true);
    expect(existsSync(join(DIR, "public-api.ts"))).toBe(true);
  });

  it("public-api re-exports the closed-taxonomy + 4 factories + types", () => {
    const src = readFile(join(DIR, "public-api.ts"));
    // Taxonomy
    expect(src).toMatch(/SEMANTIC_ENRICHMENT_PROPOSAL_KINDS/);
    expect(src).toMatch(/SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA/);
    expect(src).toMatch(/type\s+SemanticEnrichmentProposalKind/);
    // Factories
    expect(src).toMatch(/createSemanticEnrichmentAgent/);
    expect(src).toMatch(/createSemanticEnrichmentStore/);
    expect(src).toMatch(/createSemanticEnrichmentEvidenceCollector/);
    expect(src).toMatch(/createSemanticEnrichmentProposer/);
  });

  // ── closed-taxonomy lock ──────────────────────────────────────

  it("contracts declare the 5 closed-taxonomy proposal kinds", () => {
    const src = readFile(join(DIR, "contracts.ts"));
    for (const kind of [
      "description_enrichment",
      "missing_property_fill",
      "stale_fact_refresh",
      "entity_disambiguation",
      "relationship_label_repair",
    ]) {
      expect(src).toMatch(new RegExp(`["']${kind}["']`));
    }
  });

  it("contracts ship default confidence threshold = 0.8 (per plan T-D.3)", () => {
    const src = readFile(join(DIR, "contracts.ts"));
    expect(src).toMatch(/DEFAULT_SEMANTIC_ENRICHMENT_MIN_CONFIDENCE\s*=\s*0\.8/);
  });

  // ── flip ledger (ALL four factories wired) ────────────────────

  it("ALL four factories flipped (agent @ T-D.3.5, store @ T-D.3.2, evidence @ T-D.3.3, proposer @ T-D.3.4)", () => {
    for (const file of [
      "semantic-enrichment-agent.ts",
      "semantic-enrichment-store.ts",
      "semantic-enrichment-evidence-collector.ts",
      "semantic-enrichment-proposer.ts",
    ]) {
      const src = readFile(join(DIR, file));
      expect(src, `${file} placeholder must be gone`).not.toMatch(
        /\[T-D\.3\.1\][\s\S]*create/,
      );
    }
  });

  // ── boundary discipline (hard rules) ──────────────────────────

  it("no neo4j-driver import anywhere in graph-enrichment/", () => {
    for (const f of readDirAll(DIR)) {
      const src = readFile(f);
      expect(src, `${f} should not import neo4j-driver`).not.toMatch(
        /from\s+["']neo4j-driver["']/,
      );
    }
  });

  it("no direct openrouter SDK import — LLM access only via Model Access boundary", () => {
    for (const f of readDirAll(DIR)) {
      const src = readFile(f);
      expect(src, `${f} should not directly import the openrouter SDK`).not.toMatch(
        /from\s+["'](?:openrouter|openai|@anthropic-ai\/sdk|@google\/generative-ai)["']/,
      );
    }
  });

  it("no process.env.*_API_KEY reads (credentials threaded via Model Access)", () => {
    for (const f of readDirAll(DIR)) {
      const src = readFile(f);
      expect(src, `${f} should not read process.env API keys directly`).not.toMatch(
        /process\.env\.[A-Z_]*API_KEY/,
      );
    }
  });

  it("no dispatchMcpToolCall import or call (proposer is read-only; no tool execution)", () => {
    for (const f of readDirAll(DIR)) {
      const src = readFile(f);
      expect(src, `${f} should not import dispatchMcpToolCall`).not.toMatch(
        /^import[^\n]*dispatchMcpToolCall/m,
      );
      expect(src, `${f} should not call dispatchMcpToolCall`).not.toMatch(
        /dispatchMcpToolCall\(/,
      );
    }
  });

  it("no drizzle-orm import in agent / proposer / contracts (persistence-layer boundary)", () => {
    // Store CAN import drizzle (T-D.3.2 persistence boundary).
    // Evidence collector CAN import drizzle (T-D.3.3 read-only KB).
    // Agent + proposer + contracts must not.
    const nonPersistenceFiles = [
      "semantic-enrichment-agent.ts",
      "semantic-enrichment-proposer.ts",
      "contracts.ts",
    ];
    for (const file of nonPersistenceFiles) {
      const src = readFile(join(DIR, file));
      expect(src, `${file} should not import drizzle-orm`).not.toMatch(
        /from\s+["']drizzle-orm/,
      );
    }
  });

  // ── contract shape ────────────────────────────────────────────

  it("agent interface declares run(input): Promise<RunOutput> (T-D.3.5 widened to input+candidates / output+skips)", () => {
    const src = readFile(join(DIR, "semantic-enrichment-agent.ts"));
    expect(src).toMatch(
      /interface\s+SemanticEnrichmentAgent\s*\{[\s\S]*?run\([\s\S]*?\):\s*Promise<\s*SemanticEnrichmentRunOutput\w*\s*>[\s\S]*?\}/,
    );
  });

  it("store interface separates run-lifecycle from proposal-record from threshold-reject", () => {
    const src = readFile(join(DIR, "semantic-enrichment-store.ts"));
    expect(src).toMatch(/beginRun\(/);
    expect(src).toMatch(/recordProposal\(/);
    expect(src).toMatch(/recordRejectedBelowThreshold\(/);
    expect(src).toMatch(/finishRun\(/);
  });

  it("proposer accepts evidence-citations as input (source-backed proposal contract)", () => {
    const src = readFile(join(DIR, "semantic-enrichment-proposer.ts"));
    expect(src).toMatch(
      /citations:\s*ReadonlyArray<SemanticEnrichmentSourceCitation>/,
    );
  });

  // ── normalization helpers ─────────────────────────────────────

  it("normalizeSemanticEnrichmentMaxProposals + MinConfidence are exported helpers", () => {
    const src = readFile(join(DIR, "contracts.ts"));
    expect(src).toMatch(
      /export\s+function\s+normalizeSemanticEnrichmentMaxProposals/,
    );
    expect(src).toMatch(
      /export\s+function\s+normalizeSemanticEnrichmentMinConfidence/,
    );
  });
});

describe("T-D.3.1 — runtime is fully wired (behavioral)", () => {
  it("normalizeSemanticEnrichmentMinConfidence clamps below 0 → 0, above 1 → 1, missing → default", async () => {
    const {
      normalizeSemanticEnrichmentMinConfidence,
      DEFAULT_SEMANTIC_ENRICHMENT_MIN_CONFIDENCE,
    } = await import(
      "../../server/agent-studio/services/graph-enrichment/public-api"
    );
    expect(normalizeSemanticEnrichmentMinConfidence(-0.5)).toBe(0);
    expect(normalizeSemanticEnrichmentMinConfidence(1.5)).toBe(1);
    expect(normalizeSemanticEnrichmentMinConfidence(0.42)).toBe(0.42);
    expect(normalizeSemanticEnrichmentMinConfidence(undefined)).toBe(
      DEFAULT_SEMANTIC_ENRICHMENT_MIN_CONFIDENCE,
    );
    expect(normalizeSemanticEnrichmentMinConfidence(NaN)).toBe(
      DEFAULT_SEMANTIC_ENRICHMENT_MIN_CONFIDENCE,
    );
  });

  it("normalizeSemanticEnrichmentMaxProposals clamps non-positive → default, above absolute → absolute", async () => {
    const {
      normalizeSemanticEnrichmentMaxProposals,
      DEFAULT_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN,
      ABSOLUTE_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN,
    } = await import(
      "../../server/agent-studio/services/graph-enrichment/public-api"
    );
    expect(normalizeSemanticEnrichmentMaxProposals(0)).toBe(
      DEFAULT_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN,
    );
    expect(normalizeSemanticEnrichmentMaxProposals(-5)).toBe(
      DEFAULT_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN,
    );
    expect(normalizeSemanticEnrichmentMaxProposals(99999)).toBe(
      ABSOLUTE_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN,
    );
    expect(normalizeSemanticEnrichmentMaxProposals(25)).toBe(25);
  });

  it("isSemanticEnrichmentProposalKind narrows on closed taxonomy", async () => {
    const { isSemanticEnrichmentProposalKind } = await import(
      "../../server/agent-studio/services/graph-enrichment/public-api"
    );
    expect(isSemanticEnrichmentProposalKind("description_enrichment")).toBe(true);
    expect(isSemanticEnrichmentProposalKind("not_a_kind")).toBe(false);
    expect(isSemanticEnrichmentProposalKind(undefined)).toBe(false);
  });

  it("ALL four factories are constructible without throwing — runtime is fully wired", async () => {
    const {
      createSemanticEnrichmentAgent,
      createSemanticEnrichmentStore,
      createSemanticEnrichmentEvidenceCollector,
      createSemanticEnrichmentProposer,
    } = await import(
      "../../server/agent-studio/services/graph-enrichment/public-api"
    );
    expect(() => createSemanticEnrichmentStore()).not.toThrow();
    expect(() => createSemanticEnrichmentEvidenceCollector()).not.toThrow();
    expect(() =>
      createSemanticEnrichmentProposer({
        modelAccess: {},
        providerConnectionId: 1,
        modelRef: "m",
        actorId: 1,
      }),
    ).not.toThrow();
    expect(() =>
      createSemanticEnrichmentAgent({
        store: createSemanticEnrichmentStore(),
        evidenceCollector: createSemanticEnrichmentEvidenceCollector(),
        proposer: createSemanticEnrichmentProposer({
          modelAccess: {},
          providerConnectionId: 1,
          modelRef: "m",
          actorId: 1,
        }),
      }),
    ).not.toThrow();
  });

  it("agent.run with no candidates completes cleanly (full lifecycle via stubs)", async () => {
    const { createSemanticEnrichmentAgent } = await import(
      "../../server/agent-studio/services/graph-enrichment/public-api"
    );
    const calls: string[] = [];
    const store = {
      async beginRun() {
        calls.push("beginRun");
        return { runId: 1, startedAt: new Date() };
      },
      async recordProposal() {
        calls.push("recordProposal");
        return { proposalId: 1 };
      },
      async recordRejectedBelowThreshold() {
        calls.push("recordRejectedBelowThreshold");
      },
      async finishRun() {
        calls.push("finishRun");
      },
    } as any;
    const agent = createSemanticEnrichmentAgent({
      store,
      evidenceCollector: { async collect() { return []; } } as any,
      proposer: { async propose() { throw new Error("should not be called"); } } as any,
    });
    const out = await agent.run({ workspaceId: 1, candidates: [] } as any);
    expect(out.proposalsCreated).toBe(0);
    expect(out.status).toBe("completed");
    expect(calls).toEqual(["beginRun", "finishRun"]);
  });
});
