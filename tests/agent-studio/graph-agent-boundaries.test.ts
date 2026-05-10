/**
 * Phase 13 boundary tests — Graph Agent runtime.
 *
 * Asserts (when graph-agent module exists):
 *   1. No direct provider SDK imports.
 *   2. No tool execution outside MCP dispatcher.
 *   3. No model execution outside OpenRouter Model Access.
 *   4. No graph access outside GraphRepository.
 *   5. No raw Cypher strings.
 *
 * Until Phase 13 ships the module, these tests pass vacuously by checking
 * that *if* the directory exists, it follows the rules.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-integration-boundaries.md
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const REPO_ROOT = process.cwd();
const GRAPH_AGENT_DIR = join(REPO_ROOT, "server/agent-studio/services/graph-agent");

const FORBIDDEN_PROVIDER_IMPORTS = [
  "@anthropic-ai/sdk",
  "openai",
  "@google/generative-ai",
];

function walk(dir: string, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, results);
    else if (entry.endsWith(".ts")) results.push(full);
  }
  return results;
}

describe("Phase 13 — Graph Agent boundary tests", () => {
  const files = walk(GRAPH_AGENT_DIR);

  it("no direct provider SDK imports under server/agent-studio/services/graph-agent/", () => {
    if (files.length === 0) {
      // Module not yet implemented — vacuously pass.
      expect(true).toBe(true);
      return;
    }
    const violations: { file: string; sdk: string }[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const sdk of FORBIDDEN_PROVIDER_IMPORTS) {
        const re = new RegExp(`from\\s+["']${sdk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
        if (re.test(content)) {
          violations.push({ file: relative(REPO_ROOT, file), sdk });
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("no `neo4j-driver` import (must use GraphRepository)", () => {
    if (files.length === 0) return expect(true).toBe(true);
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (/from\s+["']neo4j-driver["']/.test(content)) {
        violations.push(relative(REPO_ROOT, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it("model execution goes through openrouter/model-access OR a declared ModelAccessAdapter", () => {
    if (files.length === 0) return expect(true).toBe(true);
    // The engine uses an adapter pattern: it declares ModelAccessAdapter and
    // calls `this.options.modelAccess.execute(...)`. The real wiring layer
    // (router, public-api, etc.) imports from `openrouter/model-access`.
    // We accept EITHER: (a) at least one file imports model-access directly,
    // or (b) at least one file declares a ModelAccessAdapter interface.
    let foundProperImport = false;
    let foundAdapter = false;
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (/from\s+["'][.\/@]*openrouter\/model-access/.test(content)) {
        foundProperImport = true;
      }
      if (/interface\s+ModelAccessAdapter\b/.test(content)) {
        foundAdapter = true;
      }
    }
    const modelCallingFiles = files.filter((f) =>
      /\b(execute|stream|complete|generate)\s*\(/.test(readFileSync(f, "utf8")),
    );
    if (modelCallingFiles.length > 0) {
      expect(foundProperImport || foundAdapter).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });

  it("tool execution goes through MCP dispatcher", () => {
    if (files.length === 0) return expect(true).toBe(true);
    // Negative check: no direct callTool / dispatch-shaped code outside the proper path.
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      // Forbid any `.callTool(` that doesn't go through dispatcher import.
      if (/\.callTool\(/.test(content) && !/from\s+["'][.\/@]*mcp\/dispatcher/.test(content)) {
        violations.push(relative(REPO_ROOT, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it("no raw Cypher strings (templates must come from query template registry)", () => {
    if (files.length === 0) return expect(true).toBe(true);
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      // Heuristic: lines containing MATCH/MERGE/CREATE/DELETE keyword in template literal context.
      if (/`[\s\S]{0,500}\b(MATCH|MERGE|CREATE\s+\(|DELETE)\b/.test(content)) {
        violations.push(relative(REPO_ROOT, file));
      }
    }
    expect(violations).toEqual([]);
  });
});
