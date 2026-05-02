/**
 * Data Acquisition — events catalog test.
 *
 * Asserts event names, the `dataAnalysis.dataAcquisition.*` namespace,
 * and that `manifest.events.emits` is a superset that includes every
 * Data Acquisition event.
 */

import { describe, expect, it } from "vitest";

import {
  DATA_ACQUISITION_EVENT_NAMES,
  DATA_ACQUISITION_EVENTS,
} from "../dataAcquisition.events";
import { dataAnalysisManifest } from "../../manifest";

describe("Data Acquisition events catalog", () => {
  it("declares 21 lifecycle events (generic + worker + document)", () => {
    expect(DATA_ACQUISITION_EVENT_NAMES.length).toBe(21);
  });

  it("every event uses the dataAnalysis.dataAcquisition.* namespace", () => {
    for (const name of DATA_ACQUISITION_EVENT_NAMES) {
      expect(name.startsWith("dataAnalysis.dataAcquisition.")).toBe(true);
    }
  });

  it("manifest.events.emits is a superset that includes every Data Acquisition event", () => {
    const emits = dataAnalysisManifest.events?.emits ?? [];
    for (const name of DATA_ACQUISITION_EVENT_NAMES) {
      expect(emits).toContain(name);
    }
  });

  it("includes both worker availability transitions", () => {
    const names = new Set<string>(DATA_ACQUISITION_EVENT_NAMES);
    expect(names.has(DATA_ACQUISITION_EVENTS.workerUnavailable)).toBe(true);
    expect(names.has(DATA_ACQUISITION_EVENTS.workerRecovered)).toBe(true);
  });

  it("includes failed transitions for processing and output pipelines", () => {
    const names = new Set<string>(DATA_ACQUISITION_EVENT_NAMES);
    expect(names.has(DATA_ACQUISITION_EVENTS.acquisitionFailed)).toBe(true);
    expect(names.has(DATA_ACQUISITION_EVENTS.processingFailed)).toBe(true);
    expect(names.has(DATA_ACQUISITION_EVENTS.outputPipelineFailed)).toBe(true);
  });

  it("includes document-specific sub-events", () => {
    const names = new Set<string>(DATA_ACQUISITION_EVENT_NAMES);
    expect(names.has(DATA_ACQUISITION_EVENTS.documentParserSelected)).toBe(true);
    expect(names.has(DATA_ACQUISITION_EVENTS.documentValidated)).toBe(true);
  });
});
