/**
 * Phase X §T-X.4 — Contracted-extension-lane metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CONTRACTED_EXTENSION_LANES,
  CONTRACTED_EXTENSION_LANE_METADATA,
  getContractedExtensionLaneMetadata,
} from "../../server/agent-studio/services/extensions/lane-hook-contracts.js";

describe("CONTRACTED_EXTENSION_LANE_METADATA (T-X.4)", () => {
  it("has metadata for every closed-taxonomy lane", () => {
    for (const l of CONTRACTED_EXTENSION_LANES) {
      expect(CONTRACTED_EXTENSION_LANE_METADATA[l]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(CONTRACTED_EXTENSION_LANE_METADATA).length).toBe(
      CONTRACTED_EXTENSION_LANES.length,
    );
  });

  it.each(CONTRACTED_EXTENSION_LANES)(
    "%s has non-empty label + description + valid pipelineOrder + boolean producesContributedChunks",
    (l) => {
      const md = CONTRACTED_EXTENSION_LANE_METADATA[l];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([1, 2, 3]).toContain(md.pipelineOrder);
      expect(typeof md.producesContributedChunks).toBe("boolean");
    },
  );

  it.each(CONTRACTED_EXTENSION_LANES)(
    "getContractedExtensionLaneMetadata(%s) returns table entry",
    (l) => {
      expect(getContractedExtensionLaneMetadata(l)).toBe(
        CONTRACTED_EXTENSION_LANE_METADATA[l],
      );
    },
  );

  it("pipelineOrder matches declaration order (retrieve=1 → compose=3)", () => {
    CONTRACTED_EXTENSION_LANES.forEach((l, idx) => {
      expect(CONTRACTED_EXTENSION_LANE_METADATA[l].pipelineOrder).toBe(idx + 1);
    });
  });

  it("pipelineOrder is unique across lanes", () => {
    const orders = new Set<number>();
    for (const l of CONTRACTED_EXTENSION_LANES) {
      orders.add(CONTRACTED_EXTENSION_LANE_METADATA[l].pipelineOrder);
    }
    expect(orders.size).toBe(CONTRACTED_EXTENSION_LANES.length);
  });

  it("retrieve is the only lane that produces contributed chunks", () => {
    const producers = CONTRACTED_EXTENSION_LANES.filter(
      (l) => CONTRACTED_EXTENSION_LANE_METADATA[l].producesContributedChunks,
    );
    expect(producers).toEqual(["retrieve"]);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const l of CONTRACTED_EXTENSION_LANES) {
      labels.add(CONTRACTED_EXTENSION_LANE_METADATA[l].label);
    }
    expect(labels.size).toBe(CONTRACTED_EXTENSION_LANES.length);
  });
});
