/**
 * T-G.2.4 — Code Graph Neo4j projection wired through GraphRepository.
 *
 * Source-scan test that locks the production shape of
 * `server/agent-studio/services/code-graph/projection/code-graph-projection.ts`
 * after T-G.2.4:
 *
 *   - createCodeGraphProjection() now takes `{ store, repository }`
 *     (dependency-injection — matches sync-worker.ts pattern).
 *   - projectIngestion reads from store.readIngestion + calls
 *     repository.applyProjectionJob (NOT a stub return).
 *   - Each ParsedCodeNode → upsert_node ProjectionWrite with
 *     provenance `{ sourceType: "code_graph_ingestion",
 *     lineageStatus: "derived", extractionMethod: "tree-sitter" }`.
 *   - Each ParsedCodeEdge → upsert_edge ProjectionWrite with the
 *     same provenance + both endpoints carrying typeKey.
 *   - Projection does NOT import neo4j-driver directly (goes
 *     through the GraphRepository — Phase 7.5b path).
 *   - Source-of-truth invariant: NO ASDB writes (only reads from
 *     CodeGraphStore via the injected dependency).
 *
 * Behavioral correctness against a live Neo4j is exercised by the
 * existing Phase 7.5a/b paths + CI's graph-bench-neo4j-ce workflow.
 * This source-scan locks the wiring so a future regression silently
 * restoring stub behavior fails before merge.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");
const projectionPath = resolve(
  repoRoot,
  "server/agent-studio/services/code-graph/projection/code-graph-projection.ts",
);
function readSrc(): string {
  return readFileSync(projectionPath, "utf8");
}

describe("T-G.2.4 — Code Graph Neo4j projection wired", () => {
  it("createCodeGraphProjection accepts CodeGraphProjectionOptions { store, repository }", () => {
    const src = readSrc();
    expect(src).toMatch(/export\s+interface\s+CodeGraphProjectionOptions/);
    expect(src).toMatch(/readonly\s+store:\s*CodeGraphStore/);
    expect(src).toMatch(/readonly\s+repository:\s*GraphProjectionRepository/);
    expect(src).toMatch(
      /export\s+function\s+createCodeGraphProjection\(\s*options:\s*CodeGraphProjectionOptions/,
    );
  });

  it("projectIngestion reads from store.readIngestion (NOT a stub)", () => {
    const src = readSrc();
    expect(src).toMatch(/options\.store\.readIngestion\([\s\S]*?input\.ingestionId[\s\S]*?\)/);
  });

  it("projectIngestion calls repository.applyProjectionJob with the converted writes", () => {
    const src = readSrc();
    expect(src).toMatch(/options\.repository\.applyProjectionJob\(writes\)/);
  });

  it("nodes convert to upsert_node ProjectionWrite with code_graph_ingestion provenance", () => {
    const src = readSrc();
    expect(src).toMatch(/kind:\s*"upsert_node"/);
    expect(src).toMatch(/sourceType:\s*"code_graph_ingestion"/);
    expect(src).toMatch(/lineageStatus:\s*"derived"/);
    expect(src).toMatch(/extractionMethod:\s*"tree-sitter"/);
  });

  it("edges convert to upsert_edge ProjectionWrite with endpoint typeKeys", () => {
    const src = readSrc();
    expect(src).toMatch(/kind:\s*"upsert_edge"/);
    expect(src).toMatch(/sourceNode:\s*\{\s*typeKey:[\s\S]*?id:\s*edge\.sourceId\s*\}/);
    expect(src).toMatch(/targetNode:\s*\{\s*typeKey:[\s\S]*?id:\s*edge\.targetId\s*\}/);
  });

  it("unresolved cross-file references tagged with typeKey 'unresolved' (not dropped)", () => {
    const src = readSrc();
    // The persistence layer (T-G.2.3) validated edges via the
    // closed-taxonomy registry, but cross-file targets may still
    // be raw callee names / import specifiers. The projection
    // tags them so the lens runner can choose to filter or join.
    expect(src).toMatch(/['"]unresolved['"]/);
  });

  it("durationMs measured against wall clock (operator-visible perf signal)", () => {
    const src = readSrc();
    expect(src).toMatch(/const\s+start\s*=\s*Date\.now\(\)/);
    expect(src).toMatch(/durationMs[\s\S]*?Date\.now\(\)\s*-\s*start/);
  });

  it("nodesProjected + edgesProjected sum created + updated (not just created)", () => {
    const src = readSrc();
    expect(src).toMatch(/nodesCreated\s*\+\s*result\.nodesUpdated/);
    expect(src).toMatch(/edgesCreated\s*\+\s*result\.edgesUpdated/);
  });

  it("projection does NOT import neo4j-driver (goes through GraphRepository)", () => {
    const src = readSrc();
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("projection does NOT import drizzle (writes go through repository — Postgres SoT)", () => {
    const src = readSrc();
    expect(src).not.toMatch(/from\s+["']drizzle-orm/);
    expect(src).not.toMatch(/getAsDb/);
  });

  it("placeholder string from T-G.2.1 is GONE (regression guard)", () => {
    const src = readSrc();
    expect(src).not.toMatch(
      /CodeGraphProjection is the T-G\.2\.1 interface contract only/,
    );
  });
});
