/**
 * GraphRAG ownership audit (boundary tests).
 *
 * Asserts that GraphRAG is NOT a separate RTLM and that Data Analysis
 * is the canonical owner across all wiring registries: KNOWN_MODULES,
 * MODULE_ROUTERS, ALL_MANIFESTS, MODULE_MAP, and the action-key map.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import { dataAnalysisManifest } from "../manifest";
import { ALL_MANIFESTS } from "../../platform/modules/manifests";
import { MODULE_ROUTERS } from "../../platform/modules/module-routers";
import { KNOWN_MODULES } from "../../platform/modules/wiring-inventory";
import { MODULE_MAP } from "../../../scripts/lib/module-graph";
import { ACTION_KEY_MAP } from "../../governance/action-key-map";

const REPO_ROOT = join(__dirname, "..", "..", "..");

describe("GraphRAG ownership boundary", () => {
  it("there is no separate GraphRAG manifest file", () => {
    const candidates = [
      join(REPO_ROOT, "server/graphrag/manifest.ts"),
      join(REPO_ROOT, "server/graphRag/manifest.ts"),
    ];
    for (const p of candidates) {
      expect(existsSync(p)).toBe(false);
    }
  });

  it("there is no graphRag entry in MODULE_ROUTERS / KNOWN_MODULES / MODULE_MAP", () => {
    expect(Object.keys(MODULE_ROUTERS)).not.toContain("graphRag");
    expect(Object.keys(MODULE_ROUTERS)).not.toContain("graphrag");
    expect(KNOWN_MODULES.map((m) => m.key)).not.toContain("graphRag");
    expect(KNOWN_MODULES.map((m) => m.key)).not.toContain("graphrag");
    expect(MODULE_MAP.map((m) => m.key)).not.toContain("graphRag");
    expect(MODULE_MAP.map((m) => m.key)).not.toContain("graphrag");
  });

  it("dataAnalysis is registered in MODULE_ROUTERS / KNOWN_MODULES / MODULE_MAP / ALL_MANIFESTS", () => {
    expect(Object.keys(MODULE_ROUTERS)).toContain("dataAnalysis");
    expect(KNOWN_MODULES.map((m) => m.key)).toContain("dataAnalysis");
    expect(MODULE_MAP.map((m) => m.key)).toContain("dataAnalysis");
    expect(ALL_MANIFESTS.map((m) => m.key)).toContain("dataAnalysis");
  });

  it("MODULE_MAP assigns the graphrag schema to dataAnalysis (not rag)", () => {
    const dataAnalysis = MODULE_MAP.find((m) => m.key === "dataAnalysis");
    const rag = MODULE_MAP.find((m) => m.key === "rag");
    expect(dataAnalysis?.privateSchemas).toContain("graphrag");
    expect(rag?.privateSchemas ?? []).not.toContain("graphrag");
    expect(dataAnalysis?.connectionAccessors).toContain("getDataAnalysisDb");
  });

  it("dataAnalysis manifest declares the canonical graphrag tables as ownedTables", () => {
    expect(dataAnalysisManifest.database.kind).toBe("shared");
    if (dataAnalysisManifest.database.kind === "shared") {
      const owned = dataAnalysisManifest.database.ownedTables ?? [];
      [
        "graphrag_sources",
        "graphrag_sync_runs",
        "graphrag_index_runs",
        "graphrag_query_runs",
        "graphrag_artifact_registry",
      ].forEach((t) => expect(owned).toContain(t));
    }
  });

  it("KGRA Agent does not reference any GraphRAG storage table directly", () => {
    const kgraDir = join(REPO_ROOT, "server/kgra-agent");
    const findings: string[] = [];
    function walk(dir: string) {
      const fs = require("fs") as typeof import("fs");
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.isFile() && p.endsWith(".ts")) {
          const src = readFileSync(p, "utf8");
          for (const t of [
            "graphragSources",
            "graphragSyncRuns",
            "graphragIndexRuns",
            "graphragQueryRuns",
            "graphragArtifactRegistry",
          ]) {
            if (src.includes(t)) findings.push(`${p} → ${t}`);
          }
        }
      }
    }
    if (existsSync(kgraDir)) walk(kgraDir);
    expect(findings).toEqual([]);
  });

  it("the four GraphRAG governance keys are mapped under dataAnalysis namespace", () => {
    [
      "dataAnalysis.graphRag.registerSource",
      "dataAnalysis.graphRag.syncSource",
      "dataAnalysis.graphRag.buildIndex",
      "dataAnalysis.graphRag.query",
    ].forEach((k) => {
      expect(ACTION_KEY_MAP[k]).toBe(k);
    });
  });

  it("graphrag service.ts and jobs.ts use the canonical Data Analysis DB accessor", () => {
    const service = readFileSync(
      join(REPO_ROOT, "server/data-analysis/graphrag/service.ts"),
      "utf8",
    );
    const jobs = readFileSync(
      join(REPO_ROOT, "server/data-analysis/graphrag/jobs.ts"),
      "utf8",
    );
    expect(service).toMatch(/getDataAnalysisDb/);
    expect(jobs).toMatch(/getDataAnalysisDb/);
  });
});
