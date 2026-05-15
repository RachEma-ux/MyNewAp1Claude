/**
 * Phase S §T-S.8 — AGS run-status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_RUN_STATUSES,
  AGS_RUN_STATUS_METADATA,
  getAgsRunStatusMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_RUN_STATUS_METADATA (T-S.8)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of AGS_RUN_STATUSES) {
      expect(AGS_RUN_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_RUN_STATUS_METADATA).length).toBe(
      AGS_RUN_STATUSES.length,
    );
  });

  it.each(AGS_RUN_STATUSES)(
    "%s has non-empty label + description + booleans",
    (s) => {
      const md = AGS_RUN_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.terminal).toBe("boolean");
      expect(typeof md.successful).toBe("boolean");
    },
  );

  it.each(AGS_RUN_STATUSES)(
    "getAgsRunStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getAgsRunStatusMetadata(s)).toBe(AGS_RUN_STATUS_METADATA[s]);
    },
  );

  it("completed/failed/cancelled are terminal; queued/running are not", () => {
    expect(AGS_RUN_STATUS_METADATA.queued.terminal).toBe(false);
    expect(AGS_RUN_STATUS_METADATA.running.terminal).toBe(false);
    expect(AGS_RUN_STATUS_METADATA.completed.terminal).toBe(true);
    expect(AGS_RUN_STATUS_METADATA.failed.terminal).toBe(true);
    expect(AGS_RUN_STATUS_METADATA.cancelled.terminal).toBe(true);
  });

  it("only `completed` is successful", () => {
    for (const s of AGS_RUN_STATUSES) {
      const expected = s === "completed";
      expect(AGS_RUN_STATUS_METADATA[s].successful).toBe(expected);
    }
  });

  it("successful=true implies terminal=true", () => {
    for (const s of AGS_RUN_STATUSES) {
      const md = AGS_RUN_STATUS_METADATA[s];
      if (md.successful) {
        expect(md.terminal).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of AGS_RUN_STATUSES) {
      labels.add(AGS_RUN_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(AGS_RUN_STATUSES.length);
  });
});
