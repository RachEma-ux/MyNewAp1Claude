/**
 * Phase S §T-S.10 — AGS MCP-status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_MCP_STATUSES,
  AGS_MCP_STATUS_METADATA,
  getAgsMcpStatusMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_MCP_STATUS_METADATA (T-S.10)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of AGS_MCP_STATUSES) {
      expect(AGS_MCP_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_MCP_STATUS_METADATA).length).toBe(
      AGS_MCP_STATUSES.length,
    );
  });

  it.each(AGS_MCP_STATUSES)(
    "%s has non-empty label + description + booleans",
    (s) => {
      const md = AGS_MCP_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.dispatchable).toBe("boolean");
      expect(typeof md.errorState).toBe("boolean");
    },
  );

  it.each(AGS_MCP_STATUSES)(
    "getAgsMcpStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getAgsMcpStatusMetadata(s)).toBe(AGS_MCP_STATUS_METADATA[s]);
    },
  );

  it("only `connected` is dispatchable", () => {
    for (const s of AGS_MCP_STATUSES) {
      const expected = s === "connected";
      expect(AGS_MCP_STATUS_METADATA[s].dispatchable).toBe(expected);
    }
  });

  it("disconnected and error are error-states", () => {
    expect(AGS_MCP_STATUS_METADATA.pending.errorState).toBe(false);
    expect(AGS_MCP_STATUS_METADATA.connected.errorState).toBe(false);
    expect(AGS_MCP_STATUS_METADATA.disconnected.errorState).toBe(true);
    expect(AGS_MCP_STATUS_METADATA.error.errorState).toBe(true);
  });

  it("dispatchable=true implies errorState=false", () => {
    for (const s of AGS_MCP_STATUSES) {
      const md = AGS_MCP_STATUS_METADATA[s];
      if (md.dispatchable) {
        expect(md.errorState).toBe(false);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of AGS_MCP_STATUSES) {
      labels.add(AGS_MCP_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(AGS_MCP_STATUSES.length);
  });
});
