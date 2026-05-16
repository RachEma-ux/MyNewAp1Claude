/**
 * Phase G §T-G.55 — Runtime-graph-event-kind metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RUNTIME_GRAPH_EVENT_KINDS,
  RUNTIME_GRAPH_EVENT_KIND_METADATA,
  getRuntimeGraphEventKindMetadata,
} from "../../server/agent-studio/services/graph-agent/projection-events.js";

describe("RUNTIME_GRAPH_EVENT_KIND_METADATA (T-G.55)", () => {
  it("has metadata for every closed-taxonomy kind", () => {
    for (const k of RUNTIME_GRAPH_EVENT_KINDS) {
      expect(RUNTIME_GRAPH_EVENT_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RUNTIME_GRAPH_EVENT_KIND_METADATA).length).toBe(
      RUNTIME_GRAPH_EVENT_KINDS.length,
    );
  });

  it.each(RUNTIME_GRAPH_EVENT_KINDS)(
    "%s has non-empty label + description + boolean isDecision",
    (k) => {
      const md = RUNTIME_GRAPH_EVENT_KIND_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.isDecision).toBe("boolean");
    },
  );

  it.each(RUNTIME_GRAPH_EVENT_KINDS)(
    "getRuntimeGraphEventKindMetadata(%s) returns table entry",
    (k) => {
      expect(getRuntimeGraphEventKindMetadata(k)).toBe(
        RUNTIME_GRAPH_EVENT_KIND_METADATA[k],
      );
    },
  );

  it("decision_trace is the only isDecision kind", () => {
    const decisions = RUNTIME_GRAPH_EVENT_KINDS.filter(
      (k) => RUNTIME_GRAPH_EVENT_KIND_METADATA[k].isDecision,
    );
    expect(decisions).toEqual(["decision_trace"]);
  });

  it("runtime_trace is the only !isDecision kind", () => {
    const ambient = RUNTIME_GRAPH_EVENT_KINDS.filter(
      (k) => !RUNTIME_GRAPH_EVENT_KIND_METADATA[k].isDecision,
    );
    expect(ambient).toEqual(["runtime_trace"]);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of RUNTIME_GRAPH_EVENT_KINDS) {
      labels.add(RUNTIME_GRAPH_EVENT_KIND_METADATA[k].label);
    }
    expect(labels.size).toBe(RUNTIME_GRAPH_EVENT_KINDS.length);
  });
});
