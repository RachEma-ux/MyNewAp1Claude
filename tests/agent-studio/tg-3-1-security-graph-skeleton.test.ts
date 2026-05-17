/**
 * T-G.3.1 — Security/DevSecOps Graph production skeleton.
 *
 * Source-scan + structural test that locks the production
 * `services/security-graph/{cve-feed,persistence,projection}/`
 * skeleton established by T-G.3.1.
 *
 * Sub-arc invariants:
 *   - cve-feed/ has NO drizzle / NO neo4j-driver import
 *     (cve-feed is the external boundary; persistence + projection
 *     consume its output via the injected reader).
 *   - persistence/ has NO neo4j-driver import (projection owns
 *     that boundary).
 *   - projection/ has NO drizzle / neo4j-driver (reads via the
 *     CodeGraphStore analogue; writes via GraphRepository).
 *
 * Edge-taxonomy invariants (added to contracts.ts at T-G.3.1):
 *   - SECURITY_GRAPH_EDGE_TYPES has exactly 8 entries.
 *   - 7 edges compose the canonical impact path
 *     (CVE→Package→Component→Service→Environment→Owner→CustomerExposure)
 *     + 1 governance cross-link (governed_by_policy /
 *     enforced_by_control).
 *   - validateSecurityGraphEdgeBatch follows the
 *     validateCodeGraphEdgeBatch shape (precedent r — reuse
 *     across closed-taxonomy domains).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");
const securityGraphRoot = resolve(
  repoRoot,
  "server/agent-studio/services/security-graph",
);

function read(rel: string): string {
  return readFileSync(resolve(securityGraphRoot, rel), "utf8");
}

describe("T-G.3.1 — Security/DevSecOps Graph production skeleton", () => {
  // ── Top-level barrel ─────────────────────────────────────────────

  it("services/security-graph/public-api.ts re-exports all sub-module barrels", () => {
    const src = read("public-api.ts");
    expect(src).toMatch(/from\s+["']\.\/cve-feed\/public-api\.js["']/);
    expect(src).toMatch(/from\s+["']\.\/persistence\/public-api\.js["']/);
    expect(src).toMatch(/from\s+["']\.\/projection\/public-api\.js["']/);
  });

  // ── Edge taxonomy (contracts.ts append at T-G.3.1) ───────────────

  it("contracts.ts declares SECURITY_GRAPH_EDGE_TYPES (8 entries)", () => {
    const src = read("contracts.ts");
    expect(src).toMatch(/export\s+const\s+SECURITY_GRAPH_EDGE_TYPES\s*=\s*\[/);
    for (const k of [
      "affects_package",
      "bundled_in",
      "deployed_in",
      "runs_in_environment",
      "owned_by",
      "exposes_customer",
      "governed_by_policy",
      "enforced_by_control",
    ]) {
      expect(src).toMatch(new RegExp(`"${k}"`));
    }
  });

  it("contracts.ts declares SECURITY_GRAPH_EDGE_CONSTRAINTS (endpoint constraint registry)", () => {
    const src = read("contracts.ts");
    expect(src).toMatch(/export\s+const\s+SECURITY_GRAPH_EDGE_CONSTRAINTS:/);
    expect(src).toMatch(/affects_package:\s*\{[\s\S]*?sourceTypeKeys:\s*\[["']cve["']\]/);
    expect(src).toMatch(/affects_package:[\s\S]*?targetTypeKeys:\s*\[["']package["']\]/);
  });

  it("contracts.ts exports validateSecurityGraphEdgeBatch (T-G.3.3 will call this)", () => {
    const src = read("contracts.ts");
    expect(src).toMatch(
      /export\s+function\s+validateSecurityGraphEdgeBatch\(/,
    );
    expect(src).toMatch(/rejectionsByReason:/);
  });

  it("contracts.ts uses precedent (s) explicit-narrow for the discriminated union", () => {
    const src = read("contracts.ts");
    expect(src).toMatch(/Extract<\s*SecurityGraphEdgeValidationOutcome,\s*\{\s*readonly\s+ok:\s*false\s*\}\s*>/);
  });

  // ── cve-feed/ ───────────────────────────────────────────────────

  it("cve-feed/ directory exists with reader + barrel", () => {
    expect(existsSync(resolve(securityGraphRoot, "cve-feed/cve-feed-reader.ts"))).toBe(true);
    expect(existsSync(resolve(securityGraphRoot, "cve-feed/public-api.ts"))).toBe(true);
  });

  it("cve-feed/cve-feed-reader.ts declares CveFeedReader + CveFeedEntry shape", () => {
    const src = read("cve-feed/cve-feed-reader.ts");
    expect(src).toMatch(/export\s+interface\s+CveFeedReader/);
    expect(src).toMatch(/read\(params:\s+CveFeedReadParams\):\s+Promise<CveFeedReadResult>/);
    expect(src).toMatch(/export\s+interface\s+CveFeedEntry/);
    expect(src).toMatch(/affectedPackages:\s+ReadonlyArray<\{/);
  });

  it("cve-feed/cve-feed-reader.ts exports the createCveFeedReader factory (wired in T-G.3.2)", () => {
    const src = read("cve-feed/cve-feed-reader.ts");
    expect(src).toMatch(/export\s+function\s+createCveFeedReader/);
    expect(src).not.toMatch(/\[T-G\.3\.1\][\s\S]*T-G\.3\.2/);
  });

  it("cve-feed/ has NO drizzle / neo4j-driver imports (external feed only)", () => {
    const src = read("cve-feed/cve-feed-reader.ts");
    expect(src).not.toMatch(/from\s+["']drizzle-orm/);
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  // ── persistence/ ─────────────────────────────────────────────────

  it("persistence/ directory exists with store + barrel", () => {
    expect(existsSync(resolve(securityGraphRoot, "persistence/security-graph-store.ts"))).toBe(true);
    expect(existsSync(resolve(securityGraphRoot, "persistence/public-api.ts"))).toBe(true);
  });

  it("persistence/security-graph-store.ts declares SecurityGraphStore + persistIngestion + readIngestion", () => {
    const src = read("persistence/security-graph-store.ts");
    expect(src).toMatch(/export\s+interface\s+SecurityGraphStore/);
    expect(src).toMatch(/persistIngestion\(/);
    expect(src).toMatch(/readIngestion\(/);
    expect(src).toMatch(/Promise<SecurityGraphIngestionResult>/);
  });

  it("persistence/security-graph-store.ts factory throws T-G.3.3 placeholder", () => {
    const src = read("persistence/security-graph-store.ts");
    expect(src).toMatch(/export\s+function\s+createSecurityGraphStore/);
    expect(src).toMatch(/\[T-G\.3\.1\][\s\S]*T-G\.3\.3/);
  });

  it("persistence/ has NO neo4j-driver import (projection owns that boundary)", () => {
    const src = read("persistence/security-graph-store.ts");
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  // ── projection/ ──────────────────────────────────────────────────

  it("projection/ directory exists with projection + barrel", () => {
    expect(existsSync(resolve(securityGraphRoot, "projection/security-graph-projection.ts"))).toBe(true);
    expect(existsSync(resolve(securityGraphRoot, "projection/public-api.ts"))).toBe(true);
  });

  it("projection/security-graph-projection.ts declares SecurityGraphProjection + projectIngestion", () => {
    const src = read("projection/security-graph-projection.ts");
    expect(src).toMatch(/export\s+interface\s+SecurityGraphProjection/);
    expect(src).toMatch(/projectIngestion\(/);
    expect(src).toMatch(/Promise<ProjectSecurityGraphResult>/);
  });

  it("projection/security-graph-projection.ts factory throws T-G.3.4 placeholder", () => {
    const src = read("projection/security-graph-projection.ts");
    expect(src).toMatch(/export\s+function\s+createSecurityGraphProjection/);
    expect(src).toMatch(/\[T-G\.3\.1\][\s\S]*T-G\.3\.4/);
  });

  it("projection/ has NO direct neo4j-driver / drizzle import (always — projects via GraphRepository)", () => {
    const src = read("projection/security-graph-projection.ts");
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(src).not.toMatch(/from\s+["']drizzle-orm/);
  });

  // ── Factory invocation (placeholder errors) ──────────────────────

  it("persistence + projection factories still throw T-G.3.1-tagged placeholders (cve-feed wired in T-G.3.2)", async () => {
    const { createSecurityGraphStore } = await import(
      "../../server/agent-studio/services/security-graph/persistence/security-graph-store.js"
    );
    const { createSecurityGraphProjection } = await import(
      "../../server/agent-studio/services/security-graph/projection/security-graph-projection.js"
    );
    expect(() => createSecurityGraphStore()).toThrow(/T-G\.3\.1/);
    expect(() => createSecurityGraphProjection()).toThrow(/T-G\.3\.1/);
  });

  // ── Public-api re-exports the edge surfaces (T-G.3.3 entry point) ──

  it("top-level public-api re-exports edge taxonomy", async () => {
    const mod = await import(
      "../../server/agent-studio/services/security-graph/public-api.js"
    );
    expect(Array.isArray(mod.SECURITY_GRAPH_EDGE_TYPES)).toBe(true);
    expect(mod.SECURITY_GRAPH_EDGE_TYPES.length).toBe(8);
    expect(typeof mod.isSecurityGraphEdgeType).toBe("function");
    expect(typeof mod.validateSecurityGraphEdgeBatch).toBe("function");
  });
});
