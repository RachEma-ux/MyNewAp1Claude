/**
 * Phase E §T-E.3 — publish-targets governance-decision metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GOVERNANCE_DECISIONS,
  GOVERNANCE_DECISION_METADATA,
  getGovernanceDecisionMetadata,
} from "../../server/agent-studio/services/publish-targets/index.js";

describe("GOVERNANCE_DECISION_METADATA (T-E.3)", () => {
  it("has metadata for every closed-taxonomy decision", () => {
    for (const d of GOVERNANCE_DECISIONS) {
      expect(GOVERNANCE_DECISION_METADATA[d]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(GOVERNANCE_DECISION_METADATA).length).toBe(
      GOVERNANCE_DECISIONS.length,
    );
  });

  it.each(GOVERNANCE_DECISIONS)(
    "%s has non-empty label + description + valid executorBranch + boolean requiresHumanApproval",
    (d) => {
      const md = GOVERNANCE_DECISION_METADATA[d];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([
        "runs_pusher",
        "stages_ledger_only",
        "blocks_pusher",
      ]).toContain(md.executorBranch);
      expect(typeof md.requiresHumanApproval).toBe("boolean");
    },
  );

  it.each(GOVERNANCE_DECISIONS)(
    "getGovernanceDecisionMetadata(%s) returns table entry",
    (d) => {
      expect(getGovernanceDecisionMetadata(d)).toBe(
        GOVERNANCE_DECISION_METADATA[d],
      );
    },
  );

  it("only approved runs the pusher", () => {
    expect(GOVERNANCE_DECISION_METADATA.approved.executorBranch).toBe(
      "runs_pusher",
    );
    expect(GOVERNANCE_DECISION_METADATA.pending.executorBranch).toBe(
      "stages_ledger_only",
    );
    expect(GOVERNANCE_DECISION_METADATA.rejected.executorBranch).toBe(
      "blocks_pusher",
    );
  });

  it("approved and rejected require human approval; pending does not", () => {
    expect(GOVERNANCE_DECISION_METADATA.approved.requiresHumanApproval).toBe(
      true,
    );
    expect(GOVERNANCE_DECISION_METADATA.rejected.requiresHumanApproval).toBe(
      true,
    );
    expect(GOVERNANCE_DECISION_METADATA.pending.requiresHumanApproval).toBe(
      false,
    );
  });

  it("every executorBranch has at least one decision assigned", () => {
    const used = new Set<string>();
    for (const d of GOVERNANCE_DECISIONS) {
      used.add(GOVERNANCE_DECISION_METADATA[d].executorBranch);
    }
    expect(used.has("runs_pusher")).toBe(true);
    expect(used.has("stages_ledger_only")).toBe(true);
    expect(used.has("blocks_pusher")).toBe(true);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const d of GOVERNANCE_DECISIONS) {
      labels.add(GOVERNANCE_DECISION_METADATA[d].label);
    }
    expect(labels.size).toBe(GOVERNANCE_DECISIONS.length);
  });
});
