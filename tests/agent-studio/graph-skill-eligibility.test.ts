/**
 * Phase 12.5 — Graph Skill Pack eligibility tests.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateEligibility,
  type SkillPackSummary,
} from "../../server/agent-studio/services/graph-skill/public-api.js";

const pack = (overrides: Partial<SkillPackSummary>): SkillPackSummary => ({
  id: 1,
  skillKey: "default",
  name: "default",
  domain: null,
  supportedNodeTypeKeys: [],
  supportedEdgeTypeKeys: [],
  riskLevel: "low",
  approvalRequired: false,
  active: true,
  allowedRoles: null,
  ...overrides,
});

describe("evaluateEligibility", () => {
  it("returns active packs only", () => {
    const r = evaluateEligibility({
      runtime: { userRole: "user" },
      availablePacks: [
        pack({ skillKey: "live", active: true }),
        pack({ skillKey: "off", active: false }),
      ],
    });
    expect(r.eligible.map((p) => p.skillKey)).toEqual(["live"]);
    expect(r.rejectionReasons[0]).toEqual({ packKey: "off", reason: "inactive" });
  });

  it("rejects domain mismatch", () => {
    const r = evaluateEligibility({
      queryDomain: "security",
      runtime: { userRole: "user" },
      availablePacks: [pack({ skillKey: "p1", domain: "code" })],
    });
    expect(r.eligible.length).toBe(0);
    expect(r.rejectionReasons[0]?.reason).toBe("domain_mismatch");
  });

  it("requires node type overlap when both sides specify", () => {
    const r = evaluateEligibility({
      involvedNodeTypeKeys: ["Note"],
      runtime: { userRole: "user" },
      availablePacks: [pack({ skillKey: "p1", supportedNodeTypeKeys: ["Entity"] })],
    });
    expect(r.eligible.length).toBe(0);
    expect(r.rejectionReasons[0]?.reason).toBe("node_type_overlap_empty");
  });

  it("allows when node type overlaps", () => {
    const r = evaluateEligibility({
      involvedNodeTypeKeys: ["Note", "Tag"],
      runtime: { userRole: "user" },
      availablePacks: [pack({ skillKey: "p1", supportedNodeTypeKeys: ["Note", "CAGBlock"] })],
    });
    expect(r.eligible.length).toBe(1);
  });

  it("rejects role not in allowedRoles", () => {
    const r = evaluateEligibility({
      runtime: { userRole: "viewer" },
      availablePacks: [pack({ skillKey: "p1", allowedRoles: ["admin"] })],
    });
    expect(r.eligible.length).toBe(0);
    expect(r.rejectionReasons[0]?.reason).toBe("role_not_allowed");
  });

  it("ranks lower-risk packs first", () => {
    const r = evaluateEligibility({
      runtime: { userRole: "admin" },
      availablePacks: [
        pack({ skillKey: "hi", riskLevel: "high" }),
        pack({ skillKey: "lo", riskLevel: "low" }),
        pack({ skillKey: "mid", riskLevel: "medium" }),
      ],
    });
    expect(r.eligible.map((p) => p.skillKey)).toEqual(["lo", "mid", "hi"]);
  });
});
