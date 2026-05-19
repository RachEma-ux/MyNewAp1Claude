/**
 * upsertEdge — onConflictDoUpdate dedup invariant — source-scan.
 *
 * Slice 4 of the no-deferral TODO catalogue (2026-05-19). Locks the
 * `(type_key, edge_key)` partial-unique-index dedup contract so
 * accidental reverts (drop the onConflictDoUpdate, drop the unique
 * index, re-introduce duplicate edge rows) are caught even when
 * DB-backed integration tests are skipped on the device.
 *
 * Pairs with the manual migration at
 * `scripts/migrations/manual/ags-graph-edges-unique.sql`.
 *
 * Source-scan pattern — read the file, regex-match the invariants,
 * no DB, no boot. Same shape as
 * [[reference-source-scan-integrity-test-pattern]].
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

describe("upsertEdge dedup — Drizzle schema invariant", () => {
  const src = readFileSync(
    join(REPO_ROOT, "drizzle/tables/agent-studio-graph.ts"),
    "utf8",
  );

  it("declares a partial unique index on (typeKey, edgeKey)", () => {
    // The index must be partial — null edgeKeys (legacy/derived
    // computed edges) cannot participate in dedup.
    expect(src).toMatch(
      /typeEdgeKeyIdx:\s*uniqueIndex\(["']idx_ags_graph_edges_type_edge_key["']\)\s*\.on\(t\.typeKey,\s*t\.edgeKey\)\s*\.where\(/,
    );
    expect(src).toMatch(/IS NOT NULL/);
  });

  it("imports drizzle-orm sql tag for the .where partial-index predicate", () => {
    expect(src).toMatch(/import\s+\{\s*sql\s*\}\s+from\s+["']drizzle-orm["']/);
  });
});

describe("upsertEdge dedup — repository implementation", () => {
  const src = readFileSync(
    join(
      REPO_ROOT,
      "server/agent-studio/services/graph/repository/postgres-graph-repository-asdb.ts",
    ),
    "utf8",
  );
  const start = src.indexOf("async upsertEdge(");
  expect(start).toBeGreaterThan(-1);
  const afterStart = src.indexOf("\n  async ", start + 1);
  const end = afterStart === -1 ? src.length : afterStart;
  const method = src.slice(start, end);

  it("uses onConflictDoUpdate when edgeKey is set", () => {
    expect(method).toMatch(/if \(edge\.id\)/);
    expect(method).toMatch(/\.onConflictDoUpdate\(\{/);
    expect(method).toMatch(
      /target:\s*\[agsGraphEdges\.typeKey,\s*agsGraphEdges\.edgeKey\]/,
    );
  });

  it("updates source/target/version/governance/updatedAt on conflict", () => {
    expect(method).toMatch(/sourceNodeId:\s*sourceId/);
    expect(method).toMatch(/targetNodeId:\s*targetId/);
    expect(method).toMatch(/sourceVersionId:\s*edge\.provenance\.sourceVersionId/);
    expect(method).toMatch(/governanceStatus:\s*edge\.provenance\.governanceStatus/);
    expect(method).toMatch(/updatedAt:\s*new Date\(\)/);
  });

  it("falls back to blind insert when edgeKey is null (legacy/derived edges)", () => {
    expect(method).toMatch(/edgeKey:\s*null/);
  });
});

describe("upsertEdge dedup — manual migration script", () => {
  const path = join(
    REPO_ROOT,
    "scripts/migrations/manual/ags-graph-edges-unique.sql",
  );

  it("ships at the documented manual-migration path", () => {
    expect(existsSync(path)).toBe(true);
  });

  const sql = readFileSync(path, "utf8");

  it("deletes duplicate non-null edge_key rows before creating the unique index", () => {
    expect(sql).toMatch(/ROW_NUMBER\(\) OVER \(/);
    expect(sql).toMatch(/PARTITION BY type_key, edge_key/);
    expect(sql).toMatch(/DELETE FROM ags_graph_edges/);
  });

  it("creates the partial unique index with the same name as the drizzle declaration", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_ags_graph_edges_type_edge_key/,
    );
    expect(sql).toMatch(/WHERE edge_key IS NOT NULL/);
  });

  it("is wrapped in a single transaction (BEGIN / COMMIT)", () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });
});
