/**
 * Phase 24 §T-F.16 — graph-lens governance-scope metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_LENS_GOVERNANCE_SCOPES,
  GRAPH_LENS_GOVERNANCE_SCOPE_METADATA,
  getGraphLensGovernanceScopeMetadata,
} from "../../server/agent-studio/services/graph-lens/public-api.js";

describe("GRAPH_LENS_GOVERNANCE_SCOPE_METADATA (T-F.16)", () => {
  it("has metadata for every closed-taxonomy scope", () => {
    for (const s of GRAPH_LENS_GOVERNANCE_SCOPES) {
      expect(GRAPH_LENS_GOVERNANCE_SCOPE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals GRAPH_LENS_GOVERNANCE_SCOPES.length", () => {
    expect(Object.keys(GRAPH_LENS_GOVERNANCE_SCOPE_METADATA).length).toBe(
      GRAPH_LENS_GOVERNANCE_SCOPES.length,
    );
  });

  it.each(GRAPH_LENS_GOVERNANCE_SCOPES)(
    "%s has non-empty label + description + valid restrictiveness",
    (scope) => {
      const m = GRAPH_LENS_GOVERNANCE_SCOPE_METADATA[scope];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
      expect([
        "open",
        "members_only",
        "approvers_only",
        "admin_only",
      ]).toContain(m.restrictiveness);
    },
  );

  it.each(GRAPH_LENS_GOVERNANCE_SCOPES)(
    "getGraphLensGovernanceScopeMetadata(%s) returns table entry",
    (scope) => {
      expect(getGraphLensGovernanceScopeMetadata(scope)).toBe(
        GRAPH_LENS_GOVERNANCE_SCOPE_METADATA[scope],
      );
    },
  );

  it("restrictiveness matches scope (per closed-taxonomy)", () => {
    expect(
      GRAPH_LENS_GOVERNANCE_SCOPE_METADATA.workspace_public.restrictiveness,
    ).toBe("open");
    expect(
      GRAPH_LENS_GOVERNANCE_SCOPE_METADATA.workspace_members.restrictiveness,
    ).toBe("members_only");
    expect(
      GRAPH_LENS_GOVERNANCE_SCOPE_METADATA.approver_only.restrictiveness,
    ).toBe("approvers_only");
    expect(
      GRAPH_LENS_GOVERNANCE_SCOPE_METADATA.admin_only.restrictiveness,
    ).toBe("admin_only");
  });

  it("every metadata key maps to a GRAPH_LENS_GOVERNANCE_SCOPES entry", () => {
    const registered = new Set<string>(GRAPH_LENS_GOVERNANCE_SCOPES);
    for (const key of Object.keys(GRAPH_LENS_GOVERNANCE_SCOPE_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
