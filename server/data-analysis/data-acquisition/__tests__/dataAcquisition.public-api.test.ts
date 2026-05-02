/**
 * Data Acquisition public-API surface test (static parse — no boot).
 *
 * Asserts the canonical 15 Data Acquisition public-API actions are
 * registered via `registerPublicApi(...)` in the Data Analysis
 * manifest, and that receipt-required actions carry the descriptor.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MANIFEST_SRC = readFileSync(
  join(__dirname, "..", "..", "manifest.ts"),
  "utf8",
);

const REQUIRED_ACTIONS = [
  "dataAnalysis.dataAcquisition.workerStatus",
  "dataAnalysis.dataAcquisition.summary",
  "dataAnalysis.dataAcquisition.registerSource",
  "dataAnalysis.dataAcquisition.updateSource",
  "dataAnalysis.dataAcquisition.disableSource",
  "dataAnalysis.dataAcquisition.runAcquisition",
  "dataAnalysis.dataAcquisition.discoverItems",
  "dataAnalysis.dataAcquisition.classifyItem",
  "dataAnalysis.dataAcquisition.routeItem",
  "dataAnalysis.dataAcquisition.runProcessing",
  "dataAnalysis.dataAcquisition.runOutputPipeline",
  "dataAnalysis.dataAcquisition.exportCanonicalRecord",
  "dataAnalysis.dataAcquisition.getCanonicalRecord",
  "dataAnalysis.dataAcquisition.document.classify",
  "dataAnalysis.dataAcquisition.document.routeParser",
  "dataAnalysis.dataAcquisition.document.runParser",
  "dataAnalysis.dataAcquisition.document.validate",
  "dataAnalysis.dataAcquisition.document.runOutputPipeline",
  "dataAnalysis.dataAcquisition.document.getCanonical",
];

describe("Data Acquisition public-API surface", () => {
  for (const action of REQUIRED_ACTIONS) {
    it(`registers ${action} via registerPublicApi`, () => {
      const re = new RegExp(`action:\\s*"${action.replace(/\./g, "\\.")}"`);
      expect(MANIFEST_SRC).toMatch(re);
    });
  }

  it("runProcessing carries the receiptRequired:true descriptor", () => {
    const idx = MANIFEST_SRC.indexOf(
      `action: "dataAnalysis.dataAcquisition.runProcessing"`,
    );
    expect(idx).toBeGreaterThan(-1);
    const slice = MANIFEST_SRC.slice(idx, idx + 1200);
    expect(slice).toMatch(/descriptor:\s*\{[\s\S]*receiptRequired:\s*true/);
  });

  it("runOutputPipeline carries the receiptRequired:true descriptor", () => {
    const idx = MANIFEST_SRC.indexOf(
      `action: "dataAnalysis.dataAcquisition.runOutputPipeline"`,
    );
    expect(idx).toBeGreaterThan(-1);
    const slice = MANIFEST_SRC.slice(idx, idx + 1200);
    expect(slice).toMatch(/descriptor:\s*\{[\s\S]*receiptRequired:\s*true/);
  });

  it("document.runParser carries the receiptRequired:true descriptor", () => {
    const idx = MANIFEST_SRC.indexOf(
      `action: "dataAnalysis.dataAcquisition.document.runParser"`,
    );
    expect(idx).toBeGreaterThan(-1);
    const slice = MANIFEST_SRC.slice(idx, idx + 1200);
    expect(slice).toMatch(/descriptor:\s*\{[\s\S]*receiptRequired:\s*true/);
  });
});
