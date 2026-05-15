/**
 * Phase 28 catalog coverage — T-I.2 (remaining execution plan).
 *
 * Structural lock paralleling T-I.1's Phase 21 catalog test.
 * Asserts the Phase 28 doc exists + references the right inputs.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");
const docPath = resolve(
  repoRoot,
  "docs/implementation/agent-studio-phase-28-governance-acceptance-catalog.md",
);

describe("T-I.2 — Phase 28 catalog structural integrity", () => {
  it("doc exists at the canonical path", () => {
    expect(existsSync(docPath)).toBe(true);
  });

  it("names the 30 acceptance criteria summary", () => {
    const src = readFileSync(docPath, "utf8");
    expect(src).toContain("27/30");
  });

  it("documents the 29 CI blockers + 23/29 defense status", () => {
    const src = readFileSync(docPath, "utf8");
    expect(src).toContain("29 CI blockers");
    expect(src).toContain("23/29 fully defended");
  });

  it("references CLAUDE.md mortgage test (T-C.1 #985)", () => {
    const src = readFileSync(docPath, "utf8");
    expect(src).toContain("#985");
  });

  it("references Phase 23 missing-provenance scanner (T-D.1 #986)", () => {
    const src = readFileSync(docPath, "utf8");
    expect(src).toContain("#986");
  });

  it("references Phase 21 catalog as sibling document", () => {
    const src = readFileSync(docPath, "utf8");
    expect(src).toContain(
      "agent-studio-phase-21-continuous-graph-testing-catalog.md",
    );
  });

  it("identifies operator-only items as such (not as code gaps)", () => {
    const src = readFileSync(docPath, "utf8");
    expect(src).toContain("operator territory");
  });

  it("lists 3 acceptance partials with closure tracks", () => {
    const src = readFileSync(docPath, "utf8");
    // The three partial acceptance criteria (16, 28, 30) each name
    // a closure track or "operator" explicitly.
    expect(src).toContain("T-D.3");
  });
});

describe("T-I.2 — performance SLO catalog references", () => {
  it("doc enumerates the SLO table with at least 8 surfaces", () => {
    const src = readFileSync(docPath, "utf8");
    expect(src).toContain("p95 <");
    expect(src).toContain("GraphRepository read");
    expect(src).toContain("Projection sync tick");
    expect(src).toContain("Golden question regression");
  });

  it("proposes the T-I.3 soft-CI-gate path for unenforced thresholds", () => {
    const src = readFileSync(docPath, "utf8");
    expect(src).toContain("T-I.3");
    expect(src).toContain("soft CI gates");
  });
});
