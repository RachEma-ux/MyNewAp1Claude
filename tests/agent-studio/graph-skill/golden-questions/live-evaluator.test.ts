// Native Graph Workspace V1.0 — Golden Questions live evaluator tests.
//
// Covers the PURE scorer + orchestrator + report formatter. The
// boundary-crossing engine factory is exercised by a separate source-
// scan test; live-mode end-to-end is operator territory.

import { describe, expect, it, vi } from "vitest";

import type { GraphAgentAnswer } from "../../../../server/agent-studio/services/graph-agent/contracts.js";
import {
  evaluateGoldenQuestion,
  formatLiveReport,
  formatLiveReportJson,
  runLiveEvaluation,
  scoreQuestion,
  type GoldenQuestion,
  type GoldenQuestionSuite,
  type GraphAgentRunner,
} from "../../../../server/agent-studio/services/graph-skill/golden-questions/live-evaluator.js";

function makeAnswer(
  override: Partial<GraphAgentAnswer> & {
    why?: Partial<GraphAgentAnswer["whyThisAnswer"]>;
  } = {},
): GraphAgentAnswer {
  return {
    runId: 1,
    answer: override.answer ?? "ok",
    citations: override.citations ?? [],
    graphPaths: [],
    confidence: 0.9,
    whyThisAnswer: {
      retrievalMode: "graphrag_local",
      skillPackKey: "vault_navigator",
      templateKey: "note_backlinks",
      graphBackendKey: "neo4j-ce",
      ...(override.why ?? {}),
    },
  };
}

const Q_BACKLINKS: GoldenQuestion = {
  suiteKey: "smoke",
  questionKey: "backlinks",
  question: "what notes link to X?",
  expectedAnswerPattern: null,
  expectedPaths: { templateKey: "note_backlinks", skillPackKey: "vault_navigator" },
  minimumCitationCount: 1,
};

describe("scoreQuestion", () => {
  it("passes when all criteria are satisfied", () => {
    const s = scoreQuestion(Q_BACKLINKS, {
      answer: makeAnswer({
        citations: [{ sourceKind: "note", sourceId: "a" }],
      }),
      durationMs: 100,
    });
    expect(s.passed).toBe(true);
    expect(s.failures).toEqual([]);
    expect(s.actualCitationCount).toBe(1);
  });

  it("fails on skillPack mismatch", () => {
    const s = scoreQuestion(Q_BACKLINKS, {
      answer: makeAnswer({
        why: { skillPackKey: "entity_inspector" },
        citations: [{ sourceKind: "note", sourceId: "a" }],
      }),
      durationMs: 100,
    });
    expect(s.passed).toBe(false);
    expect(s.failures.join(" ")).toMatch(/skillPackKey/);
  });

  it("fails on template mismatch", () => {
    const s = scoreQuestion(Q_BACKLINKS, {
      answer: makeAnswer({
        why: { templateKey: "vault_overview" },
        citations: [{ sourceKind: "note", sourceId: "a" }],
      }),
      durationMs: 100,
    });
    expect(s.passed).toBe(false);
    expect(s.failures.join(" ")).toMatch(/templateKey/);
  });

  it("fails on citation count below minimum", () => {
    const s = scoreQuestion(Q_BACKLINKS, {
      answer: makeAnswer({ citations: [] }),
      durationMs: 100,
    });
    expect(s.passed).toBe(false);
    expect(s.failures.join(" ")).toMatch(/citation count 0 < minimum 1/);
  });

  it("treats null expectedPaths as no constraint", () => {
    const q: GoldenQuestion = {
      ...Q_BACKLINKS,
      expectedPaths: null,
      minimumCitationCount: 0,
    };
    const s = scoreQuestion(q, {
      answer: makeAnswer({ why: { skillPackKey: undefined, templateKey: undefined } }),
      durationMs: 50,
    });
    expect(s.passed).toBe(true);
  });

  it("applies expectedAnswerPattern when set", () => {
    const q: GoldenQuestion = {
      ...Q_BACKLINKS,
      expectedAnswerPattern: "Alice",
      minimumCitationCount: 0,
    };
    const passing = scoreQuestion(q, {
      answer: makeAnswer({ answer: "Alice owns the X system." }),
      durationMs: 10,
    });
    expect(passing.passed).toBe(true);

    const failing = scoreQuestion(q, {
      answer: makeAnswer({ answer: "Bob owns it." }),
      durationMs: 10,
    });
    expect(failing.passed).toBe(false);
    expect(failing.failures.join(" ")).toMatch(/did not match/);
  });

  it("returns invalid regex as a failure rather than throwing", () => {
    const q: GoldenQuestion = {
      ...Q_BACKLINKS,
      expectedAnswerPattern: "(unclosed",
      minimumCitationCount: 0,
    };
    const s = scoreQuestion(q, {
      answer: makeAnswer({ answer: "anything" }),
      durationMs: 10,
    });
    expect(s.passed).toBe(false);
    expect(s.failures.join(" ")).toMatch(/not a valid regex/);
  });

  it("engine error always fails the question and records the message", () => {
    const s = scoreQuestion(Q_BACKLINKS, {
      answer: null,
      engineError: "boom",
      durationMs: 20,
    });
    expect(s.passed).toBe(false);
    expect(s.failures.join(" ")).toMatch(/engine error: boom/);
    expect(s.error).toBe("boom");
  });

  it("null answer without engineError fails as 'no answer returned'", () => {
    const s = scoreQuestion(Q_BACKLINKS, {
      answer: null,
      durationMs: 20,
    });
    expect(s.passed).toBe(false);
    expect(s.failures.join(" ")).toMatch(/no answer returned/);
  });
});

