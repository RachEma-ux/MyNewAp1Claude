/**
 * T-G.5 — Aggregate-track coverage: impact-traversal templates +
 * graph-kind projections + closed-taxonomy enum entries.
 *
 * Source-scan integrity test that locks the structural shape of the
 * T-G track end-to-end:
 *
 *   1. Phase 7.5c shipped 7 `impact_*` Cypher templates in the
 *      ags_query_templates seed registry (one per impact domain:
 *      knowledge / runtime / code / security / governance / tool /
 *      workflow).
 *
 *   2. The 3 graph-kind sub-arcs (institutional / code / security)
 *      each ship a projection layer under their own domain dir,
 *      following the (q) precedent (SoT INSIDE domain).
 *
 *   3. The closed-taxonomy `GRAPH_LENS_KINDS` enum carries entries
 *      for all 3 graph-kind lenses.
 *
 *   4. Each `impact_*` template body declares the canonical edge
 *      pattern the lens runner expects (smoke-level — body strings
 *      grep for the documented edges).
 *
 * No Neo4j. No DB. No HTTP. Pure source-scan — locks invariants
 * surfaced across the T-G arcs without needing a live backend.
 * Live-Neo4j traversal smoke is deliberately deferred (see closure
 * ledger §4 "Mortgage").
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const SEED_TEMPLATES_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-skill/seed-cypher-templates.ts",
);
const GRAPH_LENS_CONTRACTS_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-lens/contracts.ts",
);

function readFile(path: string): string {
  return readFileSync(path, "utf8");
}

describe("T-G.5 — impact-traversal coverage", () => {
  // ── 1. Impact templates ───────────────────────────────────────

  const IMPACT_TEMPLATES = [
    "impact_knowledge",
    "impact_runtime",
    "impact_code",
    "impact_security",
    "impact_governance",
    "impact_tool",
    "impact_workflow",
  ] as const;

  it("Phase 7.5c ships all 7 impact_* templates in the seed registry", () => {
    const src = readFile(SEED_TEMPLATES_FILE);
    for (const key of IMPACT_TEMPLATES) {
      expect(src).toMatch(new RegExp(`templateKey:\\s*["']${key}["']`));
    }
  });

  it("each impact template declares Cypher body + parameter schema + readOnly: true", () => {
    const src = readFile(SEED_TEMPLATES_FILE);
    for (const key of IMPACT_TEMPLATES) {
      const startIdx = src.indexOf(`templateKey: "${key}"`);
      expect(startIdx).toBeGreaterThan(-1);
      // Look at the following ~30 lines for the template definition.
      const slice = src.slice(startIdx, startIdx + 2000);
      expect(slice).toMatch(/cypherBody:/);
      expect(slice).toMatch(/parameterSchema:/);
      expect(slice).toMatch(/readOnly:\s*true/);
    }
  });

  it("impact_code template references the IMPORTS|CALLS|DECLARES edge family (T-G.2 pairing)", () => {
    const src = readFile(SEED_TEMPLATES_FILE);
    const idx = src.indexOf(`templateKey: "impact_code"`);
    const slice = src.slice(idx, idx + 2000);
    expect(slice).toMatch(/IMPORTS\|CALLS\|DECLARES/);
  });

  it("impact_security template references AUTHORIZES|EXPOSES|GRANTS_ACCESS + admin/security gating (T-G.3 pairing)", () => {
    const src = readFile(SEED_TEMPLATES_FILE);
    const idx = src.indexOf(`templateKey: "impact_security"`);
    const slice = src.slice(idx, idx + 2000);
    expect(slice).toMatch(/AUTHORIZES\|EXPOSES\|GRANTS_ACCESS/);
    expect(slice).toMatch(/allowedRoles:\s*\[\s*["']admin["']\s*,\s*["']security["']\s*\]/);
  });

  it("impact_knowledge template references REFERENCES|CITES|EXPLAINS (T-G aggregate pairing)", () => {
    const src = readFile(SEED_TEMPLATES_FILE);
    const idx = src.indexOf(`templateKey: "impact_knowledge"`);
    const slice = src.slice(idx, idx + 2000);
    expect(slice).toMatch(/REFERENCES\|CITES\|EXPLAINS/);
  });

  // ── 2. Graph-kind projection dirs ─────────────────────────────

  const PROJECTION_DIRS = [
    "server/agent-studio/services/code-graph/projection",
    "server/agent-studio/services/security-graph/projection",
  ] as const;

  it("each graph-kind sub-arc has a projection/ directory (precedent (q) SoT split)", () => {
    for (const dir of PROJECTION_DIRS) {
      const path = resolve(__dirname, "../..", dir);
      expect(existsSync(path), `expected ${dir} to exist`).toBe(true);
    }
  });

  // ── 3. Closed-taxonomy GRAPH_LENS_KINDS entries ───────────────

  const REQUIRED_KINDS = [
    "institutional_memory",
    "code_intelligence",
    "security_devsecops",
  ] as const;

  it("GRAPH_LENS_KINDS enum carries the 3 T-G graph-kind lens entries", () => {
    const src = readFile(GRAPH_LENS_CONTRACTS_FILE);
    const startIdx = src.indexOf("GRAPH_LENS_KINDS");
    expect(startIdx).toBeGreaterThan(-1);
    for (const kind of REQUIRED_KINDS) {
      expect(src).toMatch(new RegExp(`["']${kind}["']`));
    }
  });

  // ── 4. Cross-arc structural invariants ────────────────────────

  it("all 7 impact templates carry permissionFilterRequired: true (defense-in-depth)", () => {
    const src = readFile(SEED_TEMPLATES_FILE);
    for (const key of IMPACT_TEMPLATES) {
      const idx = src.indexOf(`templateKey: "${key}"`);
      const slice = src.slice(idx, idx + 2000);
      expect(slice).toMatch(/permissionFilterRequired:\s*true/);
    }
  });

  it("all 7 impact templates declare timeoutMs (no unbounded traversal)", () => {
    const src = readFile(SEED_TEMPLATES_FILE);
    for (const key of IMPACT_TEMPLATES) {
      const idx = src.indexOf(`templateKey: "${key}"`);
      const slice = src.slice(idx, idx + 2000);
      expect(slice).toMatch(/timeoutMs:\s*\d+/);
    }
  });
});
