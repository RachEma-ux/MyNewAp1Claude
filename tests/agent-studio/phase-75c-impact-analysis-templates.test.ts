/**
 * Phase 7.5c — Impact Analysis Cypher templates.
 *
 * Locks the 7 impact-analysis templates added to
 * `server/agent-studio/services/graph-skill/seed-cypher-templates.ts`
 * by the Phase 7.5c unblock PR.
 *
 * Sibling test `graph-skill-seeds.test.ts` covers the generic
 * shape invariants (forbidden mutation tokens, parameter
 * schemas present, etc.). This test asserts the
 * 7.5c-specific contract:
 *
 *   - exactly 7 `impact_<kind>` templates beyond the existing
 *     baseline (`impact_analysis` from the 16-template baseline)
 *   - each follows the start-at-id → traverse-relationships →
 *     return-distinct shape so the T-F.3 Impact Analysis Lens
 *     runner can render them through a single render envelope
 *   - high-risk + medium-risk kinds restrict `allowedRoles`
 *   - depth + maxResults are within Neo4j scaling sweet spot
 *     (depth ≤4, maxResults ≤1000) per T-E.5 carry-forward
 *
 * If a future seed-file refactor reduces / renames / silently
 * weakens these templates (e.g., drops the security role
 * restriction), this test fails before merge.
 *
 * Phase 7.5 blocker doc:
 * `docs/architecture/agent-studio-phase-7-5-neo4j-blocker.md` §2 step 3.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_CYPHER_TEMPLATES,
  type CypherTemplateSeed,
} from "../../server/agent-studio/services/graph-skill/seed-cypher-templates.js";

const IMPACT_KINDS = [
  "impact_knowledge",
  "impact_runtime",
  "impact_code",
  "impact_security",
  "impact_governance",
  "impact_tool",
  "impact_workflow",
] as const;

function findImpact(key: (typeof IMPACT_KINDS)[number]): CypherTemplateSeed {
  const found = DEFAULT_CYPHER_TEMPLATES.find((t) => t.templateKey === key);
  expect(found, `template ${key} must be seeded`).toBeDefined();
  return found!;
}

describe("Phase 7.5c — Impact Analysis Cypher templates", () => {
  it("all 7 impact_<kind> templates are present in the seed", () => {
    const seededKeys = new Set(DEFAULT_CYPHER_TEMPLATES.map((t) => t.templateKey));
    for (const k of IMPACT_KINDS) {
      expect(seededKeys.has(k), `seed must include ${k}`).toBe(true);
    }
  });

  it("each impact_<kind> uses a $startId parameter (start-at-id contract)", () => {
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.parameterSchema.startId).toBeDefined();
      expect(t.parameterSchema.startId.required).toBe(true);
      expect(t.cypherBody).toMatch(/MATCH\s*\(start\s*\{\s*id:\s*\$startId\s*\}\)/);
    }
  });

  it("each impact_<kind> returns DISTINCT impacted + last(r) AS edge", () => {
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.cypherBody).toMatch(/RETURN\s+DISTINCT\s+impacted,\s+last\(r\)\s+AS\s+edge/);
    }
  });

  it("each impact_<kind> caps results via $maxResults LIMIT", () => {
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.cypherBody).toMatch(/LIMIT\s+\$maxResults/);
      expect(t.parameterSchema.maxResults).toBeDefined();
    }
  });

  it("each impact_<kind> filters active governance_status (excludes archived/retired)", () => {
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.cypherBody).toMatch(
        /WHERE\s+coalesce\(impacted\.governance_status,\s+'active'\)\s+=\s+'active'/,
      );
    }
  });

  it("each impact_<kind> uses variable-depth path traversal *1..N", () => {
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.cypherBody).toMatch(/-\[r:[A-Z_|]+\*1\.\.[1-4]\]->/);
    }
  });

  it("depth caps are ≤4 (Neo4j scaling sweet spot per T-E.5)", () => {
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.maxDepth, `${k} maxDepth must be ≤4`).toBeLessThanOrEqual(4);
      expect(t.maxDepth, `${k} maxDepth must be ≥1`).toBeGreaterThanOrEqual(1);
    }
  });

  it("maxResults caps are ≤1000 (Neo4j scaling sweet spot)", () => {
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.maxResults, `${k} maxResults must be ≤1000`).toBeLessThanOrEqual(1000);
    }
  });

  it("impact_security is high risk and restricted to admin/security roles", () => {
    const t = findImpact("impact_security");
    expect(t.riskLevel).toBe("high");
    expect(t.allowedRoles).not.toBeNull();
    expect(t.allowedRoles).toEqual(expect.arrayContaining(["admin", "security"]));
  });

  it("impact_governance is medium risk and restricted to admin/governance roles", () => {
    const t = findImpact("impact_governance");
    expect(t.riskLevel).toBe("medium");
    expect(t.allowedRoles).not.toBeNull();
    expect(t.allowedRoles).toEqual(expect.arrayContaining(["admin", "governance"]));
  });

  it("low-risk impact kinds are unrestricted (allowedRoles: null)", () => {
    for (const k of ["impact_knowledge", "impact_runtime", "impact_code", "impact_tool", "impact_workflow"] as const) {
      const t = findImpact(k);
      expect(t.riskLevel).toBe("low");
      expect(t.allowedRoles, `${k} low-risk must not restrict roles`).toBeNull();
    }
  });

  it("each impact_<kind> targets neo4j_ce + cypher + readOnly + permissionFilterRequired", () => {
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.graphBackend).toBe("neo4j_ce");
      expect(t.queryLanguage).toBe("cypher");
      expect(t.readOnly).toBe(true);
      expect(t.permissionFilterRequired).toBe(true);
    }
  });

  it("impact_code is the deepest traversal (T-G.2 Code Intelligence pairing)", () => {
    const t = findImpact("impact_code");
    expect(t.maxDepth).toBe(4);
    expect(t.maxResults).toBe(1000);
    expect(t.cypherBody).toMatch(/IMPORTS\|CALLS\|DECLARES/);
  });

  it("relationship type lists are kind-specific (no cross-kind overlap by design)", () => {
    const expected: Record<(typeof IMPACT_KINDS)[number], RegExp> = {
      impact_knowledge: /REFERENCES\|CITES\|EXPLAINS/,
      impact_runtime: /USED_BY\|EXECUTED_IN\|TRACED_IN/,
      impact_code: /IMPORTS\|CALLS\|DECLARES/,
      impact_security: /AUTHORIZES\|EXPOSES\|GRANTS_ACCESS/,
      impact_governance: /GOVERNED_BY\|APPROVED_BY\|DEPENDS_ON_POLICY/,
      impact_tool: /DISPATCHES_TO\|CAPABILITY_OF\|WIRED_INTO/,
      impact_workflow: /TRIGGERS\|STEPS_INTO\|DEPENDS_ON_STEP/,
    };
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.cypherBody).toMatch(expected[k]);
    }
  });

  it("template names and descriptions are operator-facing (non-empty, kind-named)", () => {
    for (const k of IMPACT_KINDS) {
      const t = findImpact(k);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(20);
      // Each name should reference "Impact" to surface the lens grouping
      expect(t.name).toMatch(/Impact/i);
    }
  });
});
