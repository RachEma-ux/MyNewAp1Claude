/**
 * T-D.3.3 — Semantic Enrichment evidence collector wire-up.
 *
 * Behavioral test for the KB-backed implementation of
 * SemanticEnrichmentEvidenceCollector. Uses the `noteVersionReader`
 * test seam to bypass the live ASDB read.
 *
 * Validates:
 *   - When `noteVersionReader` is supplied, the collector delegates
 *     and returns its citations clipped to `maxCitations`.
 *   - Default maxCitations is 5; absolute cap is 25.
 *   - Read-only contract: no mutation calls anywhere in the file.
 *
 * Source-scan: collector imports drizzle + getAsDb + agsKnowledgeUnits;
 * no neo4j-driver / openrouter / process.env reads.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  createSemanticEnrichmentEvidenceCollector,
  type SemanticEnrichmentSourceCitation,
  type EvidenceCollectionInput,
  type NoteVersionReader,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const COLLECTOR_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-evidence-collector.ts",
);

function readCollector(): string {
  return readFileSync(COLLECTOR_FILE, "utf8");
}

function makeReader(
  citations: SemanticEnrichmentSourceCitation[],
  capture: { lastInput?: EvidenceCollectionInput } = {},
): NoteVersionReader {
  return async (input) => {
    capture.lastInput = input;
    return citations;
  };
}

function cite(noteId: number, excerpt = `note ${noteId}`): SemanticEnrichmentSourceCitation {
  return { noteId, noteVersionId: noteId, excerpt };
}

describe("T-D.3.3 — Semantic Enrichment evidence collector (behavioral)", () => {
  it("delegates to noteVersionReader when supplied", async () => {
    const capture: { lastInput?: EvidenceCollectionInput } = {};
    const collector = createSemanticEnrichmentEvidenceCollector({
      noteVersionReader: makeReader([cite(1), cite(2)], capture),
    });
    const out = await collector.collect({
      workspaceId: 7,
      targetTypeKey: "note",
      targetId: 42,
    });
    expect(out).toHaveLength(2);
    expect(capture.lastInput).toEqual({
      workspaceId: 7,
      targetTypeKey: "note",
      targetId: 42,
    });
  });

  it("clips at default maxCitations = 5 when no override provided", async () => {
    const collector = createSemanticEnrichmentEvidenceCollector({
      noteVersionReader: makeReader(Array.from({ length: 10 }, (_, i) => cite(i + 1))),
    });
    const out = await collector.collect({
      workspaceId: 1,
      targetTypeKey: "note",
      targetId: 1,
    });
    expect(out).toHaveLength(5);
    expect(out.map((c) => c.noteId)).toEqual([1, 2, 3, 4, 5]);
  });

  it("honors maxCitations override when below the absolute cap", async () => {
    const collector = createSemanticEnrichmentEvidenceCollector({
      noteVersionReader: makeReader(Array.from({ length: 20 }, (_, i) => cite(i + 1))),
    });
    const out = await collector.collect({
      workspaceId: 1,
      targetTypeKey: "note",
      targetId: 1,
      maxCitations: 3,
    });
    expect(out).toHaveLength(3);
  });

  it("clamps maxCitations to absolute cap of 25", async () => {
    const collector = createSemanticEnrichmentEvidenceCollector({
      noteVersionReader: makeReader(Array.from({ length: 50 }, (_, i) => cite(i + 1))),
    });
    const out = await collector.collect({
      workspaceId: 1,
      targetTypeKey: "note",
      targetId: 1,
      maxCitations: 999,
    });
    expect(out.length).toBeLessThanOrEqual(25);
  });

  it("returns the reader's citations unchanged in content (only count is clipped)", async () => {
    const collector = createSemanticEnrichmentEvidenceCollector({
      noteVersionReader: makeReader([
        { noteId: 7, noteVersionId: 7, excerpt: "exact excerpt" },
      ]),
    });
    const out = await collector.collect({
      workspaceId: 1,
      targetTypeKey: "note",
      targetId: 1,
    });
    expect(out).toEqual([
      { noteId: 7, noteVersionId: 7, excerpt: "exact excerpt" },
    ]);
  });
});

describe("T-D.3.3 — Semantic Enrichment evidence collector (source-scan)", () => {
  it("imports agsKnowledgeUnits + getAsDb (live ASDB read path)", () => {
    const src = readCollector();
    expect(src).toMatch(
      /import\s*\{\s*getAsDb\s*\}\s*from\s*["']\.\.\/\.\.\/db\/connection\.js["']/,
    );
    expect(src).toMatch(
      /import\s*\{\s*agsKnowledgeUnits\s*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/\.\.\/drizzle\/tables\/agent-studio\.js["']/,
    );
  });

  it("uses ILIKE for content-text needle search (workspace-scoped)", () => {
    const src = readCollector();
    expect(src).toMatch(/ILIKE/);
    expect(src).toMatch(/workspaceId/);
  });

  it("read-only: NO insert / update / delete calls anywhere", () => {
    const src = readCollector();
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
  });

  it("no neo4j-driver / openrouter / process.env API key reads", () => {
    const src = readCollector();
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(src).not.toMatch(
      /from\s+["'](?:openrouter|openai|@anthropic-ai\/sdk|@google\/generative-ai)["']/,
    );
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("no T-D.3.1 factory-throws placeholder remains", () => {
    const src = readCollector();
    expect(src).not.toMatch(
      /\[T-D\.3\.1\][\s\S]*createSemanticEnrichmentEvidenceCollector/,
    );
  });

  it("ASDB-null path returns empty array (graceful degradation)", () => {
    const src = readCollector();
    // The live path early-returns [] when getAsDb() is null. This is
    // a load-bearing operator-grade ergonomic — the agent stays alive
    // even when ASDB is misconfigured.
    expect(src).toMatch(/return\s*\[\]/);
  });
});
