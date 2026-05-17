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

  it("parser/code-graph-parser.ts exports the createCodeGraphParser factory (wired in T-G.2.2)", () => {
    const src = read("parser/code-graph-parser.ts");
    expect(src).toMatch(/export\s+function\s+createCodeGraphParser/);
    // Negative: pre-T-G.2.2 placeholder string must be gone (regression guard)
    expect(src).not.toMatch(/\[T-G\.2\.1\][\s\S]*T-G\.2\.2/);
  });

  it("parser/ tree-sitter import lives only in tree-sitter-emitter.ts (T-G.2.2)", () => {
    // Production parser delegates to the sibling emitter; the
    // public factory file itself does NOT import tree-sitter, so
    // consumers without the native binding can compile against
    // the surface.
    const factorySrc = read("parser/code-graph-parser.ts");
    expect(factorySrc).not.toMatch(/from\s+["']tree-sitter["']/);
    const emitterSrc = read("parser/tree-sitter-emitter.ts");
    expect(emitterSrc).toMatch(/from\s+["']tree-sitter["']/);
    expect(emitterSrc).toMatch(/from\s+["']tree-sitter-typescript["']/);
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

  it("persistence/code-graph-store.ts exports the createCodeGraphStore factory (wired in T-G.2.3)", () => {
    const src = read("persistence/code-graph-store.ts");
    expect(src).toMatch(/export\s+function\s+createCodeGraphStore/);
    // Negative: pre-T-G.2.3 placeholder string must be gone.
    expect(src).not.toMatch(/\[T-G\.2\.1\][\s\S]*T-G\.2\.3/);
  });

  it("persistence/ uses drizzle + ASDB connection (wired in T-G.2.3)", () => {
    const src = read("persistence/code-graph-store.ts");
    expect(src).toMatch(/from\s+["']drizzle-orm["']/);
    expect(src).toMatch(/getAsDb/);
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

  it("projection/code-graph-projection.ts exports the createCodeGraphProjection factory (wired in T-G.2.4)", () => {
    const src = read("projection/code-graph-projection.ts");
    expect(src).toMatch(/export\s+function\s+createCodeGraphProjection/);
    // Negative: pre-T-G.2.4 placeholder string must be gone.
    expect(src).not.toMatch(/\[T-G\.2\.1\][\s\S]*T-G\.2\.4/);
  });

  it("projection/ has NO direct neo4j-driver import (always — projects via GraphRepository)", () => {
    const src = read("projection/code-graph-projection.ts");
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  // ── factory invocation behavior ──────────────────────────────────

  it("all three factories are wired (parser T-G.2.2, persistence T-G.2.3, projection T-G.2.4)", () => {
    // Source-scan rather than behavioral — the source-scan tests
    // in each sub-slice's `*-wired.test.ts` lock the actual
    // implementation contracts. This assertion is the negative
    // sanity check: no factory still carries the T-G.2.1
    // placeholder error string.
    for (const path of [
      "parser/code-graph-parser.ts",
      "persistence/code-graph-store.ts",
      "projection/code-graph-projection.ts",
    ]) {
      const src = read(path);
      expect(
        src.match(/\[T-G\.2\.1\]\s+CodeGraph(?:Parser|Store|Projection)/),
        `${path} still carries the T-G.2.1 placeholder string`,
      ).toBeNull();
    }
  });

  it("top-level public-api source-scans show the contracts re-exports (validator surface)", () => {
    // Source-scan rather than dynamic-import because the parser
    // public-api transitively pulls `tree-sitter-emitter.ts` which
    // requires the native tree-sitter binding. Source-scan keeps
    // this test runnable on environments without the binding
    // installed (Termux, fresh checkouts) while still locking
    // that the barrel re-exports the public contracts surface.
    const src = read("public-api.ts");
    expect(src).toMatch(/from\s+["']\.\/contracts\/public-api\.js["']/);
    const contractsBarrel = read("contracts/public-api.ts");
    expect(contractsBarrel).toMatch(/isCodeGraphNodeType/);
    expect(contractsBarrel).toMatch(/isCodeGraphEdgeType/);
    expect(contractsBarrel).toMatch(/validateCodeGraphEdgeBatch/);
    expect(contractsBarrel).toMatch(/CODE_GRAPH_NODE_TYPES/);
    expect(contractsBarrel).toMatch(/CODE_GRAPH_EDGE_TYPES/);
  });
});
