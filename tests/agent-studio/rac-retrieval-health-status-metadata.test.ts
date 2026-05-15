/**
 * Phase 11 §T-A.9 — RAC retrieval-health status metadata lockstep.
 * Also covers the union→tuple promotion of `RacRetrievalHealthStatus`.
 */

import { describe, it, expect } from "vitest";
import {
  RAC_RETRIEVAL_HEALTH_STATUSES,
  RAC_RETRIEVAL_HEALTH_STATUS_METADATA,
  getRacRetrievalHealthStatusMetadata,
} from "../../server/agent-studio/services/rac/ingestion/index.js";

describe("RAC_RETRIEVAL_HEALTH_STATUS_METADATA (T-A.9)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of RAC_RETRIEVAL_HEALTH_STATUSES) {
      expect(RAC_RETRIEVAL_HEALTH_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RAC_RETRIEVAL_HEALTH_STATUS_METADATA).length).toBe(
      RAC_RETRIEVAL_HEALTH_STATUSES.length,
    );
  });

  it.each(RAC_RETRIEVAL_HEALTH_STATUSES)(
    "%s has non-empty label + description + booleans",
    (s) => {
      const md = RAC_RETRIEVAL_HEALTH_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(1);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.attemptRetrieval).toBe("boolean");
      expect(typeof md.notifyOperator).toBe("boolean");
    },
  );

  it.each(RAC_RETRIEVAL_HEALTH_STATUSES)(
    "getRacRetrievalHealthStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getRacRetrievalHealthStatusMetadata(s)).toBe(
        RAC_RETRIEVAL_HEALTH_STATUS_METADATA[s],
      );
    },
  );

  it("only `unavailable` blocks retrieval", () => {
    expect(
      RAC_RETRIEVAL_HEALTH_STATUS_METADATA.unavailable.attemptRetrieval,
    ).toBe(false);
    expect(RAC_RETRIEVAL_HEALTH_STATUS_METADATA.ok.attemptRetrieval).toBe(
      true,
    );
    expect(
      RAC_RETRIEVAL_HEALTH_STATUS_METADATA.degraded.attemptRetrieval,
    ).toBe(true);
    expect(RAC_RETRIEVAL_HEALTH_STATUS_METADATA.unknown.attemptRetrieval).toBe(
      true,
    );
  });

  it("degraded and unavailable notify the operator; ok and unknown do not", () => {
    expect(RAC_RETRIEVAL_HEALTH_STATUS_METADATA.ok.notifyOperator).toBe(false);
    expect(RAC_RETRIEVAL_HEALTH_STATUS_METADATA.degraded.notifyOperator).toBe(
      true,
    );
    expect(
      RAC_RETRIEVAL_HEALTH_STATUS_METADATA.unavailable.notifyOperator,
    ).toBe(true);
    expect(RAC_RETRIEVAL_HEALTH_STATUS_METADATA.unknown.notifyOperator).toBe(
      false,
    );
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of RAC_RETRIEVAL_HEALTH_STATUSES) {
      labels.add(RAC_RETRIEVAL_HEALTH_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(RAC_RETRIEVAL_HEALTH_STATUSES.length);
  });
});
