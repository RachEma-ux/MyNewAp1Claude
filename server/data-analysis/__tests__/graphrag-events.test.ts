/**
 * Data Analysis — GraphRAG events tests.
 *
 * Verifies the canonical event constants align with the manifest's
 * declared `events.emits` list and follow the `dataAnalysis.graphRag.*`
 * namespace.
 */

import { describe, it, expect } from "vitest";
import {
  DATA_ANALYSIS_EVENTS,
  DATA_ANALYSIS_EVENT_NAMES,
} from "../events";
import { dataAnalysisManifest } from "../manifest";

describe("Data Analysis events catalog", () => {
  it("has 12 event names — the full GraphRAG subdomain lifecycle", () => {
    expect(Object.keys(DATA_ANALYSIS_EVENTS)).toHaveLength(12);
    expect(DATA_ANALYSIS_EVENT_NAMES).toHaveLength(12);
  });

  it("every event uses the dataAnalysis.graphRag.* namespace", () => {
    for (const name of DATA_ANALYSIS_EVENT_NAMES) {
      expect(name).toMatch(/^dataAnalysis\.graphRag\./);
    }
  });

  it("manifest.events.emits is an exact match of DATA_ANALYSIS_EVENT_NAMES", () => {
    const emits = (dataAnalysisManifest.events?.emits ?? []).slice().sort();
    const names = DATA_ANALYSIS_EVENT_NAMES.slice().sort();
    expect(emits).toEqual(names);
  });

  it("includes both worker availability transitions", () => {
    expect(DATA_ANALYSIS_EVENTS.graphRagWorkerUnavailable).toBe(
      "dataAnalysis.graphRag.workerUnavailable",
    );
    expect(DATA_ANALYSIS_EVENTS.graphRagWorkerRecovered).toBe(
      "dataAnalysis.graphRag.workerRecovered",
    );
  });

  it("includes failed transitions for each lifecycle stage", () => {
    expect(DATA_ANALYSIS_EVENT_NAMES).toContain(
      "dataAnalysis.graphRag.syncFailed",
    );
    expect(DATA_ANALYSIS_EVENT_NAMES).toContain(
      "dataAnalysis.graphRag.indexFailed",
    );
    expect(DATA_ANALYSIS_EVENT_NAMES).toContain(
      "dataAnalysis.graphRag.queryFailed",
    );
  });
});
