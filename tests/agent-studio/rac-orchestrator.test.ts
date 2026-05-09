/**
 * RAC Phase 6 — runtime orchestrator tests.
 *
 * Exercises the decision branches of `resolveAndAssembleContext` and
 * `buildRuntimeSystemPrompt` against mocked CAG / source-registry /
 * retrieval primitives. The composer is left real — its golden tests
 * already pin its behaviour (P1E + P5).
 *
 * Branches covered:
 *   1. mode=disabled → both sections null, retrieval not invoked
 *   2. empty query → CAG runs, retrieval skipped (no_query)
 *   3. no profile registered → CAG runs, retrieval skipped (no_profile)
 *   4. happy path → both sections present
 *   5. strict + missing CAG → CagRequiredError bubbles
 *   6. strict + retrieval throw → RetrievalRequiredError
 *   7. safe_degraded + retrieval throw → warning, evidence=null,
 *      capabilityPack still emitted
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  RacRetrievalChunk,
} from "../../server/agent-studio/services/rac/ingestion";
import type { RacProfile } from "../../server/agent-studio/services/rac/sources";

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock("../../server/agent-studio/services/cag", async (orig) => {
  const real = await orig<
    typeof import("../../server/agent-studio/services/cag")
  >();
  return {
    ...real,
    resolveCagPack: vi.fn(),
  };
});

vi.mock("../../server/agent-studio/services/rac/sources", async (orig) => {
  const real = await orig<
    typeof import("../../server/agent-studio/services/rac/sources")
  >();
  return {
    ...real,
    listProfilesForDraft: vi.fn(),
    getPolicyForProfile: vi.fn(),
  };
});

vi.mock("../../server/agent-studio/services/rac/retrieval", async (orig) => {
  const real = await orig<
    typeof import("../../server/agent-studio/services/rac/retrieval")
  >();
  return {
    ...real,
    planRetrieval: vi.fn(),
    executeRetrieval: vi.fn(),
  };
});

import {
  resolveAndAssembleContext,
  buildRuntimeSystemPrompt,
  RetrievalRequiredError,
} from "../../server/agent-studio/services/runtime/rac-orchestrator";
import { CagRequiredError } from "../../server/agent-studio/services/runtime/system-prompt-composer";
import { resolveCagPack } from "../../server/agent-studio/services/cag";
import {
  listProfilesForDraft,
  getPolicyForProfile,
} from "../../server/agent-studio/services/rac/sources";
import {
  planRetrieval,
  executeRetrieval,
} from "../../server/agent-studio/services/rac/retrieval";

// ── Fixtures ─────────────────────────────────────────────────────────

function makeProfile(over: Partial<RacProfile> = {}): RacProfile {
  return {
    id: 11,
    workspaceId: 7,
    agentId: 5,
    agentDraftId: 9,
    profileKey: "default",
    enabled: true,
    timeoutMs: null,
    notes: null,
    createdBy: 1,
    createdAt: new Date("2026-05-06"),
    updatedAt: new Date("2026-05-06"),
    ...over,
  };
}

const cagSection = {
  id: "capability-pack" as const,
  text: "## Capability Pack\nAgent: Test\n\n### Tools\n- studio::calculator (risk=read_only)",
  tokenEstimate: 30,
  contentHash: "a".repeat(64),
  warnings: [],
};

function makeChunk(over: Partial<RacRetrievalChunk> = {}): RacRetrievalChunk {
  return {
    content: "found content",
    score: 0.9,
    citation: "[doc:Sample §1]",
    sourceChunkId: "c1",
    ...over,
  };
}

const baseInput = {
  workspaceId: 7,
  agentId: 5,
  agentDraftId: 9,
  actorId: 1,
};

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

beforeEach(() => {
  vi.mocked(resolveCagPack).mockReset();
  vi.mocked(listProfilesForDraft).mockReset();
  vi.mocked(getPolicyForProfile).mockReset();
  vi.mocked(planRetrieval).mockReset();
  vi.mocked(executeRetrieval).mockReset();
});

// ── Branch 1: mode=disabled ────────────────────────────────────────

describe("resolveAndAssembleContext — mode=disabled", () => {
  it("calls CAG (resolver returns null section by contract) but skips retrieval", async () => {
    vi.mocked(resolveCagPack).mockResolvedValue({
      section: null,
      pack: null,
      warnings: [],
    });
    const out = await resolveAndAssembleContext({
      mode: "disabled",
      ...baseInput,
      query: "what is the time?",
    });
    expect(out.capabilityPack).toBeNull();
    expect(out.retrievalEvidence).toBeNull();
    expect(vi.mocked(listProfilesForDraft)).not.toHaveBeenCalled();
    expect(vi.mocked(planRetrieval)).not.toHaveBeenCalled();
    expect(out.trace.retrievalEnabled).toBe(false);
  });
});

// ── Branch 2: empty query ──────────────────────────────────────────

describe("resolveAndAssembleContext — empty query", () => {
  it("runs CAG but skips retrieval with fallbackReason=no_query", async () => {
    vi.mocked(resolveCagPack).mockResolvedValue({
      section: cagSection,
      pack: { id: 99, packVersion: 3 } as any,
      warnings: [],
    });
    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "   ",
    });
    expect(out.capabilityPack).toBe(cagSection);
    expect(out.retrievalEvidence).toBeNull();
    expect(out.trace.primaryFallbackReason).toBe("no_query");
    expect(out.trace.cagPackId).toBe(99);
    expect(vi.mocked(listProfilesForDraft)).not.toHaveBeenCalled();
  });
});

// ── Branch 3: no profile ───────────────────────────────────────────

describe("resolveAndAssembleContext — no RAC profile", () => {
  it("runs CAG, skips retrieval, sets fallbackReason=no_profile", async () => {
    vi.mocked(resolveCagPack).mockResolvedValue({
      section: cagSection,
      pack: { id: 99, packVersion: 3 } as any,
      warnings: [],
    });
    vi.mocked(listProfilesForDraft).mockResolvedValue([]);
    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "find related docs",
    });
    expect(out.capabilityPack).toBe(cagSection);
    expect(out.retrievalEvidence).toBeNull();
    expect(out.trace.primaryFallbackReason).toBe("no_profile");
    expect(vi.mocked(planRetrieval)).not.toHaveBeenCalled();
  });

  it("ignores profiles whose profileKey doesn't match (default uses key='default')", async () => {
    vi.mocked(resolveCagPack).mockResolvedValue({
      section: cagSection,
      pack: { id: 99, packVersion: 3 } as any,
      warnings: [],
    });
    vi.mocked(listProfilesForDraft).mockResolvedValue([
      makeProfile({ profileKey: "research" }),
    ]);
    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "anything",
    });
    expect(out.retrievalEvidence).toBeNull();
    expect(out.trace.primaryFallbackReason).toBe("no_profile");
  });
});

// ── Branch 4: happy path ───────────────────────────────────────────

describe("resolveAndAssembleContext — happy path", () => {
  it("returns both capabilityPack and retrievalEvidence with chunks rendered", async () => {
    vi.mocked(resolveCagPack).mockResolvedValue({
      section: cagSection,
      pack: { id: 99, packVersion: 3 } as any,
      warnings: ["cag: built fresh"],
    });
    vi.mocked(listProfilesForDraft).mockResolvedValue([makeProfile()]);
    vi.mocked(planRetrieval).mockResolvedValue({
      workspaceId: 7,
      profile: makeProfile(),
      workspaceEmbeddingDefault: null,
      items: [],
      runnableCount: 1,
      skipCounts: {
        disabled: 0,
        no_adapter: 0,
        in_process_pending: 0,
        embedding_unavailable: 0,
      },
      warnings: [],
    });
    vi.mocked(executeRetrieval).mockResolvedValue({
      perSource: [
        {
          sourceId: 1,
          sourceType: "graph_index",
          chunks: [makeChunk({ sourceChunkId: "c1", content: "result A" })],
          latencyMs: 42,
          warnings: [],
        },
      ],
      chunks: [makeChunk({ sourceChunkId: "c1", content: "result A" })],
      totalLatencyMs: 50,
      warnings: [],
    });
    vi.mocked(getPolicyForProfile).mockResolvedValue(null);

    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "find related docs",
    });
    expect(out.capabilityPack).toBe(cagSection);
    expect(out.retrievalEvidence).not.toBeNull();
    expect(out.retrievalEvidence!.text).toContain("result A");
    expect(out.retrievalEvidence!.text).toContain("[doc:Sample §1]");
    expect(out.trace.retrievalEnabled).toBe(true);
    expect(out.trace.retrievalLatencyMs).toBe(50);
    expect(out.trace.perSourceLatencyMs[1]).toBe(42);
    expect(out.trace.chunksReturned).toBe(1);
    expect(out.trace.chunksIncluded).toBe(1);
  });
});

// ── Branch 5: strict + missing CAG ─────────────────────────────────

describe("resolveAndAssembleContext — strict + CAG missing", () => {
  it("propagates CagRequiredError without invoking retrieval", async () => {
    vi.mocked(resolveCagPack).mockRejectedValue(
      new CagRequiredError("no fresh pack"),
    );
    await expect(
      resolveAndAssembleContext({
        mode: "strict",
        ...baseInput,
        query: "x",
      }),
    ).rejects.toBeInstanceOf(CagRequiredError);
    expect(vi.mocked(listProfilesForDraft)).not.toHaveBeenCalled();
  });
});

// ── Branch 6: strict + retrieval throws → RetrievalRequiredError ──

describe("resolveAndAssembleContext — strict + retrieval throw", () => {
  it("wraps the underlying error in RetrievalRequiredError", async () => {
    vi.mocked(resolveCagPack).mockResolvedValue({
      section: cagSection,
      pack: { id: 99, packVersion: 3 } as any,
      warnings: [],
    });
    vi.mocked(listProfilesForDraft).mockResolvedValue([makeProfile()]);
    vi.mocked(planRetrieval).mockRejectedValue(new Error("DB unavailable"));

    await expect(
      resolveAndAssembleContext({
        mode: "strict",
        ...baseInput,
        query: "x",
      }),
    ).rejects.toBeInstanceOf(RetrievalRequiredError);
  });
});

// ── Branch 7: safe_degraded + retrieval throws → warning, no evidence

describe("resolveAndAssembleContext — safe_degraded + retrieval throw", () => {
  it("returns capabilityPack with retrievalEvidence=null and a structured warning", async () => {
    vi.mocked(resolveCagPack).mockResolvedValue({
      section: cagSection,
      pack: { id: 99, packVersion: 3 } as any,
      warnings: [],
    });
    vi.mocked(listProfilesForDraft).mockResolvedValue([makeProfile()]);
    vi.mocked(planRetrieval).mockRejectedValue(new Error("DB unavailable"));

    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "x",
    });
    expect(out.capabilityPack).toBe(cagSection);
    expect(out.retrievalEvidence).toBeNull();
    expect(out.trace.primaryFallbackReason).toBe("retrieval_error");
    // M2-c8: warning format standardized to `fallback: <reason> (<detail>)`
    // by `recordFallback`. Detail carries the underlying error message
    // (M9-c8) so forensics still see "DB unavailable".
    expect(out.warnings.some((w) => /fallback: retrieval_error.*DB unavailable/.test(w))).toBe(true);
    expect(out.trace.primaryFallbackDetail).toContain("DB unavailable");
    expect(out.trace.fallbackReasons).toContain("retrieval_error");
  });
});

// ── buildRuntimeSystemPrompt — composer hand-off ───────────────────

describe("buildRuntimeSystemPrompt — composer hand-off", () => {
  it("composes a prompt that includes both CAG and evidence under safe_degraded", async () => {
    vi.mocked(resolveCagPack).mockResolvedValue({
      section: cagSection,
      pack: { id: 99, packVersion: 3 } as any,
      warnings: [],
    });
    vi.mocked(listProfilesForDraft).mockResolvedValue([makeProfile()]);
    vi.mocked(planRetrieval).mockResolvedValue({
      workspaceId: 7,
      profile: makeProfile(),
      workspaceEmbeddingDefault: null,
      items: [],
      runnableCount: 1,
      skipCounts: {
        disabled: 0,
        no_adapter: 0,
        in_process_pending: 0,
        embedding_unavailable: 0,
      },
      warnings: [],
    });
    vi.mocked(executeRetrieval).mockResolvedValue({
      perSource: [],
      chunks: [makeChunk({ content: "Once upon a time." })],
      totalLatencyMs: 10,
      warnings: [],
    });
    vi.mocked(getPolicyForProfile).mockResolvedValue(null);

    const built = await buildRuntimeSystemPrompt({
      mode: "safe_degraded",
      ...baseInput,
      query: "tell me a story",
      draft: baseDraft,
    });
    expect(built.systemPrompt).toContain("## Capability Pack");
    expect(built.systemPrompt).toContain("## Retrieval Evidence");
    expect(built.systemPrompt).toContain("Once upon a time.");
    expect(built.cacheKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("composes legacy concat under mode=disabled (byte-equivalent)", async () => {
    vi.mocked(resolveCagPack).mockResolvedValue({
      section: null,
      pack: null,
      warnings: [],
    });
    const built = await buildRuntimeSystemPrompt({
      mode: "disabled",
      ...baseInput,
      query: "x",
      draft: baseDraft,
    });
    const expected = [baseDraft.systemInstructions, baseDraft.roleInstructions]
      .filter((s) => s.length > 0)
      .join("\n\n");
    expect(built.systemPrompt).toBe(expected);
  });
});
