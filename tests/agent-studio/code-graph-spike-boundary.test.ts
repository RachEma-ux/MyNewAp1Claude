/**
 * Code Graph Parser Spike — boundary integrity tests.
 *
 * T-E.1 of the remaining execution plan. The spike directory tree
 * at `server/agent-studio/services/code-graph/spike/**` is the only
 * place tree-sitter imports may appear. This test mortgages the
 * boundary so a future PR adding tree-sitter outside the spike
 * directory trips a test rather than silently leaking the parser
 * into production.
 *
 * The spike directory starts as a README + this test only (T-E.1).
 * T-E.2 adds the actual parser emitter. T-E.3 measures performance.
 * T-E.4 decides spike-success / spike-fail.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - GraphRepository sole graph access — spike projection writes
 *     flow through the existing repository surface.
 *   - No `neo4j-driver` imports anywhere in the spike tree.
 *   - No `process.env.*_API_KEY` reads (parsing is local-CPU).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const repoRoot = resolve(__dirname, "../..");
const spikeDir = resolve(
  repoRoot,
  "server/agent-studio/services/code-graph/spike",
);
const adrPath = resolve(
  repoRoot,
  "docs/implementation/agent-studio-code-graph-parser-spike-2026.md",
);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("T-E.1 — Code Graph Parser Spike boundary", () => {
  it("ADR document exists", () => {
    expect(existsSync(adrPath)).toBe(true);
  });

  it("ADR names the three parser strategies (A: single tree-sitter / B: per-language / C: LLM-driven)", () => {
    const src = readFileSync(adrPath, "utf8");
    expect(src).toContain("A. Single tree-sitter");
    expect(src).toContain("B. Per-language AST tools");
    expect(src).toContain("C. LLM-driven extraction");
  });

  it("ADR explicitly rejects strategy C with reason", () => {
    const src = readFileSync(adrPath, "utf8");
    expect(/Rejected immediately[\s\S]{0,80}\bC\b/.test(src)).toBe(true);
    expect(src).toContain("hallucination");
  });

  it("Spike directory exists with README", () => {
    expect(existsSync(spikeDir)).toBe(true);
    expect(existsSync(join(spikeDir, "README.md"))).toBe(true);
  });

  it("Spike directory README names the hard-rule boundaries", () => {
    const src = readFileSync(join(spikeDir, "README.md"), "utf8");
    expect(src).toContain("No tree-sitter imports outside this directory");
    expect(src).toContain("No `neo4j-driver` imports anywhere in this tree");
  });

  it("T-E.2: spike tree contains the emitter + sample-ingest scripts", () => {
    expect(existsSync(join(spikeDir, "parse-ts-file.ts"))).toBe(true);
    expect(existsSync(join(spikeDir, "run-sample-ingest.ts"))).toBe(true);
  });

  it("T-E.2: parse-ts-file.ts imports tree-sitter + tree-sitter-typescript inside the spike tree", () => {
    const src = readFileSync(join(spikeDir, "parse-ts-file.ts"), "utf8");
    expect(src).toMatch(/from\s+["']tree-sitter["']/);
    expect(src).toMatch(/from\s+["']tree-sitter-typescript["']/);
  });

  it("Source-scan: no tree-sitter import outside the spike tree (anywhere in server/ or client/src/)", () => {
    // Walk only the agent-studio + client surfaces so the test stays
    // bounded; tree-sitter is the spike-only dep.
    const surfaces = [
      resolve(repoRoot, "server/agent-studio"),
      resolve(repoRoot, "client/src"),
    ];
    const offenders: string[] = [];
    for (const surface of surfaces) {
      if (!existsSync(surface)) continue;
      for (const f of walk(surface)) {
        if (!/\.(ts|tsx|js)$/.test(f)) continue;
        if (f.includes("/code-graph/spike/")) continue;
        const src = readFileSync(f, "utf8");
        if (/from\s+["']tree-sitter/.test(src)) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});
