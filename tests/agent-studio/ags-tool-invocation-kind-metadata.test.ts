/**
 * Phase S §T-S.17 — AGS tool-invocation-kind metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_TOOL_INVOCATION_KINDS,
  AGS_TOOL_INVOCATION_KIND_METADATA,
  getAgsToolInvocationKindMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_TOOL_INVOCATION_KIND_METADATA (T-S.17)", () => {
  it("has metadata for every closed-taxonomy kind", () => {
    for (const k of AGS_TOOL_INVOCATION_KINDS) {
      expect(AGS_TOOL_INVOCATION_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_TOOL_INVOCATION_KIND_METADATA).length).toBe(
      AGS_TOOL_INVOCATION_KINDS.length,
    );
  });

  it.each(AGS_TOOL_INVOCATION_KINDS)(
    "%s has non-empty label + description + booleans",
    (k) => {
      const md = AGS_TOOL_INVOCATION_KIND_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.userCreatable).toBe("boolean");
      expect(typeof md.crossesNetworkBoundary).toBe("boolean");
    },
  );

  it.each(AGS_TOOL_INVOCATION_KINDS)(
    "getAgsToolInvocationKindMetadata(%s) returns table entry",
    (k) => {
      expect(getAgsToolInvocationKindMetadata(k)).toBe(
        AGS_TOOL_INVOCATION_KIND_METADATA[k],
      );
    },
  );

  it("shell/http/mcp_ref are user-creatable; builtin is not", () => {
    expect(AGS_TOOL_INVOCATION_KIND_METADATA.shell.userCreatable).toBe(true);
    expect(AGS_TOOL_INVOCATION_KIND_METADATA.http.userCreatable).toBe(true);
    expect(AGS_TOOL_INVOCATION_KIND_METADATA.mcp_ref.userCreatable).toBe(true);
    expect(AGS_TOOL_INVOCATION_KIND_METADATA.builtin.userCreatable).toBe(
      false,
    );
  });

  it("shell + http cross network boundary; mcp_ref + builtin do not", () => {
    expect(AGS_TOOL_INVOCATION_KIND_METADATA.shell.crossesNetworkBoundary).toBe(
      true,
    );
    expect(AGS_TOOL_INVOCATION_KIND_METADATA.http.crossesNetworkBoundary).toBe(
      true,
    );
    expect(
      AGS_TOOL_INVOCATION_KIND_METADATA.mcp_ref.crossesNetworkBoundary,
    ).toBe(false);
    expect(
      AGS_TOOL_INVOCATION_KIND_METADATA.builtin.crossesNetworkBoundary,
    ).toBe(false);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of AGS_TOOL_INVOCATION_KINDS) {
      labels.add(AGS_TOOL_INVOCATION_KIND_METADATA[k].label);
    }
    expect(labels.size).toBe(AGS_TOOL_INVOCATION_KINDS.length);
  });
});
