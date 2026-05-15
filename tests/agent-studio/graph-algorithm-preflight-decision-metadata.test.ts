/**
 * Phase 25 §T-G.33 — graph-algorithm preflight-decision metadata lockstep.
 * Also covers the union→tuple promotion of `GraphAlgorithmPreflightDecision`.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_ALGORITHM_PREFLIGHT_DECISIONS,
  GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA,
  getGraphAlgorithmPreflightDecisionMetadata,
  preflightAlgorithmRequest,
  GRAPH_ALGORITHM_KINDS,
} from "../../server/agent-studio/services/graph-algorithm/public-api.js";

describe("GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA (T-G.33)", () => {
  it("has metadata for every closed-taxonomy decision", () => {
    for (const d of GRAPH_ALGORITHM_PREFLIGHT_DECISIONS) {
      expect(GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA[d]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA).length,
    ).toBe(GRAPH_ALGORITHM_PREFLIGHT_DECISIONS.length);
  });

  it.each(GRAPH_ALGORITHM_PREFLIGHT_DECISIONS)(
    "%s has non-empty label + description + booleans",
    (d) => {
      const m = GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA[d];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(30);
      expect(typeof m.runnable).toBe("boolean");
      expect(typeof m.showUpgradeBanner).toBe("boolean");
    },
  );

  it.each(GRAPH_ALGORITHM_PREFLIGHT_DECISIONS)(
    "getGraphAlgorithmPreflightDecisionMetadata(%s) returns table entry",
    (d) => {
      expect(getGraphAlgorithmPreflightDecisionMetadata(d)).toBe(
        GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA[d],
      );
    },
  );

  it("requires_aura_upgrade is the only non-runnable decision", () => {
    for (const d of GRAPH_ALGORITHM_PREFLIGHT_DECISIONS) {
      const expectedRunnable = d !== "requires_aura_upgrade";
      expect(GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA[d].runnable).toBe(
        expectedRunnable,
      );
    }
  });

  it("approximation and aura-upgrade decisions both surface the upgrade banner", () => {
    expect(
      GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA.runnable_via_approximation
        .showUpgradeBanner,
    ).toBe(true);
    expect(
      GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA.requires_aura_upgrade
        .showUpgradeBanner,
    ).toBe(true);
  });

  it("CE-native and CE+APOC decisions do NOT surface the upgrade banner", () => {
    expect(
      GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA.runnable_on_ce_native
        .showUpgradeBanner,
    ).toBe(false);
    expect(
      GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA.runnable_on_ce_via_apoc
        .showUpgradeBanner,
    ).toBe(false);
  });

  it("preflightAlgorithmRequest only emits closed-taxonomy decisions", () => {
    for (const kind of GRAPH_ALGORITHM_KINDS) {
      const out = preflightAlgorithmRequest({
        kind,
        workspaceId: 1,
        scopeId: "test",
      });
      expect(GRAPH_ALGORITHM_PREFLIGHT_DECISIONS).toContain(out.decision);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const d of GRAPH_ALGORITHM_PREFLIGHT_DECISIONS) {
      labels.add(GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA[d].label);
    }
    expect(labels.size).toBe(GRAPH_ALGORITHM_PREFLIGHT_DECISIONS.length);
  });
});
