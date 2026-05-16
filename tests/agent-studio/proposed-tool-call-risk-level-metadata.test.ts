/**
 * Phase G §T-G.48 — Proposed-tool-call risk-level metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  PROPOSED_TOOL_CALL_RISK_LEVELS,
  PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA,
  getProposedToolCallRiskLevelMetadata,
} from "../../server/agent-studio/services/mcp/proposed-tool-call.js";

describe("PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA (T-G.48)", () => {
  it("has metadata for every closed-taxonomy level", () => {
    for (const l of PROPOSED_TOOL_CALL_RISK_LEVELS) {
      expect(PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA[l]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA).length,
    ).toBe(PROPOSED_TOOL_CALL_RISK_LEVELS.length);
  });

  it.each(PROPOSED_TOOL_CALL_RISK_LEVELS)(
    "%s has non-empty label + description + valid rank + boolean requiresApproval",
    (l) => {
      const md = PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA[l];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2, 3]).toContain(md.rank);
      expect(typeof md.requiresApproval).toBe("boolean");
    },
  );

  it.each(PROPOSED_TOOL_CALL_RISK_LEVELS)(
    "getProposedToolCallRiskLevelMetadata(%s) returns table entry",
    (l) => {
      expect(getProposedToolCallRiskLevelMetadata(l)).toBe(
        PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA[l],
      );
    },
  );

  it("rank order matches declaration order (low=0 → critical=3)", () => {
    PROPOSED_TOOL_CALL_RISK_LEVELS.forEach((l, idx) => {
      expect(PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA[l].rank).toBe(idx);
    });
  });

  it("rank is unique across levels", () => {
    const ranks = new Set<number>();
    for (const l of PROPOSED_TOOL_CALL_RISK_LEVELS) {
      ranks.add(PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA[l].rank);
    }
    expect(ranks.size).toBe(PROPOSED_TOOL_CALL_RISK_LEVELS.length);
  });

  it("high + critical are exactly the approval-required levels", () => {
    const approval = new Set(
      PROPOSED_TOOL_CALL_RISK_LEVELS.filter(
        (l) => PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA[l].requiresApproval,
      ),
    );
    expect(approval).toEqual(new Set(["high", "critical"]));
  });

  it("requiresApproval implies rank ≥ 2", () => {
    for (const l of PROPOSED_TOOL_CALL_RISK_LEVELS) {
      const md = PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA[l];
      if (md.requiresApproval) {
        expect(md.rank).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const l of PROPOSED_TOOL_CALL_RISK_LEVELS) {
      labels.add(PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA[l].label);
    }
    expect(labels.size).toBe(PROPOSED_TOOL_CALL_RISK_LEVELS.length);
  });
});
