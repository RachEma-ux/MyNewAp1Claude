/**
 * T-D.3.1 — Semantic Enrichment Agent skeleton.
 *
 * Source-scan integrity test locking the boundary contract for the
 * LLM-driven graph enrichment proposer. The runtime is intentionally
 * a factory-throws placeholder per precedent (p) — subsequent
 * T-D.3.x slices flip exactly one factory at a time:
 *
 *   T-D.3.2 → store (ASDB persistence to ags_semantic_enrichment_*)
 *   T-D.3.3 → evidence collector (KB / RAC source-note read path)
 *   T-D.3.4 → LLM proposer (via OpenRouter Model Access)
 *   T-D.3.5 → agent runtime composing all three
 *
 * The source-scan locks placeholder strings so a forgotten flip
 * fails before merge.
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

  // ── factory-throws placeholders (precedent (p)) ───────────────

  it("agent / store / evidence-collector / proposer all throw T-D.3.1 placeholders", () => {
    const expected: Array<[string, string]> = [
      ["semantic-enrichment-agent.ts", "T-D.3.1] createSemanticEnrichmentAgent"],
      ["semantic-enrichment-store.ts", "T-D.3.1] createSemanticEnrichmentStore"],
      [
        "semantic-enrichment-evidence-collector.ts",
        "T-D.3.1] createSemanticEnrichmentEvidenceCollector",
      ],
      ["semantic-enrichment-proposer.ts", "T-D.3.1] createSemanticEnrichmentProposer"],
    ];
    for (const [file, marker] of expected) {
      const src = readFile(join(DIR, file));
      expect(src).toContain(marker);
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
      // openrouter/model-access is what the proposer will inject via
      // the `modelAccess` factory option; direct openrouter SDK
      // imports are forbidden.
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

  it("no drizzle-orm import in agent / proposer / evidence-collector (store-only boundary)", () => {
    // Store CAN import drizzle (it's the persistence boundary, T-D.3.2);
    // the other layers must not.
    const nonStoreFiles = [
      "semantic-enrichment-agent.ts",
      "semantic-enrichment-proposer.ts",
      "semantic-enrichment-evidence-collector.ts",
      "contracts.ts",
    ];
    for (const file of nonStoreFiles) {
      const src = readFile(join(DIR, file));
      expect(src, `${file} should not import drizzle-orm`).not.toMatch(
        /from\s+["']drizzle-orm/,
      );
    }
  });

  // ── contract shape (read-only boundary types) ─────────────────

  it("agent interface declares only run(input): Promise<RunOutput>", () => {
    const src = readFile(join(DIR, "semantic-enrichment-agent.ts"));
    expect(src).toMatch(
      /interface\s+SemanticEnrichmentAgent\s*\{[\s\S]*?run\(input:\s*SemanticEnrichmentRunInput\):\s*Promise<SemanticEnrichmentRunOutput>[\s\S]*?\}/,
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

describe("T-D.3.1 — normalization helpers (behavioral)", () => {
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

  it("factory-throws fire with [T-D.3.1] tagged messages", async () => {
    const {
      createSemanticEnrichmentAgent,
      createSemanticEnrichmentStore,
      createSemanticEnrichmentEvidenceCollector,
      createSemanticEnrichmentProposer,
    } = await import(
      "../../server/agent-studio/services/graph-enrichment/public-api"
    );
    const store = createSemanticEnrichmentStore({ db: {} });
    const collector = createSemanticEnrichmentEvidenceCollector({
      noteVersionReader: {},
    });
    const proposer = createSemanticEnrichmentProposer({ modelAccess: {} });
    const agent = createSemanticEnrichmentAgent({
      store,
      evidenceCollector: collector,
      proposer,
    });
    await expect(agent.run({ workspaceId: 1 })).rejects.toThrow(/T-D\.3\.1/);
    await expect(store.beginRun({ workspaceId: 1 })).rejects.toThrow(/T-D\.3\.1/);
    await expect(
      collector.collect({ workspaceId: 1, targetTypeKey: "note", targetId: 1 }),
    ).rejects.toThrow(/T-D\.3\.1/);
    await expect(
      proposer.propose({
        workspaceId: 1,
        targetTypeKey: "note",
        targetId: 1,
        proposalKind: "description_enrichment",
        citations: [],
      }),
    ).rejects.toThrow(/T-D\.3\.1/);
  });
});
