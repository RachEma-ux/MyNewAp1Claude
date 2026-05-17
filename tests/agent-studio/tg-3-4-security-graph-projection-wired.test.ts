/**
 * T-G.3.4 — Security Graph Neo4j projection wired through GraphRepository.
 *
 * Source-scan that locks the production shape of
 * `server/agent-studio/services/security-graph/projection/security-graph-projection.ts`
 * after T-G.3.4. Mirrors tg-2-4-code-graph-projection-wired.test.ts
 * line-for-line — the projection factory wiring is identical
 * across closed-taxonomy domains (precedent r).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PATH = resolve(
  __dirname,
  "../../server/agent-studio/services/security-graph/projection/security-graph-projection.ts",
);
function read(): string {
  return readFileSync(PATH, "utf8");
}

describe("T-G.3.4 — Security Graph Neo4j projection wired", () => {
  it("createSecurityGraphProjection accepts SecurityGraphProjectionOptions { store, repository }", () => {
    const src = read();
    expect(src).toMatch(/export\s+interface\s+SecurityGraphProjectionOptions/);
    expect(src).toMatch(/readonly\s+store:\s*SecurityGraphStore/);
    expect(src).toMatch(/readonly\s+repository:\s*GraphProjectionRepository/);
    expect(src).toMatch(
      /export\s+function\s+createSecurityGraphProjection\(\s*options:\s*SecurityGraphProjectionOptions/,
    );
  });

  it("projectIngestion reads from store.readIngestion (NOT a stub)", () => {
    expect(read()).toMatch(/options\.store\.readIngestion\([\s\S]*?input\.ingestionId[\s\S]*?\)/);
  });

  it("projectIngestion calls repository.applyProjectionJob with the converted writes", () => {
    expect(read()).toMatch(/options\.repository\.applyProjectionJob\(writes\)/);
  });

  it("nodes convert to upsert_node ProjectionWrite with security_graph_ingestion provenance", () => {
    const src = read();
    expect(src).toMatch(/kind:\s*"upsert_node"/);
    expect(src).toMatch(/sourceType:\s*"security_graph_ingestion"/);
    expect(src).toMatch(/lineageStatus:\s*"derived"/);
    expect(src).toMatch(/extractionMethod:\s*"nvd_cve_feed"/);
  });

  it("edges convert to upsert_edge ProjectionWrite with endpoint typeKeys", () => {
    const src = read();
    expect(src).toMatch(/kind:\s*"upsert_edge"/);
    expect(src).toMatch(/sourceNode:\s*\{\s*typeKey:[\s\S]*?id:\s*edge\.sourceId\s*\}/);
    expect(src).toMatch(/targetNode:\s*\{\s*typeKey:[\s\S]*?id:\s*edge\.targetId\s*\}/);
  });

  it("unresolved cross-ingestion references tagged 'unresolved' (not dropped)", () => {
    expect(read()).toMatch(/['"]unresolved['"]/);
  });

  it("durationMs measured against wall clock", () => {
    const src = read();
    expect(src).toMatch(/const\s+start\s*=\s*Date\.now\(\)/);
    expect(src).toMatch(/durationMs[\s\S]*?Date\.now\(\)\s*-\s*start/);
  });

  it("nodesProjected + edgesProjected sum created + updated", () => {
    const src = read();
    expect(src).toMatch(/nodesCreated\s*\+\s*result\.nodesUpdated/);
    expect(src).toMatch(/edgesCreated\s*\+\s*result\.edgesUpdated/);
  });

  it("projection does NOT import neo4j-driver (goes through GraphRepository)", () => {
    expect(read()).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("projection does NOT import drizzle / getAsDb (writes go through repository)", () => {
    const src = read();
    expect(src).not.toMatch(/from\s+["']drizzle-orm/);
    expect(src).not.toMatch(/getAsDb/);
  });

  it("placeholder string from T-G.3.1 is GONE (regression guard)", () => {
    expect(read()).not.toMatch(
      /SecurityGraphProjection is the T-G\.3\.1 interface contract only/,
    );
  });
});
