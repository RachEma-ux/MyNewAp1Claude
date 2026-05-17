/**
 * T-G.2.1 — Code Graph production skeleton.
 *
 * Source-scan + structural test that locks the production
 * `services/code-graph/{parser,persistence,projection}/` skeleton
 * established by T-G.2.1. Each sub-slice (T-G.2.2 .. .4) fills in
 * its respective module; this test ensures the surface contracts
 * + the "factory throws T-G.2.X" placeholders + the barrel re-exports
 * don't silently regress while the slices ship.
 *
 * Boundary preservation (already enforced separately by
 * `code-graph-spike-boundary.test.ts` for the spike tree):
 *   - parser/ has NO tree-sitter import (added in T-G.2.2)
 *   - persistence/ has NO drizzle import (added in T-G.2.3)
 *   - projection/ has NO neo4j-driver import (always — projection
 *     goes through the GraphRepository)
 *   - public-api.ts does NOT re-export from `spike/`
 *
 * When T-G.2.2/.3/.4 ship, the "factory throws" assertion below
 * for that sub-slice should be flipped to a positive assertion in
 * a sibling test (e.g., `tg-2-2-code-graph-parser-wired.test.ts`).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");
const codeGraphRoot = resolve(repoRoot, "server/agent-studio/services/code-graph");

function read(rel: string): string {
  return readFileSync(resolve(codeGraphRoot, rel), "utf8");
}

describe("T-G.2.1 — Code Graph production skeleton", () => {
  it("services/code-graph/public-api.ts barrel exists and re-exports all sub-modules", () => {
    expect(existsSync(resolve(codeGraphRoot, "public-api.ts"))).toBe(true);
    const src = read("public-api.ts");
    expect(src).toMatch(/from\s+["']\.\/contracts\/public-api\.js["']/);
    expect(src).toMatch(/from\s+["']\.\/parser\/public-api\.js["']/);
    expect(src).toMatch(/from\s+["']\.\/persistence\/public-api\.js["']/);
    expect(src).toMatch(/from\s+["']\.\/projection\/public-api\.js["']/);
  });

  it("top-level barrel does NOT re-export from spike/", () => {
    const src = read("public-api.ts");
    expect(src).not.toMatch(/from\s+["']\.\/spike\//);
  });

  // ── parser/ ──────────────────────────────────────────────────────

  it("parser/ directory exists with code-graph-parser.ts + public-api.ts", () => {
    expect(existsSync(resolve(codeGraphRoot, "parser/code-graph-parser.ts"))).toBe(true);
    expect(existsSync(resolve(codeGraphRoot, "parser/public-api.ts"))).toBe(true);
  });

  it("parser/code-graph-parser.ts declares CodeGraphParser + ParseFileResult", () => {
    const src = read("parser/code-graph-parser.ts");
    expect(src).toMatch(/export\s+interface\s+CodeGraphParser/);
    expect(src).toMatch(/parseFile\(filePath:\s+string,\s+source:\s+string\):\s+ParseFileResult/);
    expect(src).toMatch(/export\s+interface\s+ParseFileResult/);
    expect(src).toMatch(/readonly\s+nodes:\s+ReadonlyArray<ParsedCodeNode>/);
    expect(src).toMatch(/readonly\s+edges:\s+ReadonlyArray<ParsedCodeEdge>/);
    expect(src).toMatch(/readonly\s+errors:\s+ReadonlyArray<ParseError>/);
  });

  it("parser/code-graph-parser.ts factory throws T-G.2.2 placeholder", () => {
    const src = read("parser/code-graph-parser.ts");
    expect(src).toMatch(/export\s+function\s+createCodeGraphParser/);
    expect(src).toMatch(/\[T-G\.2\.1\][\s\S]*T-G\.2\.2/);
  });

  it("parser/ has NO tree-sitter import (added in T-G.2.2)", () => {
    const src = read("parser/code-graph-parser.ts");
    expect(src).not.toMatch(/from\s+["']tree-sitter/);
  });

  // ── persistence/ ─────────────────────────────────────────────────

  it("persistence/ directory exists with code-graph-store.ts + public-api.ts", () => {
    expect(existsSync(resolve(codeGraphRoot, "persistence/code-graph-store.ts"))).toBe(true);
    expect(existsSync(resolve(codeGraphRoot, "persistence/public-api.ts"))).toBe(true);
  });

  it("persistence/code-graph-store.ts declares CodeGraphStore + persistIngestion + readIngestion", () => {
    const src = read("persistence/code-graph-store.ts");
    expect(src).toMatch(/export\s+interface\s+CodeGraphStore/);
    expect(src).toMatch(/persistIngestion\(/);
    expect(src).toMatch(/readIngestion\(/);
    expect(src).toMatch(/Promise<CodeGraphIngestionResult>/);
  });

  it("persistence/code-graph-store.ts factory throws T-G.2.3 placeholder", () => {
    const src = read("persistence/code-graph-store.ts");
    expect(src).toMatch(/export\s+function\s+createCodeGraphStore/);
    expect(src).toMatch(/\[T-G\.2\.1\][\s\S]*T-G\.2\.3/);
  });

  it("persistence/ has NO drizzle import (added in T-G.2.3)", () => {
    const src = read("persistence/code-graph-store.ts");
    expect(src).not.toMatch(/from\s+["']drizzle-orm/);
    expect(src).not.toMatch(/from\s+["']\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/drizzle\//);
  });

  it("persistence/ has NO neo4j-driver import (projection owns that boundary)", () => {
    const src = read("persistence/code-graph-store.ts");
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  // ── projection/ ──────────────────────────────────────────────────

  it("projection/ directory exists with code-graph-projection.ts + public-api.ts", () => {
    expect(existsSync(resolve(codeGraphRoot, "projection/code-graph-projection.ts"))).toBe(true);
    expect(existsSync(resolve(codeGraphRoot, "projection/public-api.ts"))).toBe(true);
  });

  it("projection/code-graph-projection.ts declares CodeGraphProjection + projectIngestion", () => {
    const src = read("projection/code-graph-projection.ts");
    expect(src).toMatch(/export\s+interface\s+CodeGraphProjection/);
    expect(src).toMatch(/projectIngestion\(/);
    expect(src).toMatch(/Promise<ProjectCodeGraphResult>/);
  });

  it("projection/code-graph-projection.ts factory throws T-G.2.4 placeholder", () => {
    const src = read("projection/code-graph-projection.ts");
    expect(src).toMatch(/export\s+function\s+createCodeGraphProjection/);
    expect(src).toMatch(/\[T-G\.2\.1\][\s\S]*T-G\.2\.4/);
  });

  it("projection/ has NO direct neo4j-driver import (always — projects via GraphRepository)", () => {
    const src = read("projection/code-graph-projection.ts");
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  // ── factory invocation behavior ──────────────────────────────────

  it("all three factories throw T-G.2.1-tagged placeholder errors today", async () => {
    const { createCodeGraphParser } = await import(
      "../../server/agent-studio/services/code-graph/parser/code-graph-parser.js"
    );
    const { createCodeGraphStore } = await import(
      "../../server/agent-studio/services/code-graph/persistence/code-graph-store.js"
    );
    const { createCodeGraphProjection } = await import(
      "../../server/agent-studio/services/code-graph/projection/code-graph-projection.js"
    );
    expect(() => createCodeGraphParser()).toThrow(/T-G\.2\.1/);
    expect(() => createCodeGraphStore()).toThrow(/T-G\.2\.1/);
    expect(() => createCodeGraphProjection()).toThrow(/T-G\.2\.1/);
  });

  it("top-level public-api re-exports the closed-taxonomy validators (sanity)", async () => {
    const mod = await import(
      "../../server/agent-studio/services/code-graph/public-api.js"
    );
    expect(typeof mod.isCodeGraphNodeType).toBe("function");
    expect(typeof mod.isCodeGraphEdgeType).toBe("function");
    expect(typeof mod.validateCodeGraphEdgeBatch).toBe("function");
    expect(Array.isArray(mod.CODE_GRAPH_NODE_TYPES)).toBe(true);
    expect(Array.isArray(mod.CODE_GRAPH_EDGE_TYPES)).toBe(true);
  });
});
