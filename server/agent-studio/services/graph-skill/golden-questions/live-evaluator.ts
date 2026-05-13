/**
 * Native Graph Workspace V1.0 — Golden Questions live evaluator.
 *
 * Strict-audit item #2 closure. Compose the seeded Golden Question
 * suites + the Graph Agent Lite engine into a runnable live evaluator
 * that:
 *
 *   - Loads questions out of ASDB (or accepts an in-memory list for tests).
 *   - For each question: invokes a `GraphAgentRunner` (the engine's
 *     `run()` method, narrowed to a callable shape for testability).
 *   - Scores the result against the seeded `expectedPaths` +
 *     `minimumCitationCount` (+ optional `expectedAnswerPattern`).
 *   - Aggregates per-suite + overall verdict.
 *   - Emits both markdown + a machine-readable JSON shape for CI.
 *
 * BOUNDARY PRESERVATION:
 *   - This module performs no model calls, no MCP dispatch, no graph
 *     access. It accepts an opaque `GraphAgentRunner` callback. The
 *     adapter composition that produces that callback lives in
 *     `live-engine-factory.ts` (which is the one place that imports
 *     the OpenRouter Model Access boundary + `dispatchMcpToolCall` +
 *     `GraphRepository` — and that file uses `withProviderCredential`
 *     for credentials per Plan v3 D1).
 *   - The scorer is pure: same inputs → same outputs. Deterministic.
 *
 * See:
 *   docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md
 *   docs/architecture/agent-studio-graph-agent-runtime.md
 */

import type { GraphAgentAnswer, GraphAgentRunInput } from "../../graph-agent/contracts.js";

// ─────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────

export interface GoldenQuestion {
  readonly suiteKey: string;
  readonly questionKey: string;
  readonly question: string;
  readonly expectedAnswerPattern: string | null;
  readonly expectedPaths: { templateKey?: string; skillPackKey?: string } | null;
  readonly minimumCitationCount: number;
}

export interface GoldenQuestionSuite {
  readonly suiteKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly questions: ReadonlyArray<GoldenQuestion>;
}

/**
 * Engine-runner shape — kept narrow to keep this module
 * boundary-agnostic. In production this is `engine.run.bind(engine)`;
 * in tests this is a `vi.fn()` stub.
 */
export type GraphAgentRunner = (
  input: GraphAgentRunInput,
) => Promise<GraphAgentAnswer>;

export interface LiveEvaluationOptions {
  /** Workspace context to pass to the engine. Required in live mode. */
  readonly workspaceId: number;
  /** Actor / user context. Required in live mode. */
  readonly userId: number;
  /** Per-question wall-clock budget (ms). Soft — applied around each engine.run. */
  readonly perQuestionTimeoutMs?: number;
  /** Optional clock injection for deterministic duration recording in tests. */
  readonly now?: () => number;
}

// ─────────────────────────────────────────────────────────────────────
// Outputs
// ─────────────────────────────────────────────────────────────────────

export interface GoldenQuestionScore {
  readonly questionKey: string;
  readonly suiteKey: string;
  readonly passed: boolean;
  readonly failures: ReadonlyArray<string>;
  /** Engine's reported skill pack (may be undefined if engine did not surface one). */
  readonly actualSkillPackKey?: string;
  readonly actualTemplateKey?: string;
  readonly actualCitationCount: number;
  readonly actualRetrievalMode: string;
  readonly answerText: string;
  readonly durationMs: number;
  /** Any error thrown by the engine. When set, the question is treated as failed. */
  readonly error?: string;
}

export interface GoldenQuestionSuiteResult {
  readonly suiteKey: string;
  readonly name: string;
  readonly passed: boolean;
  readonly results: ReadonlyArray<GoldenQuestionScore>;
}

export interface LiveEvaluationSummary {
  readonly overallPassed: boolean;
  readonly suitesTotal: number;
  readonly suitesPassed: number;
  readonly questionsTotal: number;
  readonly questionsPassed: number;
  readonly questionsErrored: number;
  readonly suites: ReadonlyArray<GoldenQuestionSuiteResult>;
}

// ─────────────────────────────────────────────────────────────────────
// Scoring — pure
// ─────────────────────────────────────────────────────────────────────

