/**
 * Phase H §T-H.1 — graph-health alert-key metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_HEALTH_ALERT_KEYS,
  GRAPH_HEALTH_ALERT_KEY_METADATA,
  getGraphHealthAlertKeyMetadata,
} from "../../server/agent-studio/services/graph/health-alert.js";

describe("GRAPH_HEALTH_ALERT_KEY_METADATA (T-H.1)", () => {
  it("has metadata for every closed-taxonomy key", () => {
    for (const k of GRAPH_HEALTH_ALERT_KEYS) {
      expect(GRAPH_HEALTH_ALERT_KEY_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(GRAPH_HEALTH_ALERT_KEY_METADATA).length).toBe(
      GRAPH_HEALTH_ALERT_KEYS.length,
    );
  });

  it.each(GRAPH_HEALTH_ALERT_KEYS)(
    "%s has non-empty label + description + valid defaultSeverity + boolean recoverable",
    (k) => {
      const md = GRAPH_HEALTH_ALERT_KEY_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(["info", "warning", "critical"]).toContain(md.defaultSeverity);
      expect(typeof md.recoverable).toBe("boolean");
    },
  );

  it.each(GRAPH_HEALTH_ALERT_KEYS)(
    "getGraphHealthAlertKeyMetadata(%s) returns table entry",
    (k) => {
      expect(getGraphHealthAlertKeyMetadata(k)).toBe(
        GRAPH_HEALTH_ALERT_KEY_METADATA[k],
      );
    },
  );

  it("only `graph_health_unavailable` is non-recoverable + critical", () => {
    expect(
      GRAPH_HEALTH_ALERT_KEY_METADATA.graph_health_unavailable.recoverable,
    ).toBe(false);
    expect(
      GRAPH_HEALTH_ALERT_KEY_METADATA.graph_health_unavailable.defaultSeverity,
    ).toBe("critical");
    expect(
      GRAPH_HEALTH_ALERT_KEY_METADATA.graph_health_latency_high.recoverable,
    ).toBe(true);
    expect(
      GRAPH_HEALTH_ALERT_KEY_METADATA.graph_health_degraded.recoverable,
    ).toBe(true);
  });

  it("recoverable alerts default to severity=warning; non-recoverable defaults to critical", () => {
    for (const k of GRAPH_HEALTH_ALERT_KEYS) {
      const md = GRAPH_HEALTH_ALERT_KEY_METADATA[k];
      if (md.recoverable) {
        expect(md.defaultSeverity).toBe("warning");
      } else {
        expect(md.defaultSeverity).toBe("critical");
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of GRAPH_HEALTH_ALERT_KEYS) {
      labels.add(GRAPH_HEALTH_ALERT_KEY_METADATA[k].label);
    }
    expect(labels.size).toBe(GRAPH_HEALTH_ALERT_KEYS.length);
  });
});
