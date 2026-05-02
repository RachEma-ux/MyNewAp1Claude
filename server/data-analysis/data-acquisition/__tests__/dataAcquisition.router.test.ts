/**
 * Data Acquisition router shape test.
 *
 * Verifies the router is wired under `dataAnalysisRouter.dataAcquisition`
 * and exposes the expected procedures.
 */

import { describe, expect, it } from "vitest";

import { dataAcquisitionRouter } from "../dataAcquisition.router";
import { dataAnalysisRouter } from "../../router";

describe("Data Acquisition tRPC router", () => {
  it("is mounted under dataAnalysisRouter.dataAcquisition", () => {
    const sub = (dataAnalysisRouter as any)._def.procedures
      ?? (dataAnalysisRouter as any)._def.record;
    // tRPC v11 nested routers expose their own _def
    expect((dataAnalysisRouter as any)._def.record?.dataAcquisition).toBeDefined();
  });

  it("declares the canonical procedure set", () => {
    const def = (dataAcquisitionRouter as any)._def.record;
    expect(def.workerStatus).toBeDefined();
    expect(def.summary).toBeDefined();
    expect(def.registerSource).toBeDefined();
    expect(def.runAcquisition).toBeDefined();
    expect(def.discoverItems).toBeDefined();
    expect(def.classifyItem).toBeDefined();
    expect(def.routeItem).toBeDefined();
    expect(def.runProcessing).toBeDefined();
    expect(def.runOutputPipeline).toBeDefined();
    expect(def.getCanonicalRecord).toBeDefined();
    expect(def.listSources).toBeDefined();
    expect(def.listRuns).toBeDefined();
    expect(def.listItems).toBeDefined();
    expect(def.listClassifications).toBeDefined();
    expect(def.listRoutes).toBeDefined();
    expect(def.listProcessingRuns).toBeDefined();
    expect(def.listCanonicalRecords).toBeDefined();
    expect(def.listOutputRuns).toBeDefined();
    expect(def.document).toBeDefined();
  });

  it("exposes a document sub-router with classify/routeParser/runParser/validate/getCanonical", () => {
    const document = (dataAcquisitionRouter as any)._def.record?.document;
    expect(document).toBeDefined();
    // tRPC v11 nested-router shape may surface either as `_def.record`
    // or via flattened `procedures` keys — accept both.
    const docDef =
      document?._def?.record ??
      document?._def?.procedures ??
      Object.fromEntries(
        Object.keys(document ?? {})
          .filter((k) => !k.startsWith("_"))
          .map((k) => [k, true]),
      );
    expect(docDef).toBeDefined();
    for (const k of [
      "classify",
      "routeParser",
      "runParser",
      "validate",
      "getCanonical",
    ]) {
      expect(Boolean((docDef as any)[k])).toBe(true);
    }
  });
});
