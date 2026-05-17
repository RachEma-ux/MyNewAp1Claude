/**
 * Phase 7.5a — Neo4jKgiaAdapter wired against real `neo4j-driver`.
 *
 * Source-scan test that locks the production shape of
 * `server/modules/kgia/infrastructure/neo4j-adapter.ts`:
 *
 *   - imports `neo4j-driver` (the production wire — pre-7.5a
 *     this file was a stub with no driver import)
 *   - exposes a driver cache so concurrent callers reuse the
 *     same Driver instance per (endpoint, username, database)
 *   - exports `closeAllNeo4jDrivers` for graceful shutdown
 *   - `executeNeo4jQuery` calls `session.run(...)` (not a stubbed
 *     return)
 *   - `testNeo4jConnection` calls `driver.verifyConnectivity()`
 *   - `readNeo4jSchema` falls through to `CALL db.schema.visualization()`
 *     when no `schemaSnapshot` is cached
 *
 * Live integration testing happens via the existing
 * `graph-bench-neo4j-ce.yml` workflow + future T-E.6 / T-G.2.4
 * runs that exercise the wired path against a Neo4j 5 CE service
 * container. This test ships the structural invariants so a
 * future regression that silently restores stub behavior fails
 * before merge.
 *
 * Phase 7.5 blocker doc: docs/architecture/agent-studio-phase-7-5-neo4j-blocker.md
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readAdapter(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../server/modules/kgia/infrastructure/neo4j-adapter.ts",
    ),
    "utf8",
  );
}

describe("Phase 7.5a — Neo4jKgiaAdapter wired against neo4j-driver", () => {
  it("imports neo4j-driver (the production wire — pre-7.5a was stub)", () => {
    const src = readAdapter();
    expect(src).toMatch(/import\s+neo4j\s+from\s+["']neo4j-driver["']/);
    // Driver type is derived from neo4j.driver's return type because
    // neo4j-driver 5.x exports `Driver` as both class + namespace,
    // which trips TS2709 if imported directly.
    expect(src).toMatch(/type\s+Driver\s*=\s*ReturnType<typeof\s+neo4j\.driver>/);
  });

  it("declares a driverCache map keyed by (endpoint, username, database)", () => {
    const src = readAdapter();
    expect(src).toMatch(/const\s+driverCache\s*=\s*new\s+Map<string,\s*Driver>\(\)/);
    expect(src).toMatch(
      /function\s+driverKey\(config:\s*Neo4jConnectionConfig\)\s*:\s*string/,
    );
  });

  it("getDriver helper lazy-inits + caches per-config Driver instances", () => {
    const src = readAdapter();
    expect(src).toMatch(/function\s+getDriver\(config:\s*Neo4jConnectionConfig\)\s*:\s*Driver/);
    expect(src).toMatch(/driverCache\.get\(key\)/);
    expect(src).toMatch(/driverCache\.set\(key,\s*driver\)/);
    expect(src).toMatch(/neo4j\.driver\(config\.endpoint,\s*auth\)/);
  });

  it("exports closeAllNeo4jDrivers for graceful shutdown", () => {
    const src = readAdapter();
    expect(src).toMatch(
      /export\s+async\s+function\s+closeAllNeo4jDrivers\(\)\s*:\s*Promise<void>/,
    );
    expect(src).toMatch(/driverCache\.clear\(\)/);
    expect(src).toMatch(/d\.close\(\)/);
  });

  it("executeNeo4jQuery uses session.run (NOT a stub return)", () => {
    const src = readAdapter();
    // The pre-7.5a stub returned `{ records: [], summary: { ... } }`
    // hardcoded. The wired version must call session.run.
    expect(src).toMatch(/await\s+session\.run\(queryText,\s*params\s*\?\?\s*\{\}\)/);
    expect(src).toMatch(/defaultAccessMode:\s*mode/);
    // READ is the default for the read-mode export
    expect(src).toMatch(/neo4j\.session\.READ/);
  });

  it("Phase 7.5b adds executeNeo4jWrite (WRITE-mode sibling for projection writes)", () => {
    const src = readAdapter();
    expect(src).toMatch(
      /export\s+async\s+function\s+executeNeo4jWrite\(/,
    );
    expect(src).toMatch(/neo4j\.session\.WRITE/);
  });

  it("testNeo4jConnection calls driver.verifyConnectivity()", () => {
    const src = readAdapter();
    expect(src).toMatch(/await\s+driver\.verifyConnectivity\(\)/);
    // And fetches the actual running version via dbms.components()
    expect(src).toMatch(/CALL\s+dbms\.components\(\)/);
  });

  it("readNeo4jSchema falls through to CALL db.schema.visualization() when no snapshot", () => {
    const src = readAdapter();
    expect(src).toMatch(/if\s*\(source\.schemaSnapshot\)/);
    expect(src).toMatch(/await\s+session\.run\(\s*["']CALL\s+db\.schema\.visualization\(\)["']/);
  });

  it("session.close() in finally blocks (no leaks)", () => {
    const src = readAdapter();
    // Three session-using callers: executeNeo4jQuery, testNeo4jConnection
    // (inner session in success path), readNeo4jSchema. Each must close().
    const closeMatches = src.match(/await\s+session\.close\(\)/g) ?? [];
    expect(closeMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("neo4j-driver boundary preserved — file lives at the allowed path", () => {
    // The CLAUDE.md hard rule permits neo4j-driver imports in
    // `server/modules/kgia/**` and `server/agent-studio/services/graph/repository/**`.
    // This adapter is at the former path. We don't re-test the
    // negative side (already covered by code-graph-spike-boundary.test.ts);
    // here we just assert this file's path matches the allowed surface.
    const src = readAdapter();
    expect(src).toMatch(/from\s+["']neo4j-driver["']/);
    // Plus an inline doc-block reminder so a future grep for the
    // boundary rule lands here.
    expect(src).toMatch(/CLAUDE\.md|hard.rule|allowlist/i);
  });

  it("Phase 7.5 blocker doc referenced in module header (traceability)", () => {
    const src = readAdapter();
    expect(src).toMatch(/Phase 7\.5/);
    expect(src).toMatch(/agent-studio-phase-7-5-neo4j-blocker\.md/);
  });
});
