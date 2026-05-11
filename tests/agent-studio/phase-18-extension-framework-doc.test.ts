/**
 * Phase 18 — Extension framework strategy ADR lockstep test.
 *
 * Asserts the ADR exists and carries the sections the Phase 18
 * acceptance list calls for: extension points table, deferred
 * plugin runtime rationale, plugin security gating items, and
 * the 10-invariant runtime boundary list.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PATH = join(
  process.cwd(),
  "docs/architecture/agent-studio-extension-framework-strategy.md",
);

describe("Phase 18 — Extension Framework Strategy ADR", () => {
  it("ADR file exists at the canonical path", () => {
    expect(existsSync(PATH)).toBe(true);
  });

  it("enumerates internal extension points", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toMatch(/Operator commands/i);
    expect(src).toMatch(/Cypher query templates/i);
    expect(src).toMatch(/Graph Skill Packs/i);
    expect(src).toMatch(/Vault note templates/i);
    expect(src).toMatch(/Saved view kinds/i);
  });

  it("documents the third-party plugin runtime as deferred + lists gating items", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toMatch(/third-party plugin runtime is explicitly deferred/i);
    expect(src).toMatch(/sandbox/i);
    expect(src).toMatch(/allowlist/i);
    expect(src).toMatch(/Signed manifests/i);
  });

  it("encodes the 10-invariant runtime boundary list", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toMatch(/MCP dispatcher is the only tool path/i);
    expect(src).toMatch(/Approval gate cannot be bypassed/i);
    expect(src).toMatch(/GraphRepository is the only graph access path/i);
    expect(src).toMatch(/Neo4j projection rules apply/i);
  });

  it("references the canvas strategy ADR + roadmap", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toContain("agent-studio-canvas-strategy");
    expect(src).toContain("agent-studio-native-graph-workspace-roadmap");
  });
});
