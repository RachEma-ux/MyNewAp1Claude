/**
 * Phase 7.5b — Neo4jCommunityGraphRepository production wiring.
 *
 * Source-scan test that locks the production shape of
 * `server/agent-studio/services/graph/repository/neo4j-community-graph-repository.ts`.
 *
 * Pre-7.5b: every method returned hardcoded empty results +
 * `health()` returned "degraded — driver not yet wired". This
 * test locks the post-7.5b production wiring against regression-
 * to-stub:
 *
 *   - executeTemplate resolves via the injected templateResolver
 *     callback + calls executeNeo4jQuery against the result
 *   - applyProjectionJob batches via UNWIND (per T-E.5 finding
 *     that per-statement MERGE doesn't scale; spike measurement
 *     was 38s for 12449 edges, batched expects 100-300× speedup)
 *   - PROJECTION_BATCH_SIZE = 1000 (Neo4j scaling sweet spot)
 *   - Writes group by (kind, typeKey) for static-label MERGE
 *     (Neo4j requires statically resolvable labels)
 *   - delegates to executeNeo4jWrite (NOT direct neo4j-driver)
 *   - health() calls testNeo4jConnection (the wired probe)
 *
 * Boundary preservation: this file MUST NOT import neo4j-driver
 * directly — the existing code-graph-spike-boundary.test.ts
 * already enforces this, but a re-check here makes the
 * 7.5b-specific intent explicit (if a future refactor swaps the
 * KGIA adapter import for a direct driver call, this test fails
 * before merge).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readRepo(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../server/agent-studio/services/graph/repository/neo4j-community-graph-repository.ts",
    ),
    "utf8",
  );
}

describe("Phase 7.5b — Neo4jCommunityGraphRepository wired", () => {
  it("imports executeNeo4jQuery + executeNeo4jWrite + testNeo4jConnection from KGIA adapter", () => {
    const src = readRepo();
    expect(src).toMatch(
      /import\s*\{[\s\S]{0,200}executeNeo4jQuery[\s\S]{0,200}executeNeo4jWrite[\s\S]{0,200}testNeo4jConnection[\s\S]{0,200}\}\s*from\s+["'][^"']*kgia\/infrastructure\/neo4j-adapter\.js["']/,
    );
  });

  it("boundary preserved — no direct neo4j-driver import in the repository file", () => {
    const src = readRepo();
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("declares QueryTemplateResolver callback contract", () => {
    const src = readRepo();
    expect(src).toMatch(/export\s+interface\s+QueryTemplateResolver/);
    expect(src).toMatch(/templateKey:\s*string/);
  });

  it("Neo4jCommunityGraphRepositoryOptions exposes optional templateResolver", () => {
    const src = readRepo();
    expect(src).toMatch(
      /Neo4jCommunityGraphRepositoryOptions[\s\S]{0,400}templateResolver\?\s*:\s*QueryTemplateResolver/,
    );
  });

  it("executeTemplate resolves via templateResolver + calls executeNeo4jQuery (NOT a stub return)", () => {
    const src = readRepo();
    expect(src).toMatch(/await\s+resolver\(input\.templateKey\)/);
    expect(src).toMatch(/await\s+executeNeo4jQuery\(source,\s*limited,/);
    expect(src).toMatch(/templateVersion:\s*template\.version/);
  });

  it("executeTemplate returns templateVersion 'no-resolver' when no resolver injected", () => {
    const src = readRepo();
    expect(src).toMatch(/templateVersion:\s*"no-resolver"/);
    expect(src).toMatch(/templateVersion:\s*"not-found"/);
  });

  it("PROJECTION_BATCH_SIZE = 1000 (Neo4j scaling sweet spot per T-E.5 carry-forward)", () => {
    const src = readRepo();
    expect(src).toMatch(/const\s+PROJECTION_BATCH_SIZE\s*=\s*1000/);
  });

  it("applyProjectionJob buckets writes by (kind, typeKey) for static-label MERGE", () => {
    const src = readRepo();
    expect(src).toMatch(/const\s+key\s*=\s*`\$\{w\.kind\}\|\$\{typeKey\}`/);
    expect(src).toMatch(/buckets\s*=\s*new\s+Map<string,\s*ProjectionWrite\[\]>/);
  });

  it("applyProjectionJob iterates batches of PROJECTION_BATCH_SIZE", () => {
    const src = readRepo();
    expect(src).toMatch(/i\s*\+=\s*PROJECTION_BATCH_SIZE/);
    expect(src).toMatch(/group\.slice\(i,\s*i\s*\+\s*PROJECTION_BATCH_SIZE\)/);
  });

  it("batchUpsertNodes uses UNWIND $rows AS row + MERGE with static label", () => {
    const src = readRepo();
    expect(src).toMatch(/UNWIND\s+\$rows\s+AS\s+row/);
    expect(src).toMatch(/MERGE\s+\(n:\\?`\$\{label\}\\?`\s+\{\s*id:\s*row\.id\s*\}\)/);
    expect(src).toMatch(/ON CREATE SET[\s\S]*?ON MATCH SET/);
  });

  it("batchUpsertEdges uses UNWIND + MATCH both endpoints + MERGE with static relType", () => {
    const src = readRepo();
    expect(src).toMatch(/MATCH\s+\(s\s*\{\s*id:\s*row\.sourceId\s*\}\)/);
    expect(src).toMatch(/MATCH\s+\(t\s*\{\s*id:\s*row\.targetId\s*\}\)/);
    expect(src).toMatch(/MERGE\s+\(s\)-\[r:\\?`\$\{relType\}\\?`\]->\(t\)/);
  });

  it("writes delegate to executeNeo4jWrite (NOT executeNeo4jQuery — preserves read/write split)", () => {
    const src = readRepo();
    // Three write paths: nodes / edges / delete-nodes / delete-edges
    // — each must call executeNeo4jWrite
    const writeCalls = src.match(/executeNeo4jWrite\(/g) ?? [];
    expect(writeCalls.length).toBeGreaterThanOrEqual(4);
  });

  it("sanitizeNeo4jIdentifier defends against typeKey injection (label interpolation)", () => {
    const src = readRepo();
    expect(src).toMatch(
      /function\s+sanitizeNeo4jIdentifier\(raw:\s*string\):\s*string/,
    );
    expect(src).toMatch(/replace\(\/\[\^A-Za-z0-9_\]\/g/);
  });

  it("health() calls testNeo4jConnection (NOT a stub 'degraded — driver not yet wired')", () => {
    const src = readRepo();
    expect(src).toMatch(/await\s+testNeo4jConnection\(source\)/);
    expect(src).toMatch(/status:\s*"ok"/);
    expect(src).toMatch(/status:\s*"down"/);
    // Negative: the pre-7.5b stub string must be GONE.
    expect(src).not.toMatch(/neo4j-ce driver not yet wired/);
  });

  it("ensureLimit appends LIMIT clause when template doesn't already cap", () => {
    const src = readRepo();
    expect(src).toMatch(/function\s+ensureLimit/);
    expect(src).toMatch(/\/\\blimit\\s\+\\d\+\\b\/i/);
    expect(src).toMatch(/LIMIT\s+\$__max_results/);
  });

  it("module header references Phase 7.5 blocker doc + T-E.5 carry-forward (traceability)", () => {
    const src = readRepo();
    expect(src).toMatch(/agent-studio-phase-7-5-neo4j-blocker\.md/);
    expect(src).toMatch(/T-E\.5/);
    expect(src).toMatch(/batched UNWIND/);
  });
});
