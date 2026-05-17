/**
 * T-D.5 — Golden-question failure → correction-proposal hook.
 *
 * Closes the final T-D acceptance criterion: "self-correcting" loop.
 * When a golden question fails, the live evaluator emits a
 * `review_golden_question_failure` proposal into
 * `ags_graph_correction_proposals` so operators can triage via the
 * existing approve-and-apply UI.
 *
 * Coverage:
 *   - convertFailureToProposal (pure) produces the canonical row shape
 *   - convertFailureToProposal throws on a PASSED score (defensive)
 *   - emitGoldenQuestionFailureProposal swallows writer errors (fail-soft)
 *   - emitGoldenQuestionFailureProposal returns null on a passed score
 *   - Source-scan: bridge has no neo4j-driver / openrouter / process.env
 *   - Live-evaluator wires the writer through runLiveEvaluation per
 *     failed question; not invoked for passed questions; skipped when
 *     option omitted; suppressed when option=null.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  GOLDEN_QUESTION_FAILURE_PROPOSAL_KIND,
  convertFailureToProposal,
  emitGoldenQuestionFailureProposal,
  type GoldenQuestionFailureProposalRow,
  type GoldenQuestionFailureProposalWriter,
} from "../../server/agent-studio/services/graph-skill/golden-questions/failure-correction-bridge";
import {
  runLiveEvaluation,
  type GoldenQuestion,
  type GoldenQuestionSuite,
  type GoldenQuestionScore,
  type GraphAgentRunner,
} from "../../server/agent-studio/services/graph-skill/golden-questions/live-evaluator";

const BRIDGE_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-skill/golden-questions/failure-correction-bridge.ts",
);
const EVALUATOR_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-skill/golden-questions/live-evaluator.ts",
);

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function failedScore(
  overrides: Partial<GoldenQuestionScore> = {},
): GoldenQuestionScore {
  return {
    questionKey: "q1",
    suiteKey: "suite-a",
    passed: false,
    failures: ['expected skillPackKey="x", got "y"'],
    actualSkillPackKey: "y",
    actualTemplateKey: undefined,
    actualCitationCount: 0,
    actualRetrievalMode: "agentic",
    answerText: "",
    durationMs: 42,
    ...overrides,
  };
}

function passedScore(): GoldenQuestionScore {
  return {
    questionKey: "q1",
    suiteKey: "suite-a",
    passed: true,
    failures: [],
    actualSkillPackKey: "x",
    actualTemplateKey: "t",
    actualCitationCount: 3,
    actualRetrievalMode: "agentic",
    answerText: "answer",
    durationMs: 17,
  };
}

describe("T-D.5 — convertFailureToProposal (pure)", () => {
  it("produces a row with kind = review_golden_question_failure + status=pending", () => {
    const row = convertFailureToProposal(failedScore(), { workspaceId: 7 });
    expect(row.proposalKind).toBe(GOLDEN_QUESTION_FAILURE_PROPOSAL_KIND);
    expect(row.proposalKind).toBe("review_golden_question_failure");
    expect(row.status).toBe("pending");
  });

  it("targets agent_runtime / null id (failure is at retrieval surface not a graph node)", () => {
    const row = convertFailureToProposal(failedScore(), { workspaceId: 1 });
    expect(row.targetTypeKey).toBe("agent_runtime");
    expect(row.targetId).toBeNull();
  });

  it("default confidence is 0.95 (curated suite — high-confidence wrong signal)", () => {
    const row = convertFailureToProposal(failedScore(), { workspaceId: 1 });
    expect(row.confidence).toBe(0.95);
  });

  it("honors confidence override clamped to [0,1]", () => {
    expect(
      convertFailureToProposal(failedScore(), { workspaceId: 1, confidence: 0.5 })
        .confidence,
    ).toBe(0.5);
    expect(
      convertFailureToProposal(failedScore(), { workspaceId: 1, confidence: -1 })
        .confidence,
    ).toBe(0);
    expect(
      convertFailureToProposal(failedScore(), { workspaceId: 1, confidence: 5 })
        .confidence,
    ).toBe(1);
  });

  it("payload preserves suiteKey + questionKey + workspaceId + actuals + hint", () => {
    const row = convertFailureToProposal(
      failedScore({
        actualSkillPackKey: "skill-x",
        actualTemplateKey: "tpl-y",
        actualCitationCount: 2,
      }),
      { workspaceId: 7 },
    );
    expect(row.proposedChange.suiteKey).toBe("suite-a");
    expect(row.proposedChange.questionKey).toBe("q1");
    expect(row.proposedChange.workspaceId).toBe(7);
    expect(row.proposedChange.actualSkillPackKey).toBe("skill-x");
    expect(row.proposedChange.actualTemplateKey).toBe("tpl-y");
    expect(row.proposedChange.actualCitationCount).toBe(2);
    expect(row.proposedChange.actualRetrievalMode).toBe("agentic");
    expect(row.proposedChange.engineErrored).toBe(false);
    expect(String(row.proposedChange.hint)).toMatch(/Review the failure/);
  });

  it("engineErrored=true when score carries error", () => {
    const row = convertFailureToProposal(
      failedScore({ error: "boom", failures: ["engine error: boom"] }),
      { workspaceId: 1 },
    );
    expect(row.proposedChange.engineErrored).toBe(true);
    expect(row.rationale).toMatch(/Engine error: boom/);
  });

  it("rationale lists failures when no engine error", () => {
    const row = convertFailureToProposal(failedScore(), { workspaceId: 1 });
    expect(row.rationale).toMatch(/Golden question suite-a\/q1 failed/);
    expect(row.rationale).toMatch(/expected skillPackKey/);
  });

  it("THROWS when called with a PASSED score (defensive)", () => {
    expect(() =>
      convertFailureToProposal(passedScore(), { workspaceId: 1 }),
    ).toThrow(/T-D\.5.*PASSED/);
  });

  it("optional proposedByAgentId threads through; defaults to null", () => {
    expect(
      convertFailureToProposal(failedScore(), { workspaceId: 1 }).proposedByAgentId,
    ).toBeNull();
    expect(
      convertFailureToProposal(failedScore(), {
        workspaceId: 1,
        proposedByAgentId: 99,
      }).proposedByAgentId,
    ).toBe(99);
  });
});

describe("T-D.5 — emitGoldenQuestionFailureProposal (impure)", () => {
  it("calls the writer with the converted row on a failed score", async () => {
    const captured: GoldenQuestionFailureProposalRow[] = [];
    const writer: GoldenQuestionFailureProposalWriter = async (row) => {
      captured.push(row);
      return { proposalId: 42 };
    };
    const out = await emitGoldenQuestionFailureProposal(failedScore(), {
      workspaceId: 1,
      proposalWriter: writer,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.proposalKind).toBe(GOLDEN_QUESTION_FAILURE_PROPOSAL_KIND);
    expect(out?.proposalId).toBe(42);
  });

  it("returns null on a PASSED score; writer NOT called", async () => {
    const writer: GoldenQuestionFailureProposalWriter = async () => {
      throw new Error("should not be called");
    };
    const out = await emitGoldenQuestionFailureProposal(passedScore(), {
      workspaceId: 1,
      proposalWriter: writer,
    });
    expect(out).toBeNull();
  });

  it("swallows writer errors (fail-soft) and returns proposalId: null", async () => {
    const writer: GoldenQuestionFailureProposalWriter = async () => {
      throw new Error("DB down");
    };
    const out = await emitGoldenQuestionFailureProposal(failedScore(), {
      workspaceId: 1,
      proposalWriter: writer,
    });
    expect(out?.proposalId).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// Wiring through runLiveEvaluation
// ────────────────────────────────────────────────────────────────────

function makeSuite(): GoldenQuestionSuite {
  const q: GoldenQuestion = {
    suiteKey: "suite-a",
    questionKey: "q1",
    question: "What is the capital of France?",
    expectedAnswerPattern: "^Paris$",
    expectedPaths: { skillPackKey: "geography" },
    minimumCitationCount: 1,
  };
  const q2: GoldenQuestion = { ...q, questionKey: "q2" };
  return {
    suiteKey: "suite-a",
    name: "Suite A",
    description: null,
    questions: [q, q2],
  };
}

function makeRunnerThatFailsBoth(): GraphAgentRunner {
  return async () => ({
    answer: "Lyon",
    citations: [],
    whyThisAnswer: {
      skillPackKey: "wrong-pack",
      templateKey: undefined,
      retrievalMode: "agentic",
    },
  } as any);
}

function makeRunnerThatPassesBoth(): GraphAgentRunner {
  return async () => ({
    answer: "Paris",
    citations: [{ noteId: 1 } as any],
    whyThisAnswer: {
      skillPackKey: "geography",
      templateKey: "tpl-cap",
      retrievalMode: "agentic",
    },
  } as any);
}

describe("T-D.5 — runLiveEvaluation wiring", () => {
  it("calls emitGoldenQuestionFailureProposal once per failed question", async () => {
    const writeCalls: GoldenQuestionFailureProposalRow[] = [];
    const writer: GoldenQuestionFailureProposalWriter = async (row) => {
      writeCalls.push(row);
      return { proposalId: 1 };
    };

    await runLiveEvaluation([makeSuite()], makeRunnerThatFailsBoth(), {
      workspaceId: 1,
      userId: 1,
      // Suppress observability bridge in the test
      recordFailureStateEvent: null,
      emitGoldenQuestionFailureProposal: writer,
    });

    // Two questions, both failed → 2 proposals.
    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0]!.proposalKind).toBe(GOLDEN_QUESTION_FAILURE_PROPOSAL_KIND);
  });

  it("does NOT call writer for passed questions", async () => {
    const writeCalls: GoldenQuestionFailureProposalRow[] = [];
    const writer: GoldenQuestionFailureProposalWriter = async (row) => {
      writeCalls.push(row);
      return { proposalId: 1 };
    };

    await runLiveEvaluation([makeSuite()], makeRunnerThatPassesBoth(), {
      workspaceId: 1,
      userId: 1,
      recordFailureStateEvent: null,
      emitGoldenQuestionFailureProposal: writer,
    });

    expect(writeCalls).toHaveLength(0);
  });

  it("emitter option omitted → backwards-compatible (no writer ever called)", async () => {
    let called = false;
    const _writer: GoldenQuestionFailureProposalWriter = async () => {
      called = true;
      return { proposalId: 1 };
    };
    await runLiveEvaluation([makeSuite()], makeRunnerThatFailsBoth(), {
      workspaceId: 1,
      userId: 1,
      recordFailureStateEvent: null,
      // emitGoldenQuestionFailureProposal omitted — should not fail
    });
    expect(called).toBe(false);
  });

  it("emitter option = null → suppressed even when failures occur", async () => {
    let called = false;
    const _writer: GoldenQuestionFailureProposalWriter = async () => {
      called = true;
      return { proposalId: 1 };
    };
    await runLiveEvaluation([makeSuite()], makeRunnerThatFailsBoth(), {
      workspaceId: 1,
      userId: 1,
      recordFailureStateEvent: null,
      emitGoldenQuestionFailureProposal: null,
    });
    expect(called).toBe(false);
  });

  it("writer error does not break the evaluation loop (fail-soft)", async () => {
    const writer: GoldenQuestionFailureProposalWriter = async () => {
      throw new Error("DB down");
    };
    // Should not throw despite the writer rejection.
    const result = await runLiveEvaluation(
      [makeSuite()],
      makeRunnerThatFailsBoth(),
      {
        workspaceId: 1,
        userId: 1,
        recordFailureStateEvent: null,
        emitGoldenQuestionFailureProposal: writer,
      },
    );
    expect(result.questionsTotal).toBe(2);
    expect(result.questionsPassed).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Source-scan
// ────────────────────────────────────────────────────────────────────

describe("T-D.5 — source-scan", () => {
  it("bridge file has no neo4j-driver / openrouter / process.env reads", () => {
    const src = read(BRIDGE_FILE);
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(src).not.toMatch(
      /from\s+["'](?:openrouter|openai|@anthropic-ai\/sdk|@google\/generative-ai)["']/,
    );
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("bridge does NOT import dispatchMcpToolCall (read-only signal path)", () => {
    const src = read(BRIDGE_FILE);
    expect(src).not.toMatch(/^import[^\n]*dispatchMcpToolCall/m);
    expect(src).not.toMatch(/dispatchMcpToolCall\(/);
  });

  it("bridge exports the load-bearing proposal-kind constant", () => {
    const src = read(BRIDGE_FILE);
    expect(src).toMatch(
      /export\s+const\s+GOLDEN_QUESTION_FAILURE_PROPOSAL_KIND\s*=\s*["']review_golden_question_failure["']/,
    );
  });

  it("live-evaluator imports the bridge and threads it through runLiveEvaluation", () => {
    const src = read(EVALUATOR_FILE);
    expect(src).toMatch(/from\s+["']\.\/failure-correction-bridge\.js["']/);
    expect(src).toMatch(/emitGoldenQuestionFailureProposal\(/);
    expect(src).toMatch(/emitGoldenQuestionFailureProposal\?:/);
  });
});
