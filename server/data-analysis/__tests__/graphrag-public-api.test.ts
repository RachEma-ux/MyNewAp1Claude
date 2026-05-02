/**
 * Data Analysis — Public API surface tests.
 *
 * Asserts the manifest registers the canonical 9 GraphRAG public API
 * actions through `registerPublicApi`. Static parse — no boot needed.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MANIFEST_SRC = readFileSync(
  join(__dirname, "..", "manifest.ts"),
  "utf8",
);

const REQUIRED_ACTIONS = [
  "dataAnalysis.graphRag.workerStatus",
  "dataAnalysis.graphRag.registerSource",
  "dataAnalysis.graphRag.syncSource",
  "dataAnalysis.graphRag.buildIndex",
  "dataAnalysis.graphRag.query",
  "dataAnalysis.graphRag.listSources",
  "dataAnalysis.graphRag.listSyncRuns",
  "dataAnalysis.graphRag.listIndexRuns",
  "dataAnalysis.graphRag.listQueryRuns",
];

describe("Data Analysis public-API surface", () => {
  for (const action of REQUIRED_ACTIONS) {
    it(`registers ${action} via registerPublicApi`, () => {
      const re = new RegExp(`action:\\s*"${action.replace(/\./g, "\\.")}"`);
      expect(MANIFEST_SRC).toMatch(re);
    });
  }

  it("buildIndex carries the receiptRequired:true descriptor", () => {
    // Locate the buildIndex registerPublicApi block and assert the
    // descriptor inside has receiptRequired: true.
    const idx = MANIFEST_SRC.indexOf(
      `action: "dataAnalysis.graphRag.buildIndex"`,
    );
    expect(idx).toBeGreaterThan(-1);
    const slice = MANIFEST_SRC.slice(idx, idx + 800);
    expect(slice).toMatch(/descriptor:\s*\{[\s\S]*receiptRequired:\s*true/);
  });
});
