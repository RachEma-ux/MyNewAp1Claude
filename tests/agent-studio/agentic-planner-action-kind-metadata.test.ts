/**
 * Phase G §T-G.35 — agentic-planner action-kind metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGENTIC_PLANNER_ACTION_KINDS,
  AGENTIC_PLANNER_ACTION_KIND_METADATA,
  getAgenticPlannerActionKindMetadata,
} from "../../server/agent-studio/services/graph-agent/agentic-planner-contract.js";

describe("AGENTIC_PLANNER_ACTION_KIND_METADATA (T-G.35)", () => {
  it("has metadata for every closed-taxonomy kind", () => {
    for (const k of AGENTIC_PLANNER_ACTION_KINDS) {
      expect(AGENTIC_PLANNER_ACTION_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGENTIC_PLANNER_ACTION_KIND_METADATA).length).toBe(
      AGENTIC_PLANNER_ACTION_KINDS.length,
    );
  });

  it.each(AGENTIC_PLANNER_ACTION_KINDS)(
    "%s has non-empty label + description + booleans",
    (k) => {
      const md = AGENTIC_PLANNER_ACTION_KIND_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.terminatesLoop).toBe("boolean");
      expect(typeof md.producesAnswer).toBe("boolean");
    },
  );

  it.each(AGENTIC_PLANNER_ACTION_KINDS)(
    "getAgenticPlannerActionKindMetadata(%s) returns table entry",
    (k) => {
      expect(getAgenticPlannerActionKindMetadata(k)).toBe(
        AGENTIC_PLANNER_ACTION_KIND_METADATA[k],
      );
    },
  );

  it("retrieve is the only non-terminating action", () => {
    expect(AGENTIC_PLANNER_ACTION_KIND_METADATA.retrieve.terminatesLoop).toBe(
      false,
    );
    expect(AGENTIC_PLANNER_ACTION_KIND_METADATA.answer.terminatesLoop).toBe(
      true,
    );
    expect(AGENTIC_PLANNER_ACTION_KIND_METADATA.stop.terminatesLoop).toBe(true);
  });

  it("only `answer` produces an answer", () => {
    expect(AGENTIC_PLANNER_ACTION_KIND_METADATA.answer.producesAnswer).toBe(
      true,
    );
    expect(AGENTIC_PLANNER_ACTION_KIND_METADATA.retrieve.producesAnswer).toBe(
      false,
    );
    expect(AGENTIC_PLANNER_ACTION_KIND_METADATA.stop.producesAnswer).toBe(
      false,
    );
  });

  it("any answer-producing action is necessarily terminating", () => {
    for (const k of AGENTIC_PLANNER_ACTION_KINDS) {
      const md = AGENTIC_PLANNER_ACTION_KIND_METADATA[k];
      if (md.producesAnswer) {
        expect(md.terminatesLoop).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of AGENTIC_PLANNER_ACTION_KINDS) {
      labels.add(AGENTIC_PLANNER_ACTION_KIND_METADATA[k].label);
    }
    expect(labels.size).toBe(AGENTIC_PLANNER_ACTION_KINDS.length);
  });
});
