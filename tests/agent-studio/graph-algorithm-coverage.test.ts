/**
 * Phase 26 §T-G.17 — graph-algorithm coverage summary lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_ALGORITHM_KINDS,
  GRAPH_ALGORITHM_BACKEND_SUPPORT,
  GRAPH_ALGORITHM_METADATA,
  listAlgorithmsAvailableOnCe,
  listAlgorithmsTriggeringAuraUpgrade,
  summarizeGraphAlgorithmCoverage,
} from "../../server/agent-studio/services/graph-algorithm/public-api.js";

describe("summarizeGraphAlgorithmCoverage (T-G.17)", () => {
  it("total matches GRAPH_ALGORITHM_KINDS.length", () => {
    expect(summarizeGraphAlgorithmCoverage().total).toBe(
      GRAPH_ALGORITHM_KINDS.length,
    );
  });

  it("byBackendSupport has every closed key (stable-shape)", () => {
    const s = summarizeGraphAlgorithmCoverage();
    expect(Object.keys(s.byBackendSupport).length).toBe(
      GRAPH_ALGORITHM_BACKEND_SUPPORT.length,
    );
    for (const k of GRAPH_ALGORITHM_BACKEND_SUPPORT) {
      expect(s.byBackendSupport[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it("Σ byBackendSupport == total", () => {
    const s = summarizeGraphAlgorithmCoverage();
    const sum = Object.values(s.byBackendSupport).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
  });

  it("availableOnCe matches listAlgorithmsAvailableOnCe().length", () => {
    expect(summarizeGraphAlgorithmCoverage().availableOnCe).toBe(
      listAlgorithmsAvailableOnCe().length,
    );
  });

  it("triggersAuraUpgrade matches listAlgorithmsTriggeringAuraUpgrade().length", () => {
    expect(summarizeGraphAlgorithmCoverage().triggersAuraUpgrade).toBe(
      listAlgorithmsTriggeringAuraUpgrade().length,
    );
  });

  it("cePercent in [0, 100] with 1-decimal precision", () => {
    const s = summarizeGraphAlgorithmCoverage();
    expect(s.cePercent).toBeGreaterThanOrEqual(0);
    expect(s.cePercent).toBeLessThanOrEqual(100);
    expect(Math.round(s.cePercent * 10) / 10).toBe(s.cePercent);
  });

  it("cePercent == 100 * availableOnCe / total (within 0.1)", () => {
    const s = summarizeGraphAlgorithmCoverage();
    const expected = Math.round((s.availableOnCe / s.total) * 1000) / 10;
    expect(s.cePercent).toBe(expected);
  });

  it("availableOnCe == count of kinds with neo4j_ce_native|via_apoc", () => {
    const s = summarizeGraphAlgorithmCoverage();
    const expected = GRAPH_ALGORITHM_KINDS.filter(
      (k) =>
        GRAPH_ALGORITHM_METADATA[k].backendSupport === "neo4j_ce_native" ||
        GRAPH_ALGORITHM_METADATA[k].backendSupport === "neo4j_ce_via_apoc",
    ).length;
    expect(s.availableOnCe).toBe(expected);
  });

  it("is pure — returns the same value across calls", () => {
    const a = summarizeGraphAlgorithmCoverage();
    const b = summarizeGraphAlgorithmCoverage();
    expect(a).toEqual(b);
  });
});