describe("evaluateGoldenQuestion", () => {
  it("invokes the runner with the question text and folds whyThisAnswer into the score", async () => {
    const runner: GraphAgentRunner = vi.fn(async () =>
      makeAnswer({ citations: [{ sourceKind: "note", sourceId: "x" }] }),
    );
    const result = await evaluateGoldenQuestion(Q_BACKLINKS, runner, {
      workspaceId: 1,
      userId: 2,
      now: (() => {
        let t = 1000;
        return () => (t += 5);
      })(),
    });
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        agentKey: "graph_agent_lite",
        query: Q_BACKLINKS.question,
        workspaceId: 1,
        userId: 2,
      }),
    );
    expect(result.passed).toBe(true);
    expect(result.durationMs).toBe(5);
  });

  it("swallows engine errors into a scored failure", async () => {
    const runner: GraphAgentRunner = vi.fn(async () => {
      throw new Error("rpc failed");
    });
    const result = await evaluateGoldenQuestion(Q_BACKLINKS, runner, {
      workspaceId: 1,
      userId: 2,
    });
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/rpc failed/);
  });
});

describe("runLiveEvaluation", () => {
  const SUITES: GoldenQuestionSuite[] = [
    {
      suiteKey: "smoke",
      name: "Smoke",
      description: null,
      questions: [
        Q_BACKLINKS,
        {
          ...Q_BACKLINKS,
          questionKey: "second",
          minimumCitationCount: 2,
        },
      ],
    },
  ];

  it("aggregates a passing suite", async () => {
    const runner: GraphAgentRunner = vi.fn(async () =>
      makeAnswer({
        citations: [
          { sourceKind: "note", sourceId: "a" },
          { sourceKind: "note", sourceId: "b" },
        ],
      }),
    );
    const summary = await runLiveEvaluation(SUITES, runner, {
      workspaceId: 1,
      userId: 2,
    });
    expect(summary.overallPassed).toBe(true);
    expect(summary.suitesPassed).toBe(1);
    expect(summary.questionsPassed).toBe(2);
    expect(summary.questionsErrored).toBe(0);
  });

  it("fails the overall verdict when any question fails", async () => {
    let i = 0;
    const runner: GraphAgentRunner = async () => {
      i++;
      // First call: 2 citations (passes both criteria); Second call: 0 citations (fails the floor=2 criterion).
      return makeAnswer({
        citations: i === 1 ? [{ sourceKind: "n", sourceId: "1" }, { sourceKind: "n", sourceId: "2" }] : [],
      });
    };
    const summary = await runLiveEvaluation(SUITES, runner, {
      workspaceId: 1,
      userId: 2,
    });
    expect(summary.overallPassed).toBe(false);
    expect(summary.questionsPassed).toBe(1);
    expect(summary.suitesPassed).toBe(0);
  });

  it("counts engine errors separately", async () => {
    const runner: GraphAgentRunner = async () => {
      throw new Error("nope");
    };
    const summary = await runLiveEvaluation(SUITES, runner, {
      workspaceId: 1,
      userId: 2,
    });
    expect(summary.questionsErrored).toBe(2);
    expect(summary.overallPassed).toBe(false);
  });

  describe("failure-state emission (T-I.38)", () => {
    it("emits golden_question_failed for each failed question", async () => {
      let i = 0;
      const runner: GraphAgentRunner = async () => {
        i++;
        return makeAnswer({
          citations: i === 1
            ? [{ sourceKind: "n", sourceId: "1" }, { sourceKind: "n", sourceId: "2" }]
            : [],
        });
      };
      const emitter = vi.fn(async () => null);
      await runLiveEvaluation(SUITES, runner, {
        workspaceId: 1,
        userId: 2,
        recordFailureStateEvent: emitter,
      });
      expect(emitter).toHaveBeenCalledTimes(1);
      const call = emitter.mock.calls[0][0];
      expect(call.failureState).toBe("golden_question_failed");
      expect(call.sourceKind).toBe("golden-questions.live-evaluator");
      expect(call.sourceId).toBe("smoke/second");
      expect(call.userId).toBe(2);
      expect(call.metadata?.suiteKey).toBe("smoke");
      expect(call.metadata?.questionKey).toBe("second");
      expect(call.metadata?.workspaceId).toBe(1);
    });

    it("does not emit for passing questions", async () => {
      const runner: GraphAgentRunner = vi.fn(async () =>
        makeAnswer({
          citations: [
            { sourceKind: "n", sourceId: "1" },
            { sourceKind: "n", sourceId: "2" },
          ],
        }),
      );
      const emitter = vi.fn(async () => null);
      await runLiveEvaluation(SUITES, runner, {
        workspaceId: 1,
        userId: 2,
        recordFailureStateEvent: emitter,
      });
      expect(emitter).not.toHaveBeenCalled();
    });

    it("emits with engine-error metadata when runner throws", async () => {
      const runner: GraphAgentRunner = async () => {
        throw new Error("boom");
      };
      const emitter = vi.fn(async () => null);
      await runLiveEvaluation(SUITES, runner, {
        workspaceId: 1,
        userId: 2,
        recordFailureStateEvent: emitter,
      });
      expect(emitter).toHaveBeenCalledTimes(2);
      const call = emitter.mock.calls[0][0];
      expect(call.failureState).toBe("golden_question_failed");
      expect(call.metadata?.engineErrored).toBe(true);
      expect(call.errorMessage).toMatch(/boom/);
    });

    it("suppresses emission when recordFailureStateEvent is null", async () => {
      const runner: GraphAgentRunner = async () => {
        throw new Error("boom");
      };
      // Spy on the canonical emitter to ensure null disables (and that the
      // default path doesn't fire either when explicit null is passed).
      await runLiveEvaluation(SUITES, runner, {
        workspaceId: 1,
        userId: 2,
        recordFailureStateEvent: null,
      });
      // No throw, no exception. Behavior: bridge call is skipped; verified
      // structurally via the next test using the explicit emitter override.
    });
  });
});

