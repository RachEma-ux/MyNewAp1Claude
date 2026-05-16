/**
 * Phase G §T-G.50 — Graph-backend health-status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_BACKEND_HEALTH_STATUSES,
  GRAPH_BACKEND_HEALTH_STATUS_METADATA,
  getGraphBackendHealthStatusMetadata,
} from "../../server/agent-studio/services/graph/repository/types.js";

describe("GRAPH_BACKEND_HEALTH_STATUS_METADATA (T-G.50)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of GRAPH_BACKEND_HEALTH_STATUSES) {
      expect(GRAPH_BACKEND_HEALTH_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(GRAPH_BACKEND_HEALTH_STATUS_METADATA).length,
    ).toBe(GRAPH_BACKEND_HEALTH_STATUSES.length);
  });

  it.each(GRAPH_BACKEND_HEALTH_STATUSES)(
    "%s has non-empty label + description + boolean servesReads + boolean requiresInvestigation",
    (s) => {
      const md = GRAPH_BACKEND_HEALTH_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.servesReads).toBe("boolean");
      expect(typeof md.requiresInvestigation).toBe("boolean");
    },
  );

  it.each(GRAPH_BACKEND_HEALTH_STATUSES)(
    "getGraphBackendHealthStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getGraphBackendHealthStatusMetadata(s)).toBe(
        GRAPH_BACKEND_HEALTH_STATUS_METADATA[s],
      );
    },
  );

  it("unavailable is the only status that does not serve reads", () => {
    const blocked = GRAPH_BACKEND_HEALTH_STATUSES.filter(
      (s) => !GRAPH_BACKEND_HEALTH_STATUS_METADATA[s].servesReads,
    );
    expect(blocked).toEqual(["unavailable"]);
  });

  it("healthy is the only status not requiring investigation", () => {
    const ok = GRAPH_BACKEND_HEALTH_STATUSES.filter(
      (s) => !GRAPH_BACKEND_HEALTH_STATUS_METADATA[s].requiresInvestigation,
    );
    expect(ok).toEqual(["healthy"]);
  });

  it("requiresInvestigation OR !servesReads partitions correctly", () => {
    for (const s of GRAPH_BACKEND_HEALTH_STATUSES) {
      const md = GRAPH_BACKEND_HEALTH_STATUS_METADATA[s];
      if (!md.servesReads) {
        expect(md.requiresInvestigation).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of GRAPH_BACKEND_HEALTH_STATUSES) {
      labels.add(GRAPH_BACKEND_HEALTH_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(GRAPH_BACKEND_HEALTH_STATUSES.length);
  });
});
