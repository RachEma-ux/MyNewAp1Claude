/**
 * Graph Lens Registry — Phase 24 §T-F.1 (remaining execution plan).
 *
 * Tests the registry primitive that Phase 24 T-F.2..T-F.5 hangs off.
 * Closed taxonomy + idempotency policy + boundary integrity.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  GRAPH_LENS_KINDS,
  GRAPH_LENS_LAYOUTS,
  GRAPH_LENS_GOVERNANCE_SCOPES,
  isGraphLensKind,
  registerGraphLens,
  getGraphLens,
  listGraphLenses,
  listGraphLensesByKind,
  getGraphLensRegistrySize,
  __resetGraphLensRegistryForTests,
  GraphLensIdAlreadyRegisteredError,
  type GraphLensDefinition,
} from "../../server/agent-studio/services/graph-lens/public-api";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

beforeEach(() => {
  __resetGraphLensRegistryForTests();
});

describe("Closed lens-kind taxonomy", () => {
  it("contains exactly the 8 roadmap-named kinds", () => {
    expect([...GRAPH_LENS_KINDS]).toEqual([
      "rag",
      "rac",
      "cag",
      "graph_skill",
      "mcp",
      "governance",
      "runtime",
      "institutional_memory",
    ]);
  });

  it("isGraphLensKind narrows to the closed taxonomy", () => {
    expect(isGraphLensKind("rag")).toBe(true);
    expect(isGraphLensKind("governance")).toBe(true);
    expect(isGraphLensKind("custom_lens")).toBe(false);
    expect(isGraphLensKind(42)).toBe(false);
    expect(isGraphLensKind(undefined)).toBe(false);
  });
});

describe("Closed layout taxonomy", () => {
  it("contains exactly 5 layouts", () => {
    expect([...GRAPH_LENS_LAYOUTS]).toEqual([
      "force_directed",
      "tree",
      "matrix",
      "timeline",
      "dependency_path",
    ]);
  });
});

describe("Closed governance-scope taxonomy", () => {
  it("contains exactly 4 scopes", () => {
    expect([...GRAPH_LENS_GOVERNANCE_SCOPES]).toEqual([
      "workspace_public",
      "workspace_members",
      "approver_only",
      "admin_only",
    ]);
  });
});

function makeLens(
  id: string,
  overrides: Partial<GraphLensDefinition> = {},
): GraphLensDefinition {
  return {
    id,
    kind: "rag",
    label: id,
    layout: "force_directed",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

describe("registerGraphLens + lookups", () => {
  it("registers a lens and round-trips it via getGraphLens", () => {
    const def = makeLens("rag_default");
    registerGraphLens(def);
    expect(getGraphLens("rag_default")).toEqual(def);
  });

  it("returns undefined for an unregistered id", () => {
    expect(getGraphLens("nonexistent")).toBeUndefined();
  });

  it("listGraphLenses returns insertion order", () => {
    registerGraphLens(makeLens("a"));
    registerGraphLens(makeLens("b"));
    registerGraphLens(makeLens("c"));
    const ids = listGraphLenses().map((d) => d.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("listGraphLensesByKind filters correctly", () => {
    registerGraphLens(makeLens("r1", { kind: "rag" }));
    registerGraphLens(makeLens("g1", { kind: "governance" }));
    registerGraphLens(makeLens("r2", { kind: "rag" }));
    const ragIds = listGraphLensesByKind("rag").map((d) => d.id);
    expect(ragIds).toEqual(["r1", "r2"]);
    const govIds = listGraphLensesByKind("governance").map((d) => d.id);
    expect(govIds).toEqual(["g1"]);
  });

  it("getGraphLensRegistrySize reflects count", () => {
    expect(getGraphLensRegistrySize()).toBe(0);
    registerGraphLens(makeLens("a"));
    expect(getGraphLensRegistrySize()).toBe(1);
    registerGraphLens(makeLens("b"));
    expect(getGraphLensRegistrySize()).toBe(2);
  });
});

describe("Idempotency policy: re-registering same id throws", () => {
  it("throws GraphLensIdAlreadyRegisteredError on duplicate id", () => {
    registerGraphLens(makeLens("dup"));
    expect(() => registerGraphLens(makeLens("dup", { label: "different" }))).toThrow(
      GraphLensIdAlreadyRegisteredError,
    );
  });

  it("error message names the conflicting id", () => {
    registerGraphLens(makeLens("oops"));
    try {
      registerGraphLens(makeLens("oops"));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GraphLensIdAlreadyRegisteredError);
      expect((err as Error).message).toContain('id="oops"');
    }
  });

  it("first registration wins (lookup returns original)", () => {
    const first = makeLens("conflict", { label: "first" });
    registerGraphLens(first);
    try {
      registerGraphLens(makeLens("conflict", { label: "second" }));
    } catch {
      /* expected */
    }
    expect(getGraphLens("conflict")).toEqual(first);
  });
});

describe("Reset helper", () => {
  it("__resetGraphLensRegistryForTests empties the registry", () => {
    registerGraphLens(makeLens("a"));
    expect(getGraphLensRegistrySize()).toBe(1);
    __resetGraphLensRegistryForTests();
    expect(getGraphLensRegistrySize()).toBe(0);
    expect(listGraphLenses()).toEqual([]);
  });
});

// ============================================================================
// Source-scan boundary tests (Layer 13 — lens permission-leak defense)
// ============================================================================

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("Source-scan: graph-lens service boundary", () => {
  const lensDir = resolve(
    __dirname,
    "../../server/agent-studio/services/graph-lens",
  );

  it("registry + contracts have no neo4j-driver import", () => {
    if (!existsSync(lensDir)) return;
    for (const f of walk(lensDir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/from\s+["']neo4j-driver/);
    }
  });

  it("registry + contracts have no dispatchMcpToolCall import", () => {
    if (!existsSync(lensDir)) return;
    for (const f of walk(lensDir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = readFileSync(f, "utf8");
      // Match only actual import statements, not comment mentions
      // (the contract file documents the boundary in its docblock).
      expect(src).not.toMatch(
        /^\s*import[\s\S]*?dispatchMcpToolCall/m,
      );
    }
  });

  it("registry + contracts have no openrouter import", () => {
    if (!existsSync(lensDir)) return;
    for (const f of walk(lensDir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/from\s+["'][^"']*openrouter/);
    }
  });

  it("registry + contracts have no process.env.*_API_KEY reads", () => {
    if (!existsSync(lensDir)) return;
    for (const f of walk(lensDir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
    }
  });
});