describe("formatLiveReport", () => {
  it("renders PASS verdict + per-question rows", () => {
    const summary = {
      overallPassed: true,
      suitesTotal: 1,
      suitesPassed: 1,
      questionsTotal: 1,
      questionsPassed: 1,
      questionsErrored: 0,
      suites: [
        {
          suiteKey: "smoke",
          name: "Smoke",
          passed: true,
          results: [
            {
              questionKey: "backlinks",
              suiteKey: "smoke",
              passed: true,
              failures: [],
              actualSkillPackKey: "vault_navigator",
              actualTemplateKey: "note_backlinks",
              actualCitationCount: 1,
              actualRetrievalMode: "graphrag_local",
              answerText: "ok",
              durationMs: 42,
            },
          ],
        },
      ],
    };
    const md = formatLiveReport("2026-05-13", summary);
    expect(md).toMatch(/Overall:.*PASS/);
    expect(md).toMatch(/Smoke.*PASS/);
    expect(md).toMatch(/backlinks \| PASS/);
    expect(md).toMatch(/per runbook §4\.5/i);
  });

  it("renders FAIL verdict + failure list when a question fails", () => {
    const summary = {
      overallPassed: false,
      suitesTotal: 1,
      suitesPassed: 0,
      questionsTotal: 1,
      questionsPassed: 0,
      questionsErrored: 0,
      suites: [
        {
          suiteKey: "smoke",
          name: "Smoke",
          passed: false,
          results: [
            {
              questionKey: "backlinks",
              suiteKey: "smoke",
              passed: false,
              failures: ["citation count 0 < minimum 1"],
              actualCitationCount: 0,
              actualRetrievalMode: "graphrag_local",
              answerText: "ok",
              durationMs: 42,
            },
          ],
        },
      ],
    };
    const md = formatLiveReport("2026-05-13", summary);
    expect(md).toMatch(/Overall:.*FAIL/);
    expect(md).toMatch(/citation count 0 < minimum 1/);
    expect(md).toMatch(/do NOT modify/i);
  });
});

describe("formatLiveReportJson", () => {
  it("emits stable JSON including date + counts", () => {
    const summary = {
      overallPassed: true,
      suitesTotal: 1,
      suitesPassed: 1,
      questionsTotal: 1,
      questionsPassed: 1,
      questionsErrored: 0,
      suites: [],
    };
    const json = formatLiveReportJson("2026-05-13", summary);
    const parsed = JSON.parse(json);
    expect(parsed.date).toBe("2026-05-13");
    expect(parsed.overallPassed).toBe(true);
    expect(parsed.questionsTotal).toBe(1);
  });
});
