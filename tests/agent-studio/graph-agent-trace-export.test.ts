/**
 * Phase 14 §1 — decision-trace Markdown export tests.
 *
 * Covers `exportDecisionTraceAsMarkdown()` from
 * `services/graph-agent/trace-export.ts`. Uses `vi.mock` to stub the
 * §3 `getExplanationForRun` reader so the test exercises the
 * markdown rendering in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getExplanationMock: vi.fn(),
  getGraphSkillRefsMock: vi.fn(async () => []),
}));

vi.mock("../../server/agent-studio/services/graph-agent/explain-reader", () => ({
  getExplanationForRun: hoisted.getExplanationMock,
}));

vi.mock(
  "../../server/agent-studio/services/graph-agent/graph-skill-source-note-refs-reader",
  () => ({
    getGraphSkillSourceNoteRefsForRun: hoisted.getGraphSkillRefsMock,
  }),
);

import { exportDecisionTraceAsMarkdown } from "../../server/agent-studio/services/graph-agent/trace-export";

beforeEach(() => {
  hoisted.getExplanationMock.mockReset();
  hoisted.getGraphSkillRefsMock.mockReset();
  hoisted.getGraphSkillRefsMock.mockResolvedValue([]);
});

const STARTED = new Date("2026-05-11T10:00:00Z");
const COMPLETED = new Date("2026-05-11T10:00:05Z");

function makeExplanation(overrides: Record<string, unknown> = {}) {
  return {
    runtimeRunId: 7,
    graphAgentRunId: 100,
    agentKey: "graph_agent_lite",
    userQuery: "what links to seed?",
    status: "completed",
    durationMs: 5000,
    errorMessage: null,
    startedAt: STARTED,
    completedAt: COMPLETED,
    steps: [
      {
        stepIndex: 1,
        stepKind: "plan_retrieval_mode",
        stepInput: { retrievalPreference: "auto" },
        stepOutput: { retrievalMode: "graphrag_local" },
        durationMs: 1,
        createdAt: STARTED,
      },
      {
        stepIndex: 2,
        stepKind: "retrieve",
        stepInput: null,
        stepOutput: { contextBlockCount: 3, truncated: false },
        durationMs: 25,
        createdAt: STARTED,
      },
    ],
    ...overrides,
  };
}

describe("exportDecisionTraceAsMarkdown — Phase 14 §1", () => {
  it("returns null when getExplanationForRun returns null", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(null);
    const result = await exportDecisionTraceAsMarkdown(99);
    expect(result).toBeNull();
  });

  it("returns { runtimeRunId, graphAgentRunId, markdown } when explanation exists", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const result = await exportDecisionTraceAsMarkdown(7);
    expect(result).not.toBeNull();
    expect(result!.runtimeRunId).toBe(7);
    expect(result!.graphAgentRunId).toBe(100);
    expect(typeof result!.markdown).toBe("string");
  });

  it("markdown begins with an H1 carrying the run id", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const result = await exportDecisionTraceAsMarkdown(7);
    expect(result!.markdown.startsWith("# Graph Agent Run #7")).toBe(true);
  });

  it("markdown includes the user query in a blockquote", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const result = await exportDecisionTraceAsMarkdown(7);
    expect(result!.markdown).toContain("> **Query:** what links to seed?");
  });

  it("markdown includes per-step H3 headers + duration + JSON output", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const result = await exportDecisionTraceAsMarkdown(7);
    expect(result!.markdown).toContain("### Step 1 · `plan_retrieval_mode`");
    expect(result!.markdown).toContain("### Step 2 · `retrieve`");
    expect(result!.markdown).toContain("**Duration:** 1 ms");
    expect(result!.markdown).toContain("**Duration:** 25 ms");
    expect(result!.markdown).toContain("\"contextBlockCount\": 3");
  });

  it("markdown surfaces errorMessage as a warning block when present", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(
      makeExplanation({ status: "failed", errorMessage: "model boom" }),
    );
    const result = await exportDecisionTraceAsMarkdown(7);
    expect(result!.markdown).toContain("⚠️ **Error:** model boom");
  });

  it("markdown handles zero-step runs gracefully", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(
      makeExplanation({ steps: [] }),
    );
    const result = await exportDecisionTraceAsMarkdown(7);
    expect(result!.markdown).toContain("_No steps recorded._");
  });

  it("markdown skips the Input block when stepInput is null/empty", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(
      makeExplanation({
        steps: [
          {
            stepIndex: 1,
            stepKind: "x",
            stepInput: null,
            stepOutput: { foo: "bar" },
            durationMs: 1,
            createdAt: STARTED,
          },
        ],
      }),
    );
    const result = await exportDecisionTraceAsMarkdown(7);
    expect(result!.markdown).not.toContain("**Input:**");
    expect(result!.markdown).toContain("**Output:**");
  });

  it("title prefix is configurable via options", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const result = await exportDecisionTraceAsMarkdown(7, {
      title: "Investigation",
    });
    expect(result!.markdown.startsWith("# Investigation #7")).toBe(true);
  });

  it("markdown ends with a trailing footer that identifies the export source", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const result = await exportDecisionTraceAsMarkdown(7);
    expect(result!.markdown).toMatch(
      /_Exported from Native Graph Workspace decision-trace ledger \(runtimeRunId=7\)._/,
    );
  });

  it("threads options through to the explain reader (getDb override)", async () => {
    const fakeGetDb = vi.fn(() => null as never);
    hoisted.getExplanationMock.mockResolvedValueOnce(null);
    await exportDecisionTraceAsMarkdown(7, { getDb: fakeGetDb });
    expect(hoisted.getExplanationMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ getDb: fakeGetDb }),
    );
  });

  it("Phase 14 §4 — redacts sensitive payloads in step outputs by default", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(
      makeExplanation({
        steps: [
          {
            stepIndex: 1,
            stepKind: "model_call",
            stepInput: { apiKey: "sk-abcdefghijklmnopqrst" },
            stepOutput: { reply: "Hello alice@example.com" },
            durationMs: 1,
            createdAt: STARTED,
          },
        ],
      }),
    );
    const result = await exportDecisionTraceAsMarkdown(7);
    expect(result!.markdown).toContain("[REDACTED]");
    expect(result!.markdown).not.toContain("sk-abcdefghijklmnopqrst");
    expect(result!.markdown).not.toContain("alice@example.com");
  });

  it("Phase 14 §6 — renders Graph Skill References section when refs are non-empty", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const result = await exportDecisionTraceAsMarkdown(7, {
      getGraphSkillRefs: async () => [
        {
          packKey: "seed_link_analysis",
          packName: "Seed Link Analysis",
          packVersionId: 10,
          packVersion: "1.0.0",
          sourceNoteVersionId: 500,
          sourceNoteId: 200,
          sourceNoteVersion: 3,
          sourceNoteSlug: "seed-skill-pack-note",
          sourceNoteTitle: "Seed Skill Pack: Documentation",
        },
      ],
    });
    expect(result!.markdown).toContain("## Graph Skill References");
    expect(result!.markdown).toContain("**Seed Link Analysis**");
    expect(result!.markdown).toContain("`seed_link_analysis` v1.0.0");
    expect(result!.markdown).toContain("packVersionId=10");
    expect(result!.markdown).toContain("`seed-skill-pack-note`");
    expect(result!.markdown).toContain("Seed Skill Pack: Documentation");
    expect(result!.markdown).toContain("v3");
  });

  it("Phase 14 §6 — renders 'no source note attached' when ref has null sourceNoteId", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const result = await exportDecisionTraceAsMarkdown(7, {
      getGraphSkillRefs: async () => [
        {
          packKey: "p1",
          packName: "Pack 1",
          packVersionId: 10,
          packVersion: "1.0.0",
          sourceNoteVersionId: null,
          sourceNoteId: null,
          sourceNoteVersion: null,
          sourceNoteSlug: null,
          sourceNoteTitle: null,
        },
      ],
    });
    expect(result!.markdown).toContain("## Graph Skill References");
    expect(result!.markdown).toContain("_no source note attached_");
  });

  it("Phase 14 §6 — omits Graph Skill References section when refs are empty", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const result = await exportDecisionTraceAsMarkdown(7, {
      getGraphSkillRefs: async () => [],
    });
    expect(result!.markdown).not.toContain("## Graph Skill References");
  });

  it("Phase 14 §6 — `includeGraphSkillRefs: false` skips the resolver entirely", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(makeExplanation());
    const refResolver = vi.fn(async () => []);
    const result = await exportDecisionTraceAsMarkdown(7, {
      includeGraphSkillRefs: false,
      getGraphSkillRefs: refResolver,
    });
    expect(refResolver).not.toHaveBeenCalled();
    expect(result!.markdown).not.toContain("## Graph Skill References");
  });

  it("Phase 14 §4 — `redact: false` opts out of redaction (raw payloads pass through)", async () => {
    hoisted.getExplanationMock.mockResolvedValueOnce(
      makeExplanation({
        steps: [
          {
            stepIndex: 1,
            stepKind: "model_call",
            stepInput: { apiKey: "sk-abcdefghijklmnopqrst" },
            stepOutput: null,
            durationMs: 1,
            createdAt: STARTED,
          },
        ],
      }),
    );
    const result = await exportDecisionTraceAsMarkdown(7, { redact: false });
    expect(result!.markdown).toContain("sk-abcdefghijklmnopqrst");
    expect(result!.markdown).not.toContain("[REDACTED]");
  });
});
