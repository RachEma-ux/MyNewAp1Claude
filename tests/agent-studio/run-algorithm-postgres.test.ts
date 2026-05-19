/**
 * runAlgorithm (postgres backend) — source-scan integrity.
 *
 * Slice 7 of the no-deferral catalogue (2026-05-19). Replaces the
 * `return { rows: [], durationMs: 0 }` stub with full closed-taxonomy
 * coverage of GraphAlgorithmKey:
 *   - shortest_path → delegates to this.shortestPath
 *   - centrality → degree centrality via SQL aggregation
 *   - community_detection → weakly-connected components via recursive CTE
 *   - blast_radius → BFS depth-N reachable-node counts
 *   - similarity → Jaccard over neighbor sets
 * Unknown keys throw operator-actionable errors (not empty rows).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_PATH = join(
  process.cwd(),
  "server/agent-studio/services/graph/repository/postgres-graph-repository-asdb.ts",
);

describe("AsdbPostgresGraphRepository.runAlgorithm — source-scan", () => {
  const src = readFileSync(REPO_PATH, "utf8");
  const start = src.indexOf("async runAlgorithm(");
  expect(start).toBeGreaterThan(-1);
  const afterStart = src.indexOf("\n  async ", start + 1);
  const end = afterStart === -1 ? src.length : afterStart;
  const method = src.slice(start, end);

  it("no longer ships the empty-rows stub", () => {
    expect(method).not.toMatch(/^\s*async runAlgorithm\(\)\s*\{[\s\S]*?return\s*\{\s*rows:\s*\[\],\s*durationMs:\s*0\s*\}/);
  });

  it("imports GraphAlgorithmInput + GraphAlgorithmResult from ./types", () => {
    expect(src).toMatch(/GraphAlgorithmInput[^}]*\}/);
    expect(src).toMatch(/GraphAlgorithmResult/);
  });

  it("covers all 5 GraphAlgorithmKey enum values", () => {
    expect(method).toMatch(/case ["']shortest_path["']/);
    expect(method).toMatch(/case ["']centrality["']/);
    expect(method).toMatch(/case ["']community_detection["']/);
    expect(method).toMatch(/case ["']blast_radius["']/);
    expect(method).toMatch(/case ["']similarity["']/);
  });

  it("throws on unknown algorithmKey (no empty-rows fallback)", () => {
    expect(method).toMatch(/default:\s*\{/);
    expect(method).toMatch(/unsupported algorithmKey/);
  });

  it("shortest_path delegates to this.shortestPath (no duplicate CTE)", () => {
    expect(method).toMatch(/this\.shortestPath\(from, to, input\.runtime\)/);
  });

  it("centrality computes degree via LEFT JOIN + COUNT", () => {
    expect(method).toMatch(/LEFT JOIN \$\{agsGraphEdges\}/);
    expect(method).toMatch(/COUNT\(e\.id\)\s+AS degree/);
    expect(method).toMatch(/ORDER BY degree DESC/);
  });

  it("community_detection uses recursive CTE with undirected adjacency", () => {
    expect(method).toMatch(/WITH RECURSIVE adj AS/);
    expect(method).toMatch(/components AS/);
    expect(method).toMatch(/LEAST\(c\.component_root, adj\.b\)/);
  });

  it("blast_radius caps depth at 6 and requires a seed", () => {
    expect(method).toMatch(/Math\.min\(Number\(input\.parameters\.maxDepth \?\? 3\), 6\)/);
    expect(method).toMatch(/missing 'seed' parameter/);
  });

  it("similarity computes Jaccard with explicit intersection + union", () => {
    expect(method).toMatch(/INTERSECT/);
    expect(method).toMatch(/UNION/);
    expect(method).toMatch(/jaccard/);
    expect(method).toMatch(/missing 'a' or 'b' seed parameter/);
  });

  it("applies governance filter to every algorithm path", () => {
    // Each `case` branch should reference govList. Five cases, so at
    // least 5 matches expected.
    const matches = method.match(/IN \(\$\{govList\}\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  it("computes durationMs consistently across branches", () => {
    expect(method).toMatch(/const startedAt = Date\.now\(\)/);
    const dmMatches = method.match(/durationMs:\s*Date\.now\(\) - startedAt/g) ?? [];
    expect(dmMatches.length).toBeGreaterThanOrEqual(5);
  });
});
