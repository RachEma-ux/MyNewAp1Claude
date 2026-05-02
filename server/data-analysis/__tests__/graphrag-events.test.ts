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

  it("manifest.events.emits is a superset that includes every GraphRAG event", () => {
    // Data Analysis emits both `graphRag.*` and `dataAcquisition.*`
    // events (the latter is the Data Acquisition subdomain). This
    // assertion enforces the GraphRAG subset; the Data Acquisition
    // events have their own catalog test.
    const emits = dataAnalysisManifest.events?.emits ?? [];
    for (const name of DATA_ANALYSIS_EVENT_NAMES) {
      expect(emits).toContain(name);
    }
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
