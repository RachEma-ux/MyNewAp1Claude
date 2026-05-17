/**
 * T-G.3.3 — Security Graph ASDB persistence wired.
 *
 * Source-scan test that locks the production shape of
 * `server/agent-studio/services/security-graph/persistence/security-graph-store.ts`
 * + the matching `drizzle/tables/agent-studio-security-graph.ts`
 * schema. Mirrors T-G.2.3's tg-2-3 test shape line-for-line.
 *
 * Locked invariants:
 *   - 3 ASDB tables: ags_security_graph_ingestions / _nodes / _edges
 *   - Composite-unique indexes on (ingestion_id, node_id) +
 *     (ingestion_id, edge_id) — idempotency anchor for re-ingest
 *   - persistIngestion calls validateSecurityGraphEdgeBatch BEFORE
 *     the edge upsert
 *   - ON CONFLICT DO UPDATE for all 3 upserts (ingestion + nodes +
 *     edges)
 *   - PERSIST_BATCH_SIZE = 500 (matches T-G.2.3 — same Postgres
 *     param cap)
 *   - Persistence has NO neo4j-driver import (projection's job)
 *   - Schema registered in drizzle/schema.ts barrel
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

describe("T-G.3.3 — Security Graph ASDB persistence wired", () => {
  it("drizzle table file exists at the expected path", () => {
    expect(
      existsSync(resolve(repoRoot, "drizzle/tables/agent-studio-security-graph.ts")),
    ).toBe(true);
  });

  it("schema barrel re-exports the new security-graph tables", () => {
    const src = read("drizzle/schema.ts");
    expect(src).toMatch(/from\s+['"]\.\/tables\/agent-studio-security-graph['"]/);
  });

  it("three tables declared (ingestions, nodes, edges)", () => {
    const src = read("drizzle/tables/agent-studio-security-graph.ts");
    expect(src).toMatch(/agsSecurityGraphIngestions\s*=\s*pgTable\(\s*["']ags_security_graph_ingestions["']/);
    expect(src).toMatch(/agsSecurityGraphNodes\s*=\s*pgTable\(\s*["']ags_security_graph_nodes["']/);
    expect(src).toMatch(/agsSecurityGraphEdges\s*=\s*pgTable\(\s*["']ags_security_graph_edges["']/);
  });

  it("ingestions table uses uniqueIndex on ingestion_id (idempotency anchor)", () => {
    const src = read("drizzle/tables/agent-studio-security-graph.ts");
    expect(src).toMatch(
      /uniqueIndex\(["']idx_ags_security_graph_ingestions_id["']\)[\s\S]*?\.on\([\s\S]*?t\.ingestionId[\s\S]*?\)/,
    );
  });

  it("nodes table uses composite-unique on (ingestion_id, node_id)", () => {
    const src = read("drizzle/tables/agent-studio-security-graph.ts");
    expect(src).toMatch(
      /uniqueIndex\([\s\S]*?["']uq_ags_security_graph_nodes_ingestion_node["'][\s\S]*?\)[\s\S]*?\.on\([\s\S]*?t\.ingestionId,[\s\S]*?t\.nodeId[\s\S]*?\)/,
    );
  });

  it("edges table uses composite-unique on (ingestion_id, edge_id)", () => {
    const src = read("drizzle/tables/agent-studio-security-graph.ts");
    expect(src).toMatch(
      /uniqueIndex\([\s\S]*?["']uq_ags_security_graph_edges_ingestion_edge["'][\s\S]*?\)[\s\S]*?\.on\([\s\S]*?t\.ingestionId,[\s\S]*?t\.edgeId[\s\S]*?\)/,
    );
  });

  it("store imports the new tables + drizzle + getAsDb", () => {
    const src = read(
      "server/agent-studio/services/security-graph/persistence/security-graph-store.ts",
    );
    expect(src).toMatch(/agsSecurityGraphIngestions[\s\S]*agsSecurityGraphNodes[\s\S]*agsSecurityGraphEdges/);
    expect(src).toMatch(/from\s+["']drizzle-orm["']/);
    expect(src).toMatch(/import\s*\{\s*getAsDb\s*\}/);
  });

  it("persistIngestion calls validateSecurityGraphEdgeBatch BEFORE edge upsert", () => {
    const src = read(
      "server/agent-studio/services/security-graph/persistence/security-graph-store.ts",
    );
    const validateIdx = src.indexOf("validateSecurityGraphEdgeBatch(");
    const insertEdgesIdx = src.indexOf(".insert(agsSecurityGraphEdges)");
    expect(validateIdx).toBeGreaterThan(0);
    expect(insertEdgesIdx).toBeGreaterThan(validateIdx);
  });

  it("persistIngestion uses onConflictDoUpdate for ingestion + nodes + edges (3 idempotent upserts)", () => {
    const src = read(
      "server/agent-studio/services/security-graph/persistence/security-graph-store.ts",
    );
    const conflictUpdates = src.match(/onConflictDoUpdate/g) ?? [];
    expect(conflictUpdates.length).toBeGreaterThanOrEqual(3);
  });

  it("PERSIST_BATCH_SIZE = 500 (matches T-G.2.3 — Postgres parameter-cap safe)", () => {
    const src = read(
      "server/agent-studio/services/security-graph/persistence/security-graph-store.ts",
    );
    expect(src).toMatch(/const\s+PERSIST_BATCH_SIZE\s*=\s*500/);
  });

  it("persistence has NO neo4j-driver import (projection owns that boundary)", () => {
    const src = read(
      "server/agent-studio/services/security-graph/persistence/security-graph-store.ts",
    );
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("persistence has NO dispatchMcpToolCall import (CLAUDE.md hard rule)", () => {
    const src = read(
      "server/agent-studio/services/security-graph/persistence/security-graph-store.ts",
    );
    expect(src).not.toMatch(/^import[^\n]*dispatchMcpToolCall/m);
    expect(src).not.toMatch(/dispatchMcpToolCall\(/);
  });

  it("readIngestion fetches both node + edge rows for a given ingestionId", () => {
    const src = read(
      "server/agent-studio/services/security-graph/persistence/security-graph-store.ts",
    );
    expect(src).toMatch(/readIngestion\(ingestionId:\s*string\)/);
    expect(src).toMatch(/from\(agsSecurityGraphNodes\)/);
    expect(src).toMatch(/from\(agsSecurityGraphEdges\)/);
  });

  it("placeholder string from T-G.3.1 is GONE (regression guard)", () => {
    const src = read(
      "server/agent-studio/services/security-graph/persistence/security-graph-store.ts",
    );
    expect(src).not.toMatch(
      /SecurityGraphStore is the T-G\.3\.1 interface contract only/,
    );
  });
});
