/**
 * Phase G §T-G.57 — Graph-skill pack risk-level metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_SKILL_RISK_LEVELS,
  GRAPH_SKILL_RISK_LEVEL_METADATA,
  getGraphSkillRiskLevelMetadata,
} from "../../server/agent-studio/services/graph-skill/pack-mutations.js";

describe("GRAPH_SKILL_RISK_LEVEL_METADATA (T-G.57)", () => {
  it("has metadata for every closed-taxonomy level", () => {
    for (const l of GRAPH_SKILL_RISK_LEVELS) {
      expect(GRAPH_SKILL_RISK_LEVEL_METADATA[l]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(GRAPH_SKILL_RISK_LEVEL_METADATA).length).toBe(
      GRAPH_SKILL_RISK_LEVELS.length,
    );
  });

  it.each(GRAPH_SKILL_RISK_LEVELS)(
    "%s has non-empty label + description + valid rank + boolean requiresApproval",
    (l) => {
      const md = GRAPH_SKILL_RISK_LEVEL_METADATA[l];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2]).toContain(md.rank);
      expect(typeof md.requiresApproval).toBe("boolean");
    },
  );

  it.each(GRAPH_SKILL_RISK_LEVELS)(
    "getGraphSkillRiskLevelMetadata(%s) returns table entry",
    (l) => {
      expect(getGraphSkillRiskLevelMetadata(l)).toBe(
        GRAPH_SKILL_RISK_LEVEL_METADATA[l],
      );
    },
  );

  it("rank order matches declaration order (low=0 → high=2)", () => {
    GRAPH_SKILL_RISK_LEVELS.forEach((l, idx) => {
      expect(GRAPH_SKILL_RISK_LEVEL_METADATA[l].rank).toBe(idx);
    });
  });

  it("rank is unique across levels", () => {
    const ranks = new Set<number>();
    for (const l of GRAPH_SKILL_RISK_LEVELS) {
      ranks.add(GRAPH_SKILL_RISK_LEVEL_METADATA[l].rank);
    }
    expect(ranks.size).toBe(GRAPH_SKILL_RISK_LEVELS.length);
  });

  it("high is the only approval-required level", () => {
    const approval = GRAPH_SKILL_RISK_LEVELS.filter(
      (l) => GRAPH_SKILL_RISK_LEVEL_METADATA[l].requiresApproval,
    );
    expect(approval).toEqual(["high"]);
  });

  it("requiresApproval implies rank === 2", () => {
    for (const l of GRAPH_SKILL_RISK_LEVELS) {
      const md = GRAPH_SKILL_RISK_LEVEL_METADATA[l];
      if (md.requiresApproval) {
        expect(md.rank).toBe(2);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const l of GRAPH_SKILL_RISK_LEVELS) {
      labels.add(GRAPH_SKILL_RISK_LEVEL_METADATA[l].label);
    }
    expect(labels.size).toBe(GRAPH_SKILL_RISK_LEVELS.length);
  });
});