/**
 * Score a single question against the engine's answer. Pure: same
 * inputs produce the same `GoldenQuestionScore`. Failure reasons are
 * surfaced as a flat list — multiple criteria can fail in one run.
 *
 * Criteria (per runbook §4.4):
 *   - expectedPaths.skillPackKey — when set, must match actual.
 *   - expectedPaths.templateKey — when set, must match actual.
 *   - minimumCitationCount — citation count ≥ floor.
 *   - expectedAnswerPattern — when set, answer must match (regex).
 *
 * If `engineError` is set, the question is unconditionally failed and
 * `failures` includes the error message.
 */
export function scoreQuestion(
  question: GoldenQuestion,
  result: {
    answer: GraphAgentAnswer | null;
    engineError?: string;
    durationMs: number;
  },
): GoldenQuestionScore {
  const failures: string[] = [];

  if (result.engineError !== undefined) {
    return {
      questionKey: question.questionKey,
      suiteKey: question.suiteKey,
      passed: false,
      failures: [`engine error: ${result.engineError}`],
      actualCitationCount: 0,
      actualRetrievalMode: "n/a",
      answerText: "",
      durationMs: result.durationMs,
      error: result.engineError,
    };
  }

  if (!result.answer) {
    return {
      questionKey: question.questionKey,
      suiteKey: question.suiteKey,
      passed: false,
      failures: ["no answer returned by engine"],
      actualCitationCount: 0,
      actualRetrievalMode: "n/a",
      answerText: "",
      durationMs: result.durationMs,
    };
  }

  const why = result.answer.whyThisAnswer;
  const actualSkillPackKey = why.skillPackKey;
  const actualTemplateKey = why.templateKey;
  const actualCitationCount = result.answer.citations.length;
  const actualRetrievalMode = why.retrievalMode;

  if (question.expectedPaths?.skillPackKey) {
    if (actualSkillPackKey !== question.expectedPaths.skillPackKey) {
      failures.push(
        `expected skillPackKey="${question.expectedPaths.skillPackKey}", got "${actualSkillPackKey ?? "<none>"}"`,
      );
    }
  }
  if (question.expectedPaths?.templateKey) {
    if (actualTemplateKey !== question.expectedPaths.templateKey) {
      failures.push(
        `expected templateKey="${question.expectedPaths.templateKey}", got "${actualTemplateKey ?? "<none>"}"`,
      );
    }
  }
  if (actualCitationCount < question.minimumCitationCount) {
    failures.push(
      `citation count ${actualCitationCount} < minimum ${question.minimumCitationCount}`,
    );
  }
  if (question.expectedAnswerPattern) {
    try {
      const re = new RegExp(question.expectedAnswerPattern);
      if (!re.test(result.answer.answer)) {
        failures.push(
          `answer text did not match /${question.expectedAnswerPattern}/`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`expectedAnswerPattern is not a valid regex: ${message}`);
    }
  }

  return {
    questionKey: question.questionKey,
    suiteKey: question.suiteKey,
    passed: failures.length === 0,
    failures,
    actualSkillPackKey,
    actualTemplateKey,
    actualCitationCount,
    actualRetrievalMode,
    answerText: result.answer.answer,
    durationMs: result.durationMs,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────

/**
 * Run a single question against the engine and score the result.
 * Swallows engine errors into a scored failure so the rest of the
 * suite proceeds — operator-friendly. The error surfaces on
 * `GoldenQuestionScore.error`.
 */
export async function evaluateGoldenQuestion(
  question: GoldenQuestion,
  runner: GraphAgentRunner,
  options: LiveEvaluationOptions,
): Promise<GoldenQuestionScore> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  try {
    const answer = await runner({
      agentKey: "graph_agent_lite",
      userId: options.userId,
      workspaceId: options.workspaceId,
      query: question.question,
      retrievalPreference: "auto",
      maxSteps: 8,
    });
    return scoreQuestion(question, {
      answer,
      durationMs: now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return scoreQuestion(question, {
      answer: null,
      engineError: message,
      durationMs: now() - startedAt,
    });
  }
}

/**
 * Run every question in every suite, in declaration order. Returns a
 * structured summary suitable for both the markdown report and a
 * machine-readable JSON dump.
 */
export async function runLiveEvaluation(
  suites: ReadonlyArray<GoldenQuestionSuite>,
  runner: GraphAgentRunner,
  options: LiveEvaluationOptions,
): Promise<LiveEvaluationSummary> {
  const suiteResults: GoldenQuestionSuiteResult[] = [];
  let totalQuestions = 0;
  let totalPassed = 0;
  let totalErrored = 0;
  let passedSuites = 0;

  for (const suite of suites) {
    const results: GoldenQuestionScore[] = [];
    for (const q of suite.questions) {
      const scored = await evaluateGoldenQuestion(q, runner, options);
      results.push(scored);
      totalQuestions++;
      if (scored.passed) totalPassed++;
      if (scored.error !== undefined) totalErrored++;
    }
    const suitePassed = results.every((r) => r.passed);
    if (suitePassed) passedSuites++;
    suiteResults.push({
      suiteKey: suite.suiteKey,
      name: suite.name,
      passed: suitePassed,
      results,
    });
  }

  return {
    overallPassed: suiteResults.length > 0 && suiteResults.every((s) => s.passed),
    suitesTotal: suiteResults.length,
    suitesPassed: passedSuites,
    questionsTotal: totalQuestions,
    questionsPassed: totalPassed,
    questionsErrored: totalErrored,
    suites: suiteResults,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Reporting — pure
// ─────────────────────────────────────────────────────────────────────

export function formatLiveReport(
  date: string,
  summary: LiveEvaluationSummary,
): string {
  const lines: string[] = [];
  lines.push(`# Golden Question Live Evaluation Report — ${date}`);
  lines.push("");
  lines.push("**Generator:** `scripts/agent-studio/run-golden-questions.ts --mode=live`");
  lines.push(
    "**Runbook:** `docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md`",
  );
  lines.push(`**Overall:** ${summary.overallPassed ? "PASS" : "FAIL"}`);
  lines.push(
    `**Suites:** ${summary.suitesPassed}/${summary.suitesTotal} pass`,
  );
  lines.push(
    `**Questions:** ${summary.questionsPassed}/${summary.questionsTotal} pass (${summary.questionsErrored} errored)`,
  );
  lines.push("");

  for (const suite of summary.suites) {
    lines.push(`## ${suite.name} (\`${suite.suiteKey}\`) — ${suite.passed ? "PASS" : "FAIL"}`);
    lines.push("");
    lines.push("| Question | Status | Skill pack | Template | Citations | Duration (ms) | Failures |");
    lines.push("| --- | --- | --- | --- | ---: | ---: | --- |");
    for (const r of suite.results) {
      const status = r.passed ? "PASS" : "FAIL";
      const failures =
        r.failures.length === 0
          ? "—"
          : r.failures.map((f) => `\`${f}\``).join("; ");
      lines.push(
        `| ${r.questionKey} | ${status} | ${codeOrDash(r.actualSkillPackKey)} | ${codeOrDash(r.actualTemplateKey)} | ${r.actualCitationCount} | ${r.durationMs} | ${failures} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Evidence next steps");
  lines.push("");
  if (summary.overallPassed) {
    lines.push(
      "Per runbook §4.5: commit this report under `docs/evidence/graph-agent-lite/<date>-golden-questions/`, append a Validation Evidence link to the user-feedback ADR, and flip the relevant status row to **Closed (live evaluation passed YYYY-MM-DD)**.",
    );
  } else {
    lines.push(
      "Per runbook §4.5: do NOT modify `expectedPaths` / `minimumCitationCount` to make a failing run pass. Investigate the failure rows above and address the underlying agent behavior in a fix PR before re-running.",
    );
  }
  lines.push("");
  return lines.join("\n");
}

function codeOrDash(s: string | undefined): string {
  return s ? "`" + s + "`" : "—";
}

/**
 * JSON shape for CI consumption (artifact upload + downstream
 * automation). Stable: do not break the shape without notice.
 */
export function formatLiveReportJson(
  date: string,
  summary: LiveEvaluationSummary,
): string {
  return JSON.stringify({ date, ...summary }, null, 2);
}
