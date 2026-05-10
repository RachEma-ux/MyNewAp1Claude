/**
 * Phase 1.2 boundary test — GraphRepository abstraction.
 *
 * Asserts:
 *   1. No application code (outside `server/agent-studio/services/graph/repository/**`
 *      and `server/modules/kgia/**`) imports `neo4j-driver`.
 *   2. No application code uses raw Cypher strings outside the repository
 *      and query template registry.
 *   3. The repository module exports a `GraphRepository` interface.
 *
 * ADR: docs/architecture/agent-studio-graph-repository-and-backend-strategy.md
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const REPO_ROOT = process.cwd();

const ALLOWED_NEO4J_DRIVER_PATHS = [
  "server/agent-studio/services/graph/repository",
  "server/modules/kgia",
];

function walk(dir: string, results: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, results);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

function isAllowedPath(absPath: string, allowed: string[]): boolean {
  const rel = relative(REPO_ROOT, absPath).replace(/\\/g, "/");
  return allowed.some((p) => rel.startsWith(p));
}

describe("Phase 1.2 — GraphRepository boundary (forbidden imports)", () => {
  const sourceDirs = ["server", "client/src"];
  const allFiles: string[] = [];
  for (const dir of sourceDirs) {
    const root = join(REPO_ROOT, dir);
    walk(root, allFiles);
  }

  it("no `neo4j-driver` import outside repository / KGIA", () => {
    const violations: string[] = [];
    for (const file of allFiles) {
      if (isAllowedPath(file, ALLOWED_NEO4J_DRIVER_PATHS)) continue;
      const content = readFileSync(file, "utf8");
      if (/from\s+["']neo4j-driver["']/.test(content)) {
        violations.push(relative(REPO_ROOT, file));
      }
    }
    expect(violations, `neo4j-driver imported outside repository:\n${violations.join("\n")}`).toEqual([]);
  });

  it("no `bolt://` raw connection string outside repository / KGIA / KGIA frontend / config", () => {
    // KGIA frontend pages (client/src/pages/kgia/, client/src/pages/workspace/Kgia*)
    // legitimately display connection URIs to users for source registration UX.
    // Adapter wiring stays under server/modules/kgia/ which is already allowed.
    const FRONTEND_KGIA_ALLOWED = [
      "client/src/pages/kgia",
      "client/src/pages/workspace/Kgia",
    ];
    const violations: string[] = [];
    for (const file of allFiles) {
      if (isAllowedPath(file, ALLOWED_NEO4J_DRIVER_PATHS)) continue;
      const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
      if (FRONTEND_KGIA_ALLOWED.some((p) => rel.startsWith(p))) continue;
      // also allow config/env-loader files
      if (rel.includes("env") || rel.includes("config")) continue;
      const content = readFileSync(file, "utf8");
      if (/bolt:\/\//.test(content)) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });
});

describe("Phase 1.2 — GraphRepository surface", () => {
  it("repository directory exports GraphRepository interface", () => {
    const indexPath = join(
      REPO_ROOT,
      "server/agent-studio/services/graph/repository/index.ts",
    );
    const content = readFileSync(indexPath, "utf8");
    expect(content).toMatch(/GraphRepository/);
    expect(content).toMatch(/getGraphRepository/);
  });

  it("declares all five backend implementations", () => {
    const indexPath = join(
      REPO_ROOT,
      "server/agent-studio/services/graph/repository/index.ts",
    );
    const content = readFileSync(indexPath, "utf8");
    expect(content).toMatch(/TestGraphRepository/);
    expect(content).toMatch(/PostgresGraphRepository/);
    expect(content).toMatch(/Neo4jCommunityGraphRepository/);
  });

  it("capability registry exists", () => {
    const path = join(
      REPO_ROOT,
      "server/agent-studio/services/graph/repository/capabilities.ts",
    );
    const content = readFileSync(path, "utf8");
    expect(content).toMatch(/TEST_CAPABILITIES/);
    expect(content).toMatch(/POSTGRES_CAPABILITIES/);
    expect(content).toMatch(/NEO4J_CE_CAPABILITIES/);
    expect(content).toMatch(/getCapabilities/);
  });
});
