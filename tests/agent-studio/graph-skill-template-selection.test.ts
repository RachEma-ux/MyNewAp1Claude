/**
 * Phase 12.5 §1 — selectTemplateForEligiblePacks tests.
 *
 * Covers:
 *   - Returns null when no eligible pack has any templates
 *   - First template in the highest-ranked eligible pack wins by default
 *   - preferTemplateKeys override pack-natural ordering when matched
 *   - preferTemplateKeys precedence: earlier in list wins
 *   - preferTemplateKeys are scoped to *eligible* packs only
 *   - Skips eligible packs with empty / missing template lists
 */

import { describe, it, expect } from "vitest";
import {
  selectTemplateForEligiblePacks,
  type PackTemplateMap,
} from "../../server/agent-studio/services/graph-skill/template-selection";
import type {
  EligibilityResult,
  SkillPackSummary,
} from "../../server/agent-studio/services/graph-skill/eligibility";

const pack = (
  skillKey: string,
  overrides: Partial<SkillPackSummary> = {},
): SkillPackSummary => ({
  id: 1,
  skillKey,
  name: skillKey,
  domain: null,
  supportedNodeTypeKeys: [],
  supportedEdgeTypeKeys: [],
  riskLevel: "low",
  approvalRequired: false,
  active: true,
  allowedRoles: null,
  ...overrides,
});

const elig = (...packs: SkillPackSummary[]): EligibilityResult => ({
  eligible: packs,
  rejectionReasons: [],
});

describe("selectTemplateForEligiblePacks", () => {
  it("returns null when no eligible packs", () => {
    const r = selectTemplateForEligiblePacks({
      eligibility: elig(),
      packTemplates: new Map(),
    });
    expect(r).toBeNull();
  });

  it("returns null when every eligible pack has no templates registered", () => {
    const r = selectTemplateForEligiblePacks({
      eligibility: elig(pack("p1"), pack("p2")),
      packTemplates: new Map<string, string[]>([
        ["p1", []],
      ]) as PackTemplateMap,
    });
    expect(r).toBeNull();
  });

  it("first template in the highest-ranked pack wins by default", () => {
    const r = selectTemplateForEligiblePacks({
      eligibility: elig(pack("top"), pack("second")),
      packTemplates: new Map<string, string[]>([
        ["top", ["tpl-a", "tpl-b"]],
        ["second", ["tpl-c"]],
      ]) as PackTemplateMap,
    });
    expect(r).toEqual({
      templateKey: "tpl-a",
      pack: expect.objectContaining({ skillKey: "top" }),
      reason: "first_template_in_top_pack",
    });
  });

  it("preferTemplateKeys override pack ordering when matched", () => {
    const r = selectTemplateForEligiblePacks({
      eligibility: elig(pack("top"), pack("second")),
      packTemplates: new Map<string, string[]>([
        ["top", ["tpl-a"]],
        ["second", ["tpl-z"]],
      ]) as PackTemplateMap,
      preferTemplateKeys: ["tpl-z"],
    });
    expect(r).toEqual({
      templateKey: "tpl-z",
      pack: expect.objectContaining({ skillKey: "second" }),
      reason: "preferred_key_matched",
    });
  });

  it("preferTemplateKeys precedence is left-to-right (earlier wins)", () => {
    const r = selectTemplateForEligiblePacks({
      eligibility: elig(pack("p1"), pack("p2")),
      packTemplates: new Map<string, string[]>([
        ["p1", ["tpl-b"]],
        ["p2", ["tpl-a"]],
      ]) as PackTemplateMap,
      preferTemplateKeys: ["tpl-a", "tpl-b"],
    });
    expect(r?.templateKey).toBe("tpl-a");
    expect(r?.pack.skillKey).toBe("p2");
  });

  it("preferTemplateKeys are scoped to eligible packs only (no fallback to ineligible)", () => {
    // p1 alone is eligible. preferred key is ONLY in p2's templates,
    // but p2 isn't eligible — fall back to p1's first template.
    const r = selectTemplateForEligiblePacks({
      eligibility: elig(pack("p1")),
      packTemplates: new Map<string, string[]>([
        ["p1", ["tpl-a"]],
        ["p2", ["tpl-preferred"]],
      ]) as PackTemplateMap,
      preferTemplateKeys: ["tpl-preferred"],
    });
    expect(r).toEqual({
      templateKey: "tpl-a",
      pack: expect.objectContaining({ skillKey: "p1" }),
      reason: "first_template_in_top_pack",
    });
  });

  it("skips eligible packs with empty templates and uses the next eligible pack that has them", () => {
    const r = selectTemplateForEligiblePacks({
      eligibility: elig(pack("empty"), pack("full")),
      packTemplates: new Map<string, string[]>([
        ["empty", []],
        ["full", ["tpl-x"]],
      ]) as PackTemplateMap,
    });
    expect(r?.templateKey).toBe("tpl-x");
    expect(r?.pack.skillKey).toBe("full");
  });

  it("preferTemplateKeys empty array is equivalent to no preference", () => {
    const r = selectTemplateForEligiblePacks({
      eligibility: elig(pack("p1")),
      packTemplates: new Map<string, string[]>([["p1", ["tpl-a"]]]) as PackTemplateMap,
      preferTemplateKeys: [],
    });
    expect(r?.reason).toBe("first_template_in_top_pack");
  });
});
