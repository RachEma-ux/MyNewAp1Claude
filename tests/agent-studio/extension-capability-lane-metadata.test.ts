/**
 * Phase X §T-X.2 — extension capability-lane metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  EXTENSION_CAPABILITY_LANES,
  EXTENSION_CAPABILITY_LANE_METADATA,
  getExtensionCapabilityLaneMetadata,
} from "../../server/agent-studio/services/extensions/contracts.js";

describe("EXTENSION_CAPABILITY_LANE_METADATA (T-X.2)", () => {
  it("has metadata for every closed-taxonomy lane", () => {
    for (const l of EXTENSION_CAPABILITY_LANES) {
      expect(EXTENSION_CAPABILITY_LANE_METADATA[l]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(EXTENSION_CAPABILITY_LANE_METADATA).length).toBe(
      EXTENSION_CAPABILITY_LANES.length,
    );
  });

  it.each(EXTENSION_CAPABILITY_LANES)(
    "%s has non-empty label + description + booleans + valid pipelineOrder",
    (l) => {
      const md = EXTENSION_CAPABILITY_LANE_METADATA[l];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.invokesTools).toBe("boolean");
      expect([1, 2, 3, 4]).toContain(md.pipelineOrder);
    },
  );

  it.each(EXTENSION_CAPABILITY_LANES)(
    "getExtensionCapabilityLaneMetadata(%s) returns table entry",
    (l) => {
      expect(getExtensionCapabilityLaneMetadata(l)).toBe(
        EXTENSION_CAPABILITY_LANE_METADATA[l],
      );
    },
  );

  it("only `tool` invokes tools", () => {
    expect(EXTENSION_CAPABILITY_LANE_METADATA.tool.invokesTools).toBe(true);
    expect(EXTENSION_CAPABILITY_LANE_METADATA.retrieve.invokesTools).toBe(
      false,
    );
    expect(EXTENSION_CAPABILITY_LANE_METADATA.assemble.invokesTools).toBe(
      false,
    );
    expect(EXTENSION_CAPABILITY_LANE_METADATA.compose.invokesTools).toBe(
      false,
    );
  });

  it("pipelineOrder is unique and covers 1..4", () => {
    const orders = new Set<number>();
    for (const l of EXTENSION_CAPABILITY_LANES) {
      orders.add(EXTENSION_CAPABILITY_LANE_METADATA[l].pipelineOrder);
    }
    expect(orders.size).toBe(EXTENSION_CAPABILITY_LANES.length);
    expect(orders.has(1)).toBe(true);
    expect(orders.has(2)).toBe(true);
    expect(orders.has(3)).toBe(true);
    expect(orders.has(4)).toBe(true);
  });

  it("retrieve=1, assemble=2, compose=3, tool=4", () => {
    expect(EXTENSION_CAPABILITY_LANE_METADATA.retrieve.pipelineOrder).toBe(1);
    expect(EXTENSION_CAPABILITY_LANE_METADATA.assemble.pipelineOrder).toBe(2);
    expect(EXTENSION_CAPABILITY_LANE_METADATA.compose.pipelineOrder).toBe(3);
    expect(EXTENSION_CAPABILITY_LANE_METADATA.tool.pipelineOrder).toBe(4);
  });

  it("tool is the last lane in pipeline order (matches invokesTools)", () => {
    const maxOrder = Math.max(
      ...EXTENSION_CAPABILITY_LANES.map(
        (l) => EXTENSION_CAPABILITY_LANE_METADATA[l].pipelineOrder,
      ),
    );
    for (const l of EXTENSION_CAPABILITY_LANES) {
      const md = EXTENSION_CAPABILITY_LANE_METADATA[l];
      if (md.invokesTools) {
        expect(md.pipelineOrder).toBe(maxOrder);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const l of EXTENSION_CAPABILITY_LANES) {
      labels.add(EXTENSION_CAPABILITY_LANE_METADATA[l].label);
    }
    expect(labels.size).toBe(EXTENSION_CAPABILITY_LANES.length);
  });
});
