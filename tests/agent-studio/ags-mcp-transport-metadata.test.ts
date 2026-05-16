/**
 * Phase S §T-S.14 — AGS MCP-transport metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_MCP_TRANSPORTS,
  AGS_MCP_TRANSPORT_METADATA,
  getAgsMcpTransportMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_MCP_TRANSPORT_METADATA (T-S.14)", () => {
  it("has metadata for every closed-taxonomy transport", () => {
    for (const t of AGS_MCP_TRANSPORTS) {
      expect(AGS_MCP_TRANSPORT_METADATA[t]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_MCP_TRANSPORT_METADATA).length).toBe(
      AGS_MCP_TRANSPORTS.length,
    );
  });

  it.each(AGS_MCP_TRANSPORTS)(
    "%s has non-empty label + description + booleans",
    (t) => {
      const md = AGS_MCP_TRANSPORT_METADATA[t];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.streaming).toBe("boolean");
      expect(typeof md.inProcess).toBe("boolean");
    },
  );

  it.each(AGS_MCP_TRANSPORTS)(
    "getAgsMcpTransportMetadata(%s) returns table entry",
    (t) => {
      expect(getAgsMcpTransportMetadata(t)).toBe(AGS_MCP_TRANSPORT_METADATA[t]);
    },
  );

  it("only `sdk` is in-process", () => {
    for (const t of AGS_MCP_TRANSPORTS) {
      const expected = t === "sdk";
      expect(AGS_MCP_TRANSPORT_METADATA[t].inProcess).toBe(expected);
    }
  });

  it("sse, sdk, and websocket are streaming; stdio and http are not", () => {
    expect(AGS_MCP_TRANSPORT_METADATA.stdio.streaming).toBe(false);
    expect(AGS_MCP_TRANSPORT_METADATA.sse.streaming).toBe(true);
    expect(AGS_MCP_TRANSPORT_METADATA.http.streaming).toBe(false);
    expect(AGS_MCP_TRANSPORT_METADATA.sdk.streaming).toBe(true);
    expect(AGS_MCP_TRANSPORT_METADATA.websocket.streaming).toBe(true);
  });

  it("inProcess=true implies streaming=true", () => {
    for (const t of AGS_MCP_TRANSPORTS) {
      const md = AGS_MCP_TRANSPORT_METADATA[t];
      if (md.inProcess) {
        expect(md.streaming).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const t of AGS_MCP_TRANSPORTS) {
      labels.add(AGS_MCP_TRANSPORT_METADATA[t].label);
    }
    expect(labels.size).toBe(AGS_MCP_TRANSPORTS.length);
  });
});
