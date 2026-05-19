/**
 * shortestPath recursive-CTE — source-scan integrity.
 *
 * Slice 5 of the no-deferral catalogue (2026-05-19). Replaces the
 * `return null` stub in AsdbPostgresGraphRepository.shortestPath.
 *
 * Locks the SQL shape (BFS via recursive CTE, cycle guard via
 * `NOT (id = ANY(path_ids))`, depth cap at 6, governance filter on
 * both nodes + edges) and the two-step hydration round-trip
 * (node identities + edge identities by row id).
 *
 * Source-scan pattern — read the file, regex-match invariants, no
 * boot, no DB. Same shape as
 * [[reference-source-scan-integrity-test-pattern]].
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_PATH = join(
  process.cwd(),
  "server/agent-studio/services/graph/repository/postgres-graph-repository-asdb.ts",
);

describe("AsdbPostgresGraphRepository.shortestPath — source-scan", () => {
  const src = readFileSync(REPO_PATH, "utf8");
  const start = src.indexOf("async shortestPath(");
  expect(start).toBeGreaterThan(-1);
  const afterStart = src.indexOf("\n  async ", start + 1);
  const end = afterStart === -1 ? src.length : afterStart;
  const method = src.slice(start, end);

  it("no longer returns the null stub", () => {
    expect(method).not.toMatch(/^\s*async shortestPath\([^)]*\)\s*:[^{]*\{\s*return null;\s*\}/);
  });

  it("short-circuits from === to with a length-0 path", () => {
    expect(method).toMatch(/if \(from === to\)/);
    expect(method).toMatch(/length:\s*0/);
  });

  it("uses a recursive CTE walking both edge directions (undirected adjacency)", () => {
    expect(method).toMatch(/WITH RECURSIVE walk AS/);
    expect(method).toMatch(/e\.source_node_id = w\.node_id OR e\.target_node_id = w\.node_id/);
  });

  it("tracks the full path via accumulating arrays (path_ids + edge_ids)", () => {
    expect(method).toMatch(/path_ids/);
    expect(method).toMatch(/edge_ids/);
    expect(method).toMatch(/w\.path_ids \|\| n\.id/);
    expect(method).toMatch(/w\.edge_ids \|\| e\.id/);
  });

  it("guards against cycles without requiring PG14+ WITH RECURSIVE CYCLE", () => {
    expect(method).toMatch(/NOT \(n\.id = ANY\(w\.path_ids\)\)/);
  });

  it("caps recursion depth at the documented postgres performance ceiling", () => {
    expect(method).toMatch(/const maxDepth = 6/);
    expect(method).toMatch(/w\.depth < \$\{maxDepth\}/);
  });

  it("applies the governance filter to both endpoint nodes AND the edges", () => {
    expect(method).toMatch(/n\.governance_status IN \(\$\{govList\}\)/);
    expect(method).toMatch(/e\.governance_status IN \(\$\{govList\}\)/);
  });

  it("returns the shortest path (ORDER BY depth ASC LIMIT 1)", () => {
    expect(method).toMatch(/ORDER BY depth ASC/);
    expect(method).toMatch(/LIMIT 1/);
  });

  it("hydrates node identities in a separate single round-trip", () => {
    expect(method).toMatch(
      /SELECT id, type_key, node_key\s*\n\s*FROM \$\{agsGraphNodes\}/,
    );
  });

  it("hydrates edge identities in a separate round-trip with both endpoints joined", () => {
    expect(method).toMatch(/sn\.type_key AS src_type/);
    expect(method).toMatch(/tn\.type_key AS tgt_type/);
  });

  it("preserves path order — nodes mapped from pathIds order, edges from edgeIds order", () => {
    expect(method).toMatch(
      /pathIds\s*\.map\(\(id\) => nodeById\.get\(id\)\)/,
    );
    expect(method).toMatch(
      /edgeIds\s*\.map\(\(id\) => edgeByRowId\.get\(id\)\)/,
    );
  });
});
