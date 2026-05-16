/**
 * Phase D §T-D.14 — Graph-quality agent-run status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_QUALITY_AGENT_RUN_STATUSES,
  GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA,
  getGraphQualityAgentRunStatusMetadata,
} from "../../server/agent-studio/services/graph-quality-agent-runs-retention.js";

describe("GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA (T-D.14)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of GRAPH_QUALITY_AGENT_RUN_STATUSES) {
      expect(GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA).length,
    ).toBe(GRAPH_QUALITY_AGENT_RUN_STATUSES.length);
  });

  it.each(GRAPH_QUALITY_AGENT_RUN_STATUSES)(
    "%s has non-empty label + description + boolean terminal + boolean successful",
    (s) => {
      const md = GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.terminal).toBe("boolean");
      expect(typeof md.successful).toBe("boolean");
    },
  );

  it.each(GRAPH_QUALITY_AGENT_RUN_STATUSES)(
    "getGraphQualityAgentRunStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getGraphQualityAgentRunStatusMetadata(s)).toBe(
        GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA[s],
      );
    },
  );

  it("completed + failed are exactly the terminal statuses", () => {
    const terminal = new Set(
      GRAPH_QUALITY_AGENT_RUN_STATUSES.filter(
        (s) => GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA[s].terminal,
      ),
    );
    expect(terminal).toEqual(new Set(["completed", "failed"]));
  });

  it("completed is the only successful status", () => {
    const succ = GRAPH_QUALITY_AGENT_RUN_STATUSES.filter(
      (s) => GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA[s].successful,
    );
    expect(succ).toEqual(["completed"]);
  });

  it("successful implies terminal", () => {
    for (const s of GRAPH_QUALITY_AGENT_RUN_STATUSES) {
      const md = GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA[s];
      if (md.successful) {
        expect(md.terminal).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of GRAPH_QUALITY_AGENT_RUN_STATUSES) {
      labels.add(GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(GRAPH_QUALITY_AGENT_RUN_STATUSES.length);
  });
});
