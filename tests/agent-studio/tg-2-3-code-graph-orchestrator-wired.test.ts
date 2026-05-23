/**
 * T-G.2.3 — Code Graph Orchestrator wiring.
 *
 * Source-scan integrity test for the orchestrator slice that bridges
 * the parser (T-G.2.2) and the persistence store (T-G.2.1/.3) — and
 * for the `agentStudio.codeGraph.triggerIngest` tRPC mutation that
 * exposes it.
 *
 * The orchestrator does real I/O (filesystem walk + per-file parse +
 * store write) and the parser pulls a native tree-sitter binding, so
 * behavioral tests for the full flow live under the spike +
 * integration suites. This test locks the structural invariants:
 *
 *   - orchestrator/code-graph-orchestrator.ts exists with the
 *     declared shape (input/result interfaces + ingestRepository fn)
 *   - orchestrator/public-api.ts barrel exists and re-exports the
 *     surface
 *   - top-level code-graph public-api re-exports the orchestrator
 *     barrel (so consumers can `import { ingestRepository } from
 *     ".../code-graph/public-api.js"` once)
 *   - the router's triggerIngest mutation lazy-imports through the
 *     barrel (NOT the implementation file) and is wired as an
 *     adminProcedure
 *   - the orchestrator does NOT import tree-sitter / neo4j-driver
 *     directly (it goes through the parser surface; projection lives
 *     elsewhere) — preserves the hard-rule boundaries
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");
const codeGraphRoot = resolve(
  repoRoot,
  "server/agent-studio/services/code-graph",
);

function read(rel: string): string {
  return readFileSync(resolve(codeGraphRoot, rel), "utf8");
}

describe("T-G.2.3 — Code Graph Orchestrator wired", () => {
  it("orchestrator/ directory exists with code-graph-orchestrator.ts + public-api.ts", () => {
    expect(
      existsSync(resolve(codeGraphRoot, "orchestrator/code-graph-orchestrator.ts")),
    ).toBe(true);
    expect(existsSync(resolve(codeGraphRoot, "orchestrator/public-api.ts"))).toBe(true);
  });

  it("orchestrator declares IngestRepositoryInput + IngestRepositoryResult + ingestRepository", () => {
    const src = read("orchestrator/code-graph-orchestrator.ts");
    expect(src).toMatch(/export\s+interface\s+IngestRepositoryInput/);
    expect(src).toMatch(/export\s+interface\s+IngestRepositoryResult/);
    expect(src).toMatch(
      /export\s+async\s+function\s+ingestRepository\s*\(\s*input:\s*IngestRepositoryInput\s*,?\s*\)\s*:\s*Promise<IngestRepositoryResult>/,
    );
  });

  it("orchestrator/public-api.ts re-exports ingestRepository + the two interfaces", () => {
    const src = read("orchestrator/public-api.ts");
    expect(src).toMatch(/ingestRepository/);
    expect(src).toMatch(/IngestRepositoryInput/);
    expect(src).toMatch(/IngestRepositoryResult/);
    expect(src).toMatch(
      /from\s+["']\.\/code-graph-orchestrator\.js["']/,
    );
  });

  it("top-level public-api.ts re-exports the orchestrator barrel", () => {
    const src = read("public-api.ts");
    expect(src).toMatch(/from\s+["']\.\/orchestrator\/public-api\.js["']/);
  });

  it("orchestrator imports parser + persistence through their public-api barrels (not impl files)", () => {
    const src = read("orchestrator/code-graph-orchestrator.ts");
    expect(src).toMatch(/from\s+["']\.\.\/parser\/public-api\.js["']/);
    expect(src).toMatch(/from\s+["']\.\.\/persistence\/public-api\.js["']/);
    expect(src).not.toMatch(
      /from\s+["']\.\.\/parser\/code-graph-parser\.js["']/,
    );
    expect(src).not.toMatch(
      /from\s+["']\.\.\/persistence\/code-graph-store\.js["']/,
    );
  });

  it("orchestrator does NOT import tree-sitter or neo4j-driver directly", () => {
    const src = read("orchestrator/code-graph-orchestrator.ts");
    expect(src).not.toMatch(/from\s+["']tree-sitter/);
    expect(src).not.toMatch(/from\s+["']neo4j-driver/);
  });

  it("orchestrator does NOT import dispatchMcpToolCall or openrouter (tool/model boundaries)", () => {
    // Source-scan the IMPORT lines only — the doc-comment cites the
    // negative invariant by name, so a bare /dispatchMcpToolCall/
    // regex would false-positive on the prose.
    const src = read("orchestrator/code-graph-orchestrator.ts");
    const importLines = src
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      expect(line).not.toMatch(/dispatchMcpToolCall/);
      expect(line).not.toMatch(/openrouter/);
    }
  });

  it("orchestrator caps file scan with maxFiles + maxFileBytes defaults", () => {
    const src = read("orchestrator/code-graph-orchestrator.ts");
    expect(src).toMatch(/DEFAULT_MAX_FILES/);
    expect(src).toMatch(/DEFAULT_MAX_FILE_BYTES/);
  });

  it("orchestrator surfaces per-file failures as ParseError rows (never throws)", () => {
    const src = read("orchestrator/code-graph-orchestrator.ts");
    // Either the io or parser_internal failure mode must be present
    expect(src).toMatch(/reason:\s*["']io_error["']/);
    expect(src).toMatch(/reason:\s*["']parser_internal_error["']/);
    expect(src).toMatch(/reason:\s*["']file_too_large["']/);
  });

  it("router triggerIngest is mounted as an adminProcedure mutation", () => {
    const src = read("code-graph-router.ts");
    // Must include the mutation; must be an admin procedure.
    expect(src).toMatch(/triggerIngest:\s*adminProcedure/);
    expect(src).toMatch(/\.mutation\(/);
  });

  it("router triggerIngest lazy-imports through the orchestrator barrel (not the impl file)", () => {
    const src = read("code-graph-router.ts");
    expect(src).toMatch(
      /await\s+import\(\s*\n?\s*["']\.\/orchestrator\/public-api\.js["']/,
    );
    expect(src).not.toMatch(
      /["']\.\/orchestrator\/code-graph-orchestrator\.js["']/,
    );
  });

  it("router triggerIngest input schema accepts the required + optional fields", () => {
    const src = read("code-graph-router.ts");
    expect(src).toMatch(/repoPath:\s*z\.string\(\)/);
    expect(src).toMatch(/repositoryId:\s*z\.string\(\)/);
    expect(src).toMatch(/relativeSubPath:\s*z\.string\(\)\.optional\(\)/);
    expect(src).toMatch(/maxFiles:\s*z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
    expect(src).toMatch(/maxFileBytes:\s*z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
    expect(src).toMatch(/ingestionId:\s*z\.string\(\)\.optional\(\)/);
  });
});
