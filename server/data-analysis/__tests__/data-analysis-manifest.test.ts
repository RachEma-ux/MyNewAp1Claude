/**
 * Data Analysis — Manifest contract tests.
 *
 * Verifies the manifest declares the canonical RTLM identity, GraphRAG
 * subdomain ownership, governance actions, events, ports, and routes.
 */

import { describe, it, expect } from "vitest";
import { dataAnalysisManifest } from "../manifest";

describe("dataAnalysisManifest", () => {
  it("declares the canonical RTLM identity", () => {
    expect(dataAnalysisManifest.key).toBe("dataAnalysis");
    expect(dataAnalysisManifest.routerKey).toBe("dataAnalysis");
    expect(dataAnalysisManifest.name).toBe("Data Analysis");
    expect(dataAnalysisManifest.version).toBe("1.0.0");
  });

  it("declares Phase-1 staged DB ownership of GraphRAG tables", () => {
    expect(dataAnalysisManifest.database.kind).toBe("shared");
    if (dataAnalysisManifest.database.kind === "shared") {
      const owned = dataAnalysisManifest.database.ownedTables ?? [];
      expect(owned).toContain("graphrag_sources");
      expect(owned).toContain("graphrag_sync_runs");
      expect(owned).toContain("graphrag_index_runs");
      expect(owned).toContain("graphrag_query_runs");
      expect(owned).toContain("graphrag_artifact_registry");
    }
  });

  it("declares the four required governance actions with the correct receipt rules", () => {
    const byKey = new Map(
      (dataAnalysisManifest.governanceActions ?? []).map((a) => [a.key, a]),
    );
    expect(byKey.has("dataAnalysis.graphRag.registerSource")).toBe(true);
    expect(byKey.has("dataAnalysis.graphRag.syncSource")).toBe(true);
    expect(byKey.has("dataAnalysis.graphRag.buildIndex")).toBe(true);
    expect(byKey.has("dataAnalysis.graphRag.query")).toBe(true);
    expect(byKey.get("dataAnalysis.graphRag.buildIndex")?.receiptRequired).toBe(
      true,
    );
    expect(
      byKey.get("dataAnalysis.graphRag.registerSource")?.receiptRequired,
    ).toBe(false);
  });

  it("emits all twelve GraphRAG subdomain events", () => {
    const emits = dataAnalysisManifest.events?.emits ?? [];
    [
      "dataAnalysis.graphRag.sourceRegistered",
      "dataAnalysis.graphRag.syncStarted",
      "dataAnalysis.graphRag.syncCompleted",
      "dataAnalysis.graphRag.syncFailed",
      "dataAnalysis.graphRag.indexStarted",
      "dataAnalysis.graphRag.indexCompleted",
      "dataAnalysis.graphRag.indexFailed",
      "dataAnalysis.graphRag.queryStarted",
      "dataAnalysis.graphRag.queryCompleted",
      "dataAnalysis.graphRag.queryFailed",
      "dataAnalysis.graphRag.workerUnavailable",
      "dataAnalysis.graphRag.workerRecovered",
    ].forEach((e) => expect(emits).toContain(e));
  });

  it("declares the GraphRAG worker as a runtime port (Data Analysis-owned)", () => {
    expect(dataAnalysisManifest.ports?.provided ?? []).toContain(
      "dataAnalysis.read",
    );
    expect(dataAnalysisManifest.ports?.provided ?? []).toContain(
      "dataAnalysis.graphRag.read",
    );
  });

  it("does not produce or accept handoffs (consumer-only via gateway)", () => {
    expect(dataAnalysisManifest.handoffs?.accepts ?? []).toEqual([]);
    expect(dataAnalysisManifest.handoffs?.produces ?? []).toEqual([]);
  });

  it("declares /data-analysis and /data-analysis/graphrag routes", () => {
    const paths = (dataAnalysisManifest.routes ?? []).map((r) => r.path);
    expect(paths).toContain("/data-analysis");
    expect(paths).toContain("/data-analysis/graphrag");
  });

  it("provides dataAnalysis.read + dataAnalysis.graphRag.read permissions", () => {
    const keys = dataAnalysisManifest.permissions?.keys ?? [];
    expect(keys).toContain("dataAnalysis.read");
    expect(keys).toContain("dataAnalysis.graphRag.read");
  });
});
