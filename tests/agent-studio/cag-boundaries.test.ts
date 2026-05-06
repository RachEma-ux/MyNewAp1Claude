/**
 * RAC Phase 1E — CAG boundary + composer golden tests.
 *
 * Two surfaces:
 *
 * 1. **Composer goldens** — anchor tests for D-PRM-2 (section order)
 *    and D-PRM-5 (cache key excludes retrieval-evidence). The full
 *    composer suite lives in
 *    `server/agent-studio/services/runtime/system-prompt-composer.test.ts`;
 *    these duplicates exist so that a CAG architectural regression
 *    fails this file specifically and points at the decision record.
 *
 * 2. **Boundary script** — declarative checks against
 *    `scripts/check-cag-boundary.ts`: that the forbidden-import list
 *    matches D-TOOL-5 + RAC_NATIVE_ARCHITECTURE.md, that the
 *    importer-spec classifier accepts the right specifiers, and that
 *    the script exits 0 on the live tree.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  composeSystemPrompt,
  TOTAL_SYSTEM_PROMPT_TOKENS,
} from "../../server/agent-studio/services/runtime/system-prompt-composer";
import type { SystemPromptSection } from "../../server/agent-studio/services/cag";

// ── Composer fixtures ────────────────────────────────────────────────

const draft = {
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

const cagSection: SystemPromptSection = {
  id: "capability-pack",
  text: "## Capability Pack\nAgent: Test\n\n### Tools\n- studio::calculator (risk=read_only)",
  tokenEstimate: 30,
  contentHash: "a".repeat(64),
  warnings: [],
};

// ── 1. Composer golden — D-PRM-2 section order ───────────────────────

describe("CAG goldens — D-PRM-2 section order", () => {
  it("safe_degraded emits identity → mission → agent-policy → capability-pack → runtime-policy", () => {
    const out = composeSystemPrompt({
      mode: "safe_degraded",
      draft,
      capabilityPack: cagSection,
      retrievalEvidence: null,
    });
    expect(out.sections.map((s) => s.id)).toEqual([
      "identity",
      "mission",
      "agent-policy",
      "capability-pack",
      "runtime-policy",
    ]);
  });

  it("disabled mode is byte-equivalent to legacy [systemInstructions, roleInstructions].join('\\n\\n')", () => {
    const expected =
      [draft.systemInstructions, draft.roleInstructions]
        .filter((s) => s.length > 0)
        .join("\n\n");
    const out = composeSystemPrompt({
      mode: "disabled",
      draft,
      capabilityPack: cagSection,
      retrievalEvidence: null,
    });
    expect(out.text).toBe(expected);
  });
});

// ── 2. Composer golden — D-PRM-5 cache key excludes retrieval-evidence

describe("CAG goldens — D-PRM-5 cache key", () => {
  const evidenceA: SystemPromptSection = {
    id: "capability-pack",
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

  it("two different retrieval-evidence blocks produce the same cache key", () => {
    const a = composeSystemPrompt({
      mode: "safe_degraded",
      draft,
      capabilityPack: cagSection,
      retrievalEvidence: evidenceA,
    });
    const b = composeSystemPrompt({
      mode: "safe_degraded",
      draft,
      capabilityPack: cagSection,
      retrievalEvidence: evidenceB,
    });
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  it("changing the capability-pack contentHash changes the cache key", () => {
    const a = composeSystemPrompt({
      mode: "safe_degraded",
      draft,
      capabilityPack: cagSection,
      retrievalEvidence: null,
    });
    const b = composeSystemPrompt({
      mode: "safe_degraded",
      draft,
      capabilityPack: { ...cagSection, contentHash: "b".repeat(64) },
      retrievalEvidence: null,
    });
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });

  it("token budget never exceeds TOTAL_SYSTEM_PROMPT_TOKENS by more than identity+mission+runtime-policy combined", () => {
    // Budget regression guard: identity/mission/runtime-policy are
    // non-droppable (~1024 tokens of headroom). A new mandatory section
    // would exceed that and surface here.
    const out = composeSystemPrompt({
      mode: "safe_degraded",
      draft,
      capabilityPack: cagSection,
      retrievalEvidence: null,
    });
    expect(out.tokenEstimate).toBeLessThanOrEqual(TOTAL_SYSTEM_PROMPT_TOKENS);
  });
});

// ── 3. Boundary script — declarative source checks ───────────────────

const scriptPath = join(process.cwd(), "scripts/check-cag-boundary.ts");
const scriptSrc = readFileSync(scriptPath, "utf8");

describe("check-cag-boundary — script declarations", () => {
  it("targets the CAG directory exactly", () => {
    expect(scriptSrc).toContain('CAG_DIR_REL_PATH = "server/agent-studio/services/cag/"');
  });

  it("declares all forbidden import targets from RAC_NATIVE_ARCHITECTURE.md + D-TOOL-5", () => {
    const required = [
      "agent-studio/services/mcp/dispatcher",
      "provider-connections/internal/credential-resolver",
      "secrets/encryption",
      "server/documents/db",
      "server/documents/rag-pipeline",
      "server/vectordb",
      "server/embeddings",
    ];
    for (const tgt of required) {
      expect(scriptSrc, `forbidden target "${tgt}" must be declared`).toContain(tgt);
    }
  });

  it("flags `.riskClass =` writes but not `===` comparisons (D-TOOL-5)", () => {
    expect(scriptSrc).toContain("riskClassWriteRegex");
    // Negative lookaheads/lookbehinds keep `==` / `===` / `!==` out of scope.
    expect(scriptSrc).toContain("(?!=)");
    expect(scriptSrc).toContain("(?<![=!<>])");
  });

  it("exempts test files from Rule B", () => {
    expect(scriptSrc).toContain("isTestFile");
    expect(scriptSrc).toMatch(/test\|spec/);
  });
});

// ── 4. Boundary script — importer-spec classifier samples ────────────

describe("check-cag-boundary — importer-spec classifier", () => {
  // Re-implement the matcher locally — same logic as the script, but
  // pure (no process.exit / fs walk).
  const REPO_ROOT = process.cwd();
  const CAG_FILE_ABS = join(REPO_ROOT, "server/agent-studio/services/cag/foo.ts");
  const FORBIDDEN: Array<{ target: string; kind: "file" | "dir" }> = [
    { target: "server/agent-studio/services/mcp/dispatcher", kind: "file" },
    { target: "server/provider-connections/internal/credential-resolver", kind: "file" },
    { target: "server/secrets/encryption", kind: "file" },
    { target: "server/documents/db", kind: "file" },
    { target: "server/documents/rag-pipeline", kind: "file" },
    { target: "server/vectordb", kind: "dir" },
    { target: "server/embeddings", kind: "dir" },
  ];

  function resolveSpec(fileAbs: string, spec: string): string | null {
    const stripped = spec.replace(/\.(tsx?|m?js|cjs)$/, "");
    const path = require("path") as typeof import("path");
    let abs: string | null = null;
    if (stripped.startsWith("./") || stripped.startsWith("../")) {
      abs = path.resolve(path.dirname(fileAbs), stripped);
    } else if (stripped.startsWith("server/") || stripped.startsWith("client/") || stripped.startsWith("shared/")) {
      abs = path.resolve(REPO_ROOT, stripped);
    } else if (stripped.startsWith("@/")) {
      abs = path.resolve(REPO_ROOT, "client/src", stripped.slice(2));
    } else {
      return null;
    }
    return path.relative(REPO_ROOT, abs).split(path.sep).join("/");
  }

  function matches(spec: string): string | null {
    const r = resolveSpec(CAG_FILE_ABS, spec);
    if (!r) return null;
    for (const f of FORBIDDEN) {
      if (f.kind === "file" && r === f.target) return f.target;
      if (f.kind === "dir" && (r === f.target || r.startsWith(`${f.target}/`))) return f.target;
    }
    return null;
  }

  const samples: Array<{ spec: string; expected: string | null }> = [
    // From a file inside `services/cag/`, `../mcp/dispatcher` reaches
    // the dispatcher — flagged.
    { spec: "../mcp/dispatcher", expected: "server/agent-studio/services/mcp/dispatcher" },
    { spec: "../mcp/dispatcher.ts", expected: "server/agent-studio/services/mcp/dispatcher" },
    // Deep relative paths from the CAG dir.
    { spec: "../../../provider-connections/internal/credential-resolver", expected: "server/provider-connections/internal/credential-resolver" },
    { spec: "../../../secrets/encryption", expected: "server/secrets/encryption" },
    { spec: "../../../../server/documents/db", expected: "server/documents/db" },
    // Directory-rooted forbiddens — anything under vectordb/ or embeddings/ is flagged.
    { spec: "../../../../server/vectordb/qdrant-service", expected: "server/vectordb" },
    { spec: "../../../../server/vectordb", expected: "server/vectordb" },
    { spec: "../../../../server/embeddings/service", expected: "server/embeddings" },
    // Allowed neighbours (mcp registry/types are read-only snapshots).
    { spec: "../mcp/registry", expected: null },
    { spec: "../mcp/types", expected: null },
    { spec: "./builder", expected: null },
    { spec: "../../repository", expected: null },
    { spec: "../runtime/system-prompt-composer", expected: null },
    // `provider-connections/public-api` is allowed.
    { spec: "../../../provider-connections/public-api", expected: null },
  ];

  for (const { spec, expected } of samples) {
    it(`spec="${spec}" → ${expected ?? "allowed"}`, () => {
      expect(matches(spec)).toBe(expected);
    });
  }
});

// ── 5. Subprocess: script exits 0 on the live tree ───────────────────

describe("check-cag-boundary — live tree", () => {
  it("exits 0 with success message on the current repo state", () => {
    const result = spawnSync("pnpm", ["exec", "tsx", scriptPath], {
      encoding: "utf8",
      timeout: 60_000,
      cwd: process.cwd(),
    });
    expect(result.status, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("OK — CAG boundary check passed");
  });
});
