/**
 * Phase A §T-A.11 — RAC planner-mode-family metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RAC_PLANNER_MODE_FAMILIES,
  RAC_PLANNER_MODE_FAMILY_METADATA,
  getRacPlannerModeFamilyMetadata,
} from "../../server/agent-studio/services/rac/planner-mode.js";

const VALID_RETRIEVAL_KINDS = [
  "none",
  "cag",
  "knowledge",
  "graph",
  "hybrid",
] as const;

describe("RAC_PLANNER_MODE_FAMILY_METADATA (T-A.11)", () => {
  it("has metadata for every closed-taxonomy family", () => {
    for (const f of RAC_PLANNER_MODE_FAMILIES) {
      expect(RAC_PLANNER_MODE_FAMILY_METADATA[f]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RAC_PLANNER_MODE_FAMILY_METADATA).length).toBe(
      RAC_PLANNER_MODE_FAMILIES.length,
    );
  });

  it.each(RAC_PLANNER_MODE_FAMILIES)(
    "%s has non-empty label + description + valid retrievalKind + boolean usesGraph",
    (f) => {
      const md = RAC_PLANNER_MODE_FAMILY_METADATA[f];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(VALID_RETRIEVAL_KINDS).toContain(md.retrievalKind);
      expect(typeof md.usesGraph).toBe("boolean");
    },
  );

  it.each(RAC_PLANNER_MODE_FAMILIES)(
    "getRacPlannerModeFamilyMetadata(%s) returns table entry",
    (f) => {
      expect(getRacPlannerModeFamilyMetadata(f)).toBe(
        RAC_PLANNER_MODE_FAMILY_METADATA[f],
      );
    },
  );

  it("no_retrieval is the only `none` retrievalKind", () => {
    const none = RAC_PLANNER_MODE_FAMILIES.filter(
      (f) => RAC_PLANNER_MODE_FAMILY_METADATA[f].retrievalKind === "none",
    );
    expect(none).toEqual(["no_retrieval"]);
  });

  it("graphrag_pure is the only `graph` retrievalKind", () => {
    const graph = RAC_PLANNER_MODE_FAMILIES.filter(
      (f) => RAC_PLANNER_MODE_FAMILY_METADATA[f].retrievalKind === "graph",
    );
    expect(graph).toEqual(["graphrag_pure"]);
  });

  it("hybrid_cag + graphrag_hybrid are exactly the `hybrid` retrievalKinds", () => {
    const hybrid = new Set(
      RAC_PLANNER_MODE_FAMILIES.filter(
        (f) => RAC_PLANNER_MODE_FAMILY_METADATA[f].retrievalKind === "hybrid",
      ),
    );
    expect(hybrid).toEqual(new Set(["hybrid_cag", "graphrag_hybrid"]));
  });

  it("graphrag_pure + graphrag_hybrid are exactly the usesGraph families", () => {
    const graph = new Set(
      RAC_PLANNER_MODE_FAMILIES.filter(
        (f) => RAC_PLANNER_MODE_FAMILY_METADATA[f].usesGraph,
      ),
    );
    expect(graph).toEqual(new Set(["graphrag_pure", "graphrag_hybrid"]));
  });

  it("no usesGraph family has retrievalKind === none", () => {
    for (const f of RAC_PLANNER_MODE_FAMILIES) {
      const md = RAC_PLANNER_MODE_FAMILY_METADATA[f];
      if (md.usesGraph) {
        expect(md.retrievalKind).not.toBe("none");
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const f of RAC_PLANNER_MODE_FAMILIES) {
      labels.add(RAC_PLANNER_MODE_FAMILY_METADATA[f].label);
    }
    expect(labels.size).toBe(RAC_PLANNER_MODE_FAMILIES.length);
  });
});
