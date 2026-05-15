/**
 * Phase E §T-E.2 — publish-execution-status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  PUBLISH_EXECUTION_STATUSES,
  PUBLISH_EXECUTION_STATUS_METADATA,
  getPublishExecutionStatusMetadata,
} from "../../server/agent-studio/services/publish-targets/index.js";

describe("PUBLISH_EXECUTION_STATUS_METADATA (T-E.2)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of PUBLISH_EXECUTION_STATUSES) {
      expect(PUBLISH_EXECUTION_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(PUBLISH_EXECUTION_STATUS_METADATA).length).toBe(
      PUBLISH_EXECUTION_STATUSES.length,
    );
  });

  it.each(PUBLISH_EXECUTION_STATUSES)(
    "%s has non-empty label + description + booleans",
    (s) => {
      const md = PUBLISH_EXECUTION_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.terminal).toBe("boolean");
      expect(typeof md.successful).toBe("boolean");
    },
  );

  it.each(PUBLISH_EXECUTION_STATUSES)(
    "getPublishExecutionStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getPublishExecutionStatusMetadata(s)).toBe(
        PUBLISH_EXECUTION_STATUS_METADATA[s],
      );
    },
  );

  it("succeeded and failed are terminal; pending and in_flight are not", () => {
    expect(PUBLISH_EXECUTION_STATUS_METADATA.pending.terminal).toBe(false);
    expect(PUBLISH_EXECUTION_STATUS_METADATA.in_flight.terminal).toBe(false);
    expect(PUBLISH_EXECUTION_STATUS_METADATA.succeeded.terminal).toBe(true);
    expect(PUBLISH_EXECUTION_STATUS_METADATA.failed.terminal).toBe(true);
  });

  it("only succeeded is successful", () => {
    expect(PUBLISH_EXECUTION_STATUS_METADATA.succeeded.successful).toBe(true);
    expect(PUBLISH_EXECUTION_STATUS_METADATA.failed.successful).toBe(false);
    expect(PUBLISH_EXECUTION_STATUS_METADATA.pending.successful).toBe(false);
    expect(PUBLISH_EXECUTION_STATUS_METADATA.in_flight.successful).toBe(false);
  });

  it("any successful status is necessarily terminal", () => {
    for (const s of PUBLISH_EXECUTION_STATUSES) {
      const md = PUBLISH_EXECUTION_STATUS_METADATA[s];
      if (md.successful) {
        expect(md.terminal).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of PUBLISH_EXECUTION_STATUSES) {
      labels.add(PUBLISH_EXECUTION_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(PUBLISH_EXECUTION_STATUSES.length);
  });
});
