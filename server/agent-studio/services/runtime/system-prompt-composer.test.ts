/**
 * RAC P1C — system-prompt-composer unit tests.
 *
 * Pure function tests for `composeSystemPrompt`. The resolver is not
 * exercised here (it has DB I/O); composer tests stub out the
 * `capabilityPack` SystemPromptSection input directly.
 */

import { describe, it, expect } from "vitest";
import {
  composeSystemPrompt,
  CagRequiredError,
  TOTAL_SYSTEM_PROMPT_TOKENS,
} from "./system-prompt-composer";
import type { SystemPromptSection } from "../cag";

const baseDraft = {
  name: "Agent Studio Expert",
  role: "advisor",
  scope: "guides users through Agent Studio",
  mission: "help users ship reliable agents",
  systemInstructions: "You answer with concise, actionable steps.",
  roleInstructions: "Always cite the file:line when referencing code.",
  policyInstructions: "Never write to production without confirmation.",
  successCriteria: "User receives a working configuration.",
  escalationRules: "Escalate to platform team on data-loss risk.",
};

const fakeCagSection: SystemPromptSection = {
  id: "capability-pack",
  text: "## Capability Pack\nAgent: Test\n\n### Tools\n- studio::calculator (risk=read_only)",
  tokenEstimate: 30,
  contentHash: "a".repeat(64),
  warnings: [],
};

// ── Mode: disabled — byte-equivalent legacy output ────────────────────

describe("composer mode=disabled — byte-equivalent legacy output", () => {
  it("matches legacy concat exactly when both fields present", () => {
    const expected =
      [baseDraft.systemInstructions, baseDraft.roleInstructions]
        .filter((s) => s && s.length > 0)
        .join("\n\n");
    const out = composeSystemPrompt({
      mode: "disabled",
      draft: baseDraft,
      capabilityPack: fakeCagSection, // ignored in disabled mode
      retrievalEvidence: null,
    });
    expect(out.text).toBe(expected);
  });

  it("falls back to default string when both system+role instructions empty", () => {
    const out = composeSystemPrompt({
      mode: "disabled",
      draft: { ...baseDraft, systemInstructions: null, roleInstructions: null },
      capabilityPack: fakeCagSection,
      retrievalEvidence: null,
    });
    expect(out.text).toBe("You are a helpful assistant.");
  });

  it("emits exactly one identity section, no warnings, no truncations in disabled mode", () => {
    const out = composeSystemPrompt({
      mode: "disabled",
      draft: baseDraft,
      capabilityPack: fakeCagSection,
      retrievalEvidence: null,
    });
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].id).toBe("identity");
    expect(out.warnings).toHaveLength(0);
    expect(out.truncations).toHaveLength(0);
  });
});

// ── Mode: safe_degraded ───────────────────────────────────────────────

describe("composer mode=safe_degraded", () => {
  it("emits sections in fixed D-PRM-2 order", () => {
    const out = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: fakeCagSection,
      retrievalEvidence: null,
    });
    const ids = out.sections.map((s) => s.id);
    expect(ids).toEqual([
      "identity",
      "mission",
      "agent-policy",
      "capability-pack",
      "runtime-policy",
    ]);
  });

  it("omits mission section when draft mission is null/empty", () => {
    const out = composeSystemPrompt({
      mode: "safe_degraded",
      draft: { ...baseDraft, mission: null },
      capabilityPack: null,
      retrievalEvidence: null,
    });
    expect(out.sections.find((s) => s.id === "mission")).toBeUndefined();
  });

  it("omits capability-pack when null and records a warning", () => {
    const out = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: null,
      retrievalEvidence: null,
    });
    expect(out.sections.find((s) => s.id === "capability-pack")).toBeUndefined();
    expect(out.warnings.some((w) => /no capability pack/.test(w))).toBe(true);
  });

  it("includes capability-pack text when provided", () => {
    const out = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: fakeCagSection,
      retrievalEvidence: null,
    });
    expect(out.text).toContain(fakeCagSection.text);
  });

  it("always includes runtime-policy as the last section", () => {
    const out = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: null,
      retrievalEvidence: null,
    });
    expect(out.sections.at(-1)?.id).toBe("runtime-policy");
    expect(out.text).toMatch(/Runtime Policy/);
  });

  it("forwards capability-pack section warnings into composer warnings", () => {
    const out = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: { ...fakeCagSection, warnings: ["tools truncated"] },
      retrievalEvidence: null,
    });
    expect(out.warnings.some((w) => /cag: tools truncated/.test(w))).toBe(true);
  });
});

// ── Mode: strict ──────────────────────────────────────────────────────

describe("composer mode=strict", () => {
  it("throws CagRequiredError when capability pack is null", () => {
    expect(() =>
      composeSystemPrompt({
        mode: "strict",
        draft: baseDraft,
        capabilityPack: null,
        retrievalEvidence: null,
      }),
    ).toThrow(CagRequiredError);
  });

  it("succeeds in strict mode when capability pack is provided", () => {
    const out = composeSystemPrompt({
      mode: "strict",
      draft: baseDraft,
      capabilityPack: fakeCagSection,
      retrievalEvidence: null,
    });
    expect(out.sections.find((s) => s.id === "capability-pack")).toBeDefined();
  });
});

// ── Cache key (D-PRM-5) ───────────────────────────────────────────────

describe("composer cache key (D-PRM-5)", () => {
  it("is stable across identical inputs", () => {
    const a = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: fakeCagSection,
      retrievalEvidence: null,
    });
    const b = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: fakeCagSection,
      retrievalEvidence: null,
    });
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  it("changes when capability pack contentHash changes", () => {
    const a = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: fakeCagSection,
      retrievalEvidence: null,
    });
    const b = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: { ...fakeCagSection, contentHash: "b".repeat(64) },
      retrievalEvidence: null,
    });
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });

  it("EXCLUDES retrieval-evidence from cache key (different evidence → same key)", () => {
    const evidenceA: SystemPromptSection = {
      id: "capability-pack" as const, // type narrowing — composer treats it as a generic section
      text: "## Retrieval\nblock A",
      tokenEstimate: 5,
      contentHash: "x".repeat(64),
      warnings: [],
    };
    const evidenceB: SystemPromptSection = {
      ...evidenceA,
      text: "## Retrieval\nblock B (totally different)",
      contentHash: "y".repeat(64),
    };
    const a = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: fakeCagSection,
      retrievalEvidence: evidenceA,
    });
    const b = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: fakeCagSection,
      retrievalEvidence: evidenceB,
    });
    expect(a.cacheKey).toBe(b.cacheKey);
  });
});

// ── Token budget (D-PRM-3) ────────────────────────────────────────────

describe("composer token budget enforcement", () => {
  it("truncates capability-pack when total exceeds TOTAL_SYSTEM_PROMPT_TOKENS", () => {
    const fatPack: SystemPromptSection = {
      id: "capability-pack",
      text: "x".repeat(40000), // ~10000 tokens, well over budget
      tokenEstimate: 10000,
      contentHash: "c".repeat(64),
      warnings: [],
    };
    const out = composeSystemPrompt({
      mode: "safe_degraded",
      draft: baseDraft,
      capabilityPack: fatPack,
      retrievalEvidence: null,
    });
    expect(out.tokenEstimate).toBeLessThanOrEqual(TOTAL_SYSTEM_PROMPT_TOKENS + 100); // +100 slack for sections that can't truncate
    expect(out.truncations.some((t) => t.section === "capability-pack")).toBe(true);
    expect(out.warnings.some((w) => /truncated capability-pack/.test(w))).toBe(true);
  });
});
