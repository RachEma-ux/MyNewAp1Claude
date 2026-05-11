/**
 * Phase 28 — Hardening invariants ADR lockstep test.
 *
 * The consolidation ADR is an audit-grade index: every named
 * invariant must be present so the auditor sees the full
 * boundary catalog at a glance.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PATH = join(
  process.cwd(),
  "docs/architecture/agent-studio-hardening-invariants.md",
);

const NAMED_INVARIANTS = [
  // Tool execution
  "I-TOOL-1",
  "I-TOOL-2",
  "I-TOOL-3",
  // Governance + approval
  "I-GOV-1",
  "I-GOV-2",
  "I-GOV-3",
  // Vault + note
  "I-VAULT-1",
  "I-VAULT-2",
  "I-VAULT-3",
  // Graph
  "I-GRAPH-1",
  "I-GRAPH-2",
  "I-GRAPH-3",
  "I-GRAPH-4",
  // CAG + raw artifact
  "I-CAG-1",
  "I-RAW-1",
  // Trace + retention
  "I-TRACE-1",
  "I-TRACE-2",
  "I-TRACE-3",
  // Performance + observability
  "I-PERF-1",
  "I-OBS-1",
];

describe("Phase 28 — Hardening Invariants ADR", () => {
  it("ADR file exists at the canonical path", () => {
    expect(existsSync(PATH)).toBe(true);
  });

  it("enumerates every named invariant", () => {
    const src = readFileSync(PATH, "utf8");
    for (const name of NAMED_INVARIANTS) {
      expect(src).toContain(`### ${name}`);
    }
  });

  it("each invariant carries Statement + Enforced by + Failure mode sections", () => {
    const src = readFileSync(PATH, "utf8");
    // Look for the section markers per invariant — each block has
    // a Statement: line, an Enforced by: line, and a Failure mode line.
    expect(src.match(/\*\*Statement:\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(
      NAMED_INVARIANTS.length,
    );
    expect(src.match(/\*\*Enforced by:\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(
      NAMED_INVARIANTS.length,
    );
    expect(
      src.match(/\*\*Failure mode prevented:\*\*/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(NAMED_INVARIANTS.length);
  });

  it("maps invariants to Phase 28 acceptance criteria", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toMatch(/Acceptance criteria mapping/i);
    expect(src).toMatch(/MCP boundary/i);
    expect(src).toMatch(/Approval bypass/i);
    expect(src).toMatch(/Silent overwrite/i);
  });

  it("cross-references companion ADRs from Phases 17/18/19/27", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toContain("agent-studio-canvas-strategy");
    expect(src).toContain("agent-studio-extension-framework-strategy");
    expect(src).toContain("agent-studio-workspace-sync-strategy");
    expect(src).toContain("agent-studio-graph-production-operations");
  });
});
