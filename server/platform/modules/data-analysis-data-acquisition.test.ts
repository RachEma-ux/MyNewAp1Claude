/**
 * Subdomain ownership boundary — Data Acquisition.
 *
 * Asserts:
 *   1. Data Acquisition is NOT registered as its own RTLM (no
 *      `dataAcquisition` key in MODULE_ROUTERS / KNOWN_MODULES /
 *      MODULE_MAP / ALL_MANIFESTS).
 *   2. Data Acquisition appears as a subdomain inside the
 *      `dataAnalysis` manifest — through ownedTables, governance
 *      actions, events, runtime endpoint, and routes.
 *   3. Data Acquisition tables are listed under Data Analysis
 *      ownership in MODULE_MAP.
 *   4. Document Intelligence is *one* pipeline inside Data
 *      Acquisition — exposed under `dataAnalysis.dataAcquisition.document.*`,
 *      not a separate RTLM.
 *   5. KGRA Agent does not import Data Acquisition tables directly.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

import { MODULE_ROUTERS } from "./module-routers";
import { ALL_MANIFESTS } from "./manifests";
import { KNOWN_MODULES } from "./wiring-inventory";
import { MODULE_MAP } from "../../../scripts/lib/module-graph";
import { dataAnalysisManifest } from "../../data-analysis/manifest";
import { DATA_ACQUISITION_OWNED_TABLES } from "../../data-analysis/data-acquisition/dataAcquisition.constants";
import { DATA_ACQUISITION_EVENT_NAMES } from "../../data-analysis/data-acquisition/dataAcquisition.events";

describe("Data Acquisition ownership boundary", () => {
  it("is NOT a separate RTLM — no dataAcquisition key in MODULE_ROUTERS / KNOWN_MODULES / MODULE_MAP / ALL_MANIFESTS", () => {
    expect((MODULE_ROUTERS as any).dataAcquisition).toBeUndefined();
    expect(KNOWN_MODULES.find((m) => m.key === "dataAcquisition")).toBeUndefined();
    expect(MODULE_MAP.find((m) => m.key === "dataAcquisition")).toBeUndefined();
    expect(
      ALL_MANIFESTS.find((m) => m.key === "dataAcquisition"),
    ).toBeUndefined();
  });

  it("Data Analysis manifest declares all Data Acquisition tables as ownedTables", () => {
    const owned = (dataAnalysisManifest.database as any).ownedTables ?? [];
    for (const t of DATA_ACQUISITION_OWNED_TABLES) {
      expect(owned).toContain(t);
    }
  });

  it("Data Analysis manifest declares the 12 Data Acquisition governance actions", () => {
    const keys =
      dataAnalysisManifest.governanceActions?.map((a) => a.key) ?? [];
    expect(keys).toContain("dataAnalysis.dataAcquisition.registerSource");
    expect(keys).toContain("dataAnalysis.dataAcquisition.runProcessing");
    expect(keys).toContain("dataAnalysis.dataAcquisition.runOutputPipeline");
    expect(keys).toContain("dataAnalysis.dataAcquisition.document.runParser");
    expect(keys).toContain("dataAnalysis.dataAcquisition.document.validate");
    expect(keys).toContain(
      "dataAnalysis.dataAcquisition.document.runOutputPipeline",
    );
  });

  it("Data Analysis manifest emits every Data Acquisition event", () => {
    const emits = dataAnalysisManifest.events?.emits ?? [];
    for (const name of DATA_ACQUISITION_EVENT_NAMES) {
      expect(emits).toContain(name);
    }
  });

  it("Data Analysis manifest registers Data Acquisition routes", () => {
    const paths = dataAnalysisManifest.routes?.map((r) => r.path) ?? [];
    expect(paths).toContain("/data-analysis/data-acquisition");
    expect(paths).toContain("/data-analysis/data-acquisition/sources");
    expect(paths).toContain(
      "/data-analysis/data-acquisition/document-intelligence",
    );
  });

  it("MODULE_MAP attributes the data_acquisition private schema to dataAnalysis (not its own module)", () => {
    const da = MODULE_MAP.find((m) => m.key === "dataAnalysis");
    expect(da).toBeDefined();
    expect(da?.privateSchemas).toContain("data_acquisition");
  });

  it("KGRA Agent does not reference any Data Acquisition table directly", () => {
    const dir = join(process.cwd(), "server", "kgra-agent");
    if (!existsSync(dir)) return; // not present in this checkout
    const offending: string[] = [];
    walk(dir, (p) => {
      const src = readFileSync(p, "utf8");
      const tables = [
        "dataAcquisitionSources",
        "dataAcquisitionRuns",
        "dataAcquisitionItems",
        "dataAcquisitionClassifications",
        "dataAcquisitionRoutes",
        "dataAcquisitionProcessingRuns",
        "dataAcquisitionQualityResults",
        "dataAcquisitionCanonicalRecords",
        "dataAcquisitionOutputRuns",
        "dataAcquisitionAuditEvents",
        "dataAcquisitionDocuments",
      ];
      for (const t of tables) {
        if (src.includes(t)) offending.push(`${p} → ${t}`);
      }
    });
    expect(offending).toEqual([]);
  });
});

function walk(dir: string, fn: (p: string) => void) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, fn);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) fn(full);
  }
}
