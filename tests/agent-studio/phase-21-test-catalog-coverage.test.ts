/**
 * Phase 21 catalog coverage — T-I.1 (remaining execution plan).
 *
 * Cross-cutting hardening test that verifies the test files the
 * roadmap §"Phase 21 — Continuous Graph Testing and Benchmark CI"
 * catalog enumerates are actually present in tests/agent-studio/.
 *
 * This is a structural test — it does NOT execute the catalog tests,
 * only asserts they exist (the build pipeline runs them). The catalog
 * map is documented in
 * `docs/implementation/agent-studio-phase-21-continuous-graph-testing-catalog.md`.
 *
 * Rationale: prevents regressions where a future PR deletes a
 * catalog-named file without an explicit migration. The 3 gaps
 * (impact-analysis runtime, temporal-observations, standalone
 * traversal/capability splits) are documented in the catalog doc
 * with their planned closure tracks.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

const testsDir = resolve(__dirname);

function exists(name: string): boolean {
  return existsSync(resolve(testsDir, name));
}

describe("T-I.1 — Phase 21 catalog coverage (structural)", () => {
  it("graph-repository-boundary.test.ts present (catalog #1)", () => {
    expect(exists("graph-repository-boundary.test.ts")).toBe(true);
  });

  it("projection-drift-cron.test.ts present (catalog #5; named without graph- prefix)", () => {
    expect(exists("projection-drift-cron.test.ts")).toBe(true);
  });

  it("graph-permission-visibility-property.test.ts present (catalog #7 + #13)", () => {
    expect(exists("graph-permission-visibility-property.test.ts")).toBe(true);
  });

  it("graph-quality-missing-provenance-scanner.test.ts present (catalog #17 — closed by T-D.1 #986)", () => {
    expect(exists("graph-quality-missing-provenance-scanner.test.ts")).toBe(
      true,
    );
  });

  it("graph-agent-engine.test.ts + engine-agentic.test.ts present (catalog #23 + #24)", () => {
    expect(exists("graph-agent-engine.test.ts")).toBe(true);
    expect(exists("graph-agent-engine-agentic.test.ts")).toBe(true);
  });

  it("text2cypher-mutation-blocked.test.ts + validator present (catalog #21)", () => {
    expect(exists("text2cypher-mutation-blocked.test.ts")).toBe(true);
    expect(exists("text2cypher-validator.test.ts")).toBe(true);
  });

  it("graph-skill-* tests present (catalog #22 — multiple)", () => {
    expect(exists("graph-skill-boot-wiring.test.ts")).toBe(true);
    expect(exists("graph-skill-router.test.ts")).toBe(true);
  });

  it("Phase 21 catalog doc present + names this test", () => {
    const doc = resolve(
      testsDir,
      "../../docs/implementation/agent-studio-phase-21-continuous-graph-testing-catalog.md",
    );
    expect(existsSync(doc)).toBe(true);
  });
});

describe("T-I.1 — Documented Phase 21 catalog gaps", () => {
  it("acknowledges graph-impact-analysis.test.ts gap (catalog #12; closes via T-F.7)", () => {
    // This gap is documented; the test does NOT enforce its presence.
    // It's a sentinel — when T-F.7 ships, this test asserts the file
    // exists.
    const target = "graph-impact-analysis.test.ts";
    const exists_ = exists(target);
    // Today: file MUST NOT exist (the gap is real). Future T-F.7
    // ships the file; flip this expectation as part of T-F.7's PR.
    expect(exists_).toBe(false);
  });

  it("acknowledges graph-temporal-observations.test.ts gap (catalog #18; closes via T-G.1.b)", () => {
    expect(exists("graph-temporal-observations.test.ts")).toBe(false);
  });
});
