/**
 * T-G.2.3 — Code Graph ASDB persistence wired.
 *
 * Source-scan test that locks the production shape of
 * `server/agent-studio/services/code-graph/persistence/code-graph-store.ts`
 * after T-G.2.3 + the matching `drizzle/tables/agent-studio-code-graph.ts`
 * schema file.
 *
 * Locked invariants:
 *
 *   - Three new ASDB tables: ags_code_graph_ingestions,
 *     ags_code_graph_nodes, ags_code_graph_edges.
 *   - Composite-unique index on (ingestion_id, node_id) +
 *     (ingestion_id, edge_id) — the idempotency anchor for re-parse.
 *   - persistIngestion calls validateCodeGraphEdgeBatch BEFORE the
 *     edge upsert (rejects malformed edges at the store boundary).
 *   - Drizzle ON CONFLICT DO UPDATE on both node + edge upserts.
 *   - Batched inserts at PERSIST_BATCH_SIZE = 500.
 *   - Persistence has NO neo4j-driver import (projection owns that
 *     boundary — projection wired in T-G.2.4).
 *   - Schema registered in drizzle/schema.ts barrel.
 *
 * Behavioral correctness against a live ASDB happens in CI's
 * integration test suite once the migration auto-creates the
 * tables; this source-scan is the wiring lock.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

describe("T-G.2.3 — Code Graph ASDB persistence wired", () => {
  it("drizzle table file exists at the expected path", () => {
    expect(
      existsSync(resolve(repoRoot, "drizzle/tables/agent-studio-code-graph.ts")),
    ).toBe(true);
  });

  it("schema barrel re-exports the new code-graph tables", () => {
    const src = read("drizzle/schema.ts");
    expect(src).toMatch(/from\s+['"]\.\/tables\/agent-studio-code-graph['"]/);
  });

  it("three tables declared (ingestions, nodes, edges)", () => {
    const src = read("drizzle/tables/agent-studio-code-graph.ts");
    expect(src).toMatch(/agsCodeGraphIngestions\s*=\s*pgTable\(\s*["']ags_code_graph_ingestions["']/);
    expect(src).toMatch(/agsCodeGraphNodes\s*=\s*pgTable\(\s*["']ags_code_graph_nodes["']/);
    expect(src).toMatch(/agsCodeGraphEdges\s*=\s*pgTable\(\s*["']ags_code_graph_edges["']/);
  });

  it("ingestions table uses uniqueIndex on ingestion_id (idempotency anchor)", () => {
    const src = read("drizzle/tables/agent-studio-code-graph.ts");
    expect(src).toMatch(
      /uniqueIndex\(["']idx_ags_code_graph_ingestions_id["']\)[\s\S]*?\.on\([\s\S]*?t\.ingestionId[\s\S]*?\)/,
    );
  });

  it("nodes table uses composite-unique on (ingestion_id, node_id)", () => {
    const src = read("drizzle/tables/agent-studio-code-graph.ts");
    expect(src).toMatch(
      /uniqueIndex\(["']uq_ags_code_graph_nodes_ingestion_node["']\)[\s\S]*?\.on\([\s\S]*?t\.ingestionId,[\s\S]*?t\.nodeId[\s\S]*?\)/,
    );
  });

  it("edges table uses composite-unique on (ingestion_id, edge_id)", () => {
    const src = read("drizzle/tables/agent-studio-code-graph.ts");
    expect(src).toMatch(
      /uniqueIndex\(["']uq_ags_code_graph_edges_ingestion_edge["']\)[\s\S]*?\.on\([\s\S]*?t\.ingestionId,[\s\S]*?t\.edgeId[\s\S]*?\)/,
    );
  });

  it("store imports the new tables + drizzle + getAsDb", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    expect(src).toMatch(/agsCodeGraphIngestions[\s\S]*agsCodeGraphNodes[\s\S]*agsCodeGraphEdges/);
    expect(src).toMatch(/from\s+["']drizzle-orm["']/);
    expect(src).toMatch(/import\s*\{\s*getAsDb\s*\}/);
  });

  it("persistIngestion calls validateCodeGraphEdgeBatch BEFORE edge upsert", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    const validateIdx = src.indexOf("validateCodeGraphEdgeBatch(");
    const insertEdgesIdx = src.indexOf(".insert(agsCodeGraphEdges)");
    expect(validateIdx).toBeGreaterThan(0);
    expect(insertEdgesIdx).toBeGreaterThan(validateIdx);
  });

  it("persistIngestion uses onConflictDoUpdate for both nodes + edges (idempotent re-parse)", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    const conflictUpdates = src.match(/onConflictDoUpdate/g) ?? [];
    // ingestions row + nodes batch + edges batch = at least 3
    expect(conflictUpdates.length).toBeGreaterThanOrEqual(3);
  });

  it("PERSIST_BATCH_SIZE = 500 (Postgres parameter-cap safe)", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    expect(src).toMatch(/const\s+PERSIST_BATCH_SIZE\s*=\s*500/);
  });

  it("persistence has NO neo4j-driver import (projection owns that boundary)", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("persistence has NO dispatchMcpToolCall import (CLAUDE.md hard rule)", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    // Narrow to real import lines (compliance docblock above mentions
    // the symbol by name as part of the hard-rule statement).
    expect(src).not.toMatch(/^import[^\n]*dispatchMcpToolCall/m);
    expect(src).not.toMatch(/from\s+["'][^"']*mcp\/dispatcher/);
  });

  it("readIngestion fetches both node + edge rows for a given ingestionId", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    expect(src).toMatch(/readIngestion\(ingestionId:\s*string\)/);
    expect(src).toMatch(/from\(agsCodeGraphNodes\)/);
    expect(src).toMatch(/from\(agsCodeGraphEdges\)/);
  });

  it("placeholder string from T-G.2.1 is GONE (regression guard)", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    expect(src).not.toMatch(
      /CodeGraphStore is the T-G\.2\.1 interface contract only/,
    );
  });
});
