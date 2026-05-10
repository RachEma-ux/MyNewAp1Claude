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

// ── M5-c8 — strict-mode error shape + pre-throw guarantees ────────────
//
// Cycle-8 audit (§M5-c8) flagged that the strict + null branch had only a
// type-level toThrow assertion — the .code field (which the SSE mapper keys
// off), the .name (used in error logs), the message content (operator
// breadcrumb), and the pre-throw guarantee (throw happens before any section
// composition, so partial state never leaks) had no test signal. A future PR
// that "simplified" the throw could silently shift behavior.
//
// This block pins all four. Source-scan lockstep at the bottom keeps the
// throw site itself from drifting (cycle-7 lesson: regex ignores comments).

describe("M5-c8 — composer strict-mode error-shape pinning", () => {
  it("error has code='cag_required' for SSE mapping", () => {
    let caught: unknown;
    try {
      composeSystemPrompt({
        mode: "strict",
        draft: baseDraft,
        capabilityPack: null,
        retrievalEvidence: null,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CagRequiredError);
    // .code is the discriminator the chat flows + SSE mapper key off.
    // Hardcoding-test prevents a silent rename.
    expect((caught as CagRequiredError).code).toBe("cag_required");
  });

  it("error has name='CagRequiredError' for log breadcrumbs", () => {
    let caught: unknown;
    try {
      composeSystemPrompt({
        mode: "strict",
        draft: baseDraft,
        capabilityPack: null,
        retrievalEvidence: null,
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).name).toBe("CagRequiredError");
  });

  it("error message names the missing pack so operators can grep", () => {
    let caught: unknown;
    try {
      composeSystemPrompt({
        mode: "strict",
        draft: baseDraft,
        capabilityPack: null,
        retrievalEvidence: null,
      });
    } catch (e) {
      caught = e;
    }
    const msg = (caught as Error).message;
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.toLowerCase()).toMatch(/cag|capability pack/);
  });

  it("throws BEFORE composing any section — retrievalEvidence presence is irrelevant", () => {
    const fakeRetrieval: SystemPromptSection = {
      id: "retrieval-evidence",
      text: "## Retrieval Evidence\nThis should never appear in the output.",
      tokenEstimate: 20,
      contentHash: "b".repeat(64),
      warnings: [],
    };
    expect(() =>
      composeSystemPrompt({
        mode: "strict",
        draft: baseDraft,
        capabilityPack: null,
        retrievalEvidence: fakeRetrieval,
      }),
    ).toThrow(CagRequiredError);
  });

  it("throws regardless of draft completeness — null pack is the sole condition", () => {
    const emptyDraft = {
      name: null,
      role: null,
      scope: null,
      mission: null,
      systemInstructions: null,
      roleInstructions: null,
      policyInstructions: null,
      successCriteria: null,
      escalationRules: null,
    };
    expect(() =>
      composeSystemPrompt({
        mode: "strict",
        draft: emptyDraft,
        capabilityPack: null,
        retrievalEvidence: null,
      }),
    ).toThrow(CagRequiredError);
  });
});

// ── M5-c8 — source-scan lockstep (throw site pin) ─────────────────────
//
// If a future PR removes the strict + null check (or moves it after section
// composition), the property-shape tests above still pass on the wrong
// behavior because they only observe the throw, not its position. This
// source-scan asserts the throw is at the TOP of composeSystemPrompt
// (before any local arrays are constructed) and uses the canonical
// CagRequiredError class, not a string throw. Mirrors cycle-7 / cycle-8
// source-scan lockstep shape (regex ignores comments per cycle-7 lessons).

describe("M5-c8 — strict-mode throw site source-scan", () => {
  const composerSrc = (() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("fs") as typeof import("fs");
    const { join } = require("path") as typeof import("path");
    return readFileSync(
      join(process.cwd(), "server/agent-studio/services/runtime/system-prompt-composer.ts"),
      "utf8",
    );
  })();

  it("composeSystemPrompt opens with the strict + null guard before any local state", () => {
    // Match: function signature → { → optional whitespace/comments →
    //        if (input.mode === "strict" && input.capabilityPack === null)
    // The `[\s\S]*?` is intentionally non-greedy so a guard buried after
    // local-state construction would NOT match.
    const re =
      /export\s+function\s+composeSystemPrompt\s*\([^)]*\)\s*:[^{]*\{\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*if\s*\(\s*input\.mode\s*===\s*["']strict["']\s*&&\s*input\.capabilityPack\s*===\s*null\s*\)/;
    expect(
      composerSrc,
      "M5-c8 (cycle-8 audit §M5-c8): the strict + null guard must be the " +
        "FIRST statement in composeSystemPrompt. Moving it after section " +
        "composition risks partial-output leaks before the throw.",
    ).toMatch(re);
  });

  it("the strict-mode guard throws CagRequiredError (not a string or generic Error)", () => {
    // Pin the throw class so a refactor that swaps to `throw new Error(...)`
    // breaks the test before the SSE mapper breaks in prod.
    const re =
      /if\s*\(\s*input\.mode\s*===\s*["']strict["']\s*&&\s*input\.capabilityPack\s*===\s*null\s*\)\s*\{\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*throw\s+new\s+CagRequiredError\s*\(/;
    expect(
      composerSrc,
      "M5-c8: the typed CagRequiredError class is what the SSE mapper / " +
        "chat flows pattern-match on. A string throw or generic Error " +
        "would silently break the cag_required SSE error code.",
    ).toMatch(re);
  });

  it("CagRequiredError class declares the readonly code='cag_required' field", () => {
    // The .code field is the discriminator. If a future PR drops `readonly`
    // or renames `code`, both this test AND the property-shape tests above
    // catch it — defense in depth.
    const re =
      /class\s+CagRequiredError\s+extends\s+Error\s*\{\s*readonly\s+code\s*=\s*["']cag_required["']/;
    expect(composerSrc).toMatch(re);
  });

  it("M5-c8 closure marker is present in the composer module", () => {
    expect(
      composerSrc,
      "M5-c8 closure marker missing from system-prompt-composer.ts. " +
        "Future audits read the closure marker to confirm the audit item " +
        "was addressed; a missing marker means the audit is still open.",
    ).toMatch(/M5-c8/);
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
