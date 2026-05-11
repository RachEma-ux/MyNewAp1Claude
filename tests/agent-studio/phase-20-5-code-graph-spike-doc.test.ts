/**
 * Phase 20.5 — Code Graph Parser Spike ADR lockstep test.
 *
 * Asserts the ADR exists and carries the sections the Phase 20.5
 * acceptance list calls for.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PATH = join(
  process.cwd(),
  "docs/architecture/agent-studio-code-graph-parser-spike.md",
);

describe("Phase 20.5 — Code Graph Parser Spike ADR", () => {
  it("ADR file exists at the canonical path", () => {
    expect(existsSync(PATH)).toBe(true);
  });

  it("documents the spike evaluation (tree-sitter + language tools + edge model)", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toMatch(/tree-sitter/i);
    expect(src).toMatch(/ts-morph|TypeScript/i);
    expect(src).toMatch(/Symbol kinds/i);
    expect(src).toMatch(/Edge kinds/i);
  });

  it("records the deferral decision with trigger conditions", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toMatch(/defer.*Code Intelligence Graph/i);
    expect(src).toMatch(/trigger conditions/i);
  });

  it("defines the future 3-table data model", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toContain("code_graph_repositories");
    expect(src).toContain("code_graph_symbols");
    expect(src).toContain("code_graph_edges");
  });

  it("documents per-language parser strategy", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toMatch(/Python/i);
    expect(src).toMatch(/Go/i);
    expect(src).toMatch(/Rust/i);
  });
});
