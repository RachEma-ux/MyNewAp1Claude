/**
 * Wired AsdbPostgresGraphRepository — source-scan integrity.
 *
 * 2026-05-19: the orphan doc-block on `postgres-graph-repository-asdb.ts`
 * prescribed three closure paths (wire / delete / leave). Path 1 (wire)
 * was taken — `getGraphRepository()` now instantiates
 * `AsdbPostgresGraphRepository` for the `postgres` backend. The
 * earlier 176-LoC skeleton `PostgresGraphRepository` is now
 * unreferenced by the factory.
 *
 * This source-scan locks the wiring at the file level so an accidental
 * revert (someone re-imports the skeleton class + flips `new …()`)
 * is caught even when DB-backed tests are skipped on the device. Pairs
 * with the runtime-side assertion in `item-45-active-backend-selection.test.ts`
 * which pins `repo.constructor.name === "AsdbPostgresGraphRepository"`.
 *
 * Source-scan pattern: read the file, regex-match the invariants, no
 * boot, no DB. Same shape as
 * [[reference-source-scan-integrity-test-pattern]].
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const INDEX_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/graph/repository/index.ts",
);

describe("Wired AsdbPostgresGraphRepository (source-scan)", () => {
  const src = readFileSync(INDEX_PATH, "utf8");

  it("imports AsdbPostgresGraphRepository from the asdb file", () => {
    expect(src).toMatch(
      /import\s+\{\s*AsdbPostgresGraphRepository\s*\}\s+from\s+["']\.\/postgres-graph-repository-asdb\.js["']/,
    );
  });

  it("re-exports AsdbPostgresGraphRepository from the public barrel", () => {
    expect(src).toMatch(
      /export\s+\{\s*AsdbPostgresGraphRepository\s*\}\s+from\s+["']\.\/postgres-graph-repository-asdb\.js["']/,
    );
  });

  it("instantiates AsdbPostgresGraphRepository in the postgres branch", () => {
    expect(src).toMatch(/new\s+AsdbPostgresGraphRepository\s*\(\s*\)/);
  });

  it("does NOT instantiate the skeleton PostgresGraphRepository", () => {
    // The skeleton class is still exported for back-compat consumers
    // (none today). The factory should never construct it.
    expect(src).not.toMatch(/new\s+PostgresGraphRepository\s*\(\s*\)/);
  });

  it("postgres remains the default backend (no auto-promotion to neo4j-ce)", () => {
    // Auto-selecting neo4j-ce on unset env var would break dev boxes
    // without a Neo4j install. The factory must default to postgres.
    expect(src).toMatch(/process\.env\.GRAPH_BACKEND\s*\?\?\s*["']postgres["']/);
  });
});
