/**
 * Golden Questions — triggerLiveEvaluation composer (T-D.5.γ).
 *
 * Slice 44 of the no-deferral continuation-4 catalogue (2026-05-19).
 * Closes `golden-questions-router.ts:15-28` "Deferred — run lifecycle
 * persistence + caller" by wiring an operator-callable mutation that
 * composes the three pieces that have already shipped:
 *
 *   1. `buildLiveEngine`         (live-engine-factory.ts) — engine + adapters
 *   2. `runLiveEvaluation`       (live-evaluator.ts)       — pure scorer
 *   3. `createGoldenQuestionsWriteStore`
 *      (golden-questions-write-store.ts)                  — persistence
 *
 * The composer is split into its own module (rather than inlined in
 * the router) so:
 *   - The router file stays narrow + only contains tRPC procedures.
 *   - Unit tests can drive the composer with fake adapters (the
 *     `deps` parameter lets tests inject every boundary).
 *   - Future callers (cron, CLI script) can call the same composer
 *     without going through the tRPC layer.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports here. `buildLiveEngine` is the
 *     ONE module that touches those boundaries; this composer
 *     consumes it as a callback.
 *   - No `process.env.*_API_KEY` reads.
 *   - Read-only — emits proposals through the runner's optional
 *     `emitGoldenQuestionFailureProposal` (NOT injected by default).
 *     Graph mutations stay behind the change-proposal flow.
 */

import {
  DEFAULT_GOLDEN_QUESTION_SUITES,
  type GoldenQuestionSuiteSeed,
} from "../seed-golden-questions.js";
import {
  runLiveEvaluation,
  type GoldenQuestionSuite,
  type GraphAgentRunner,
  type LiveEvaluationOptions,
  type LiveEvaluationSummary,
} from "./live-evaluator.js";
import { buildLiveEngine, type LiveEngineConfig } from "./live-engine-factory.js";
import {
  createGoldenQuestionsWriteStore,
  type GoldenQuestionsWriteStore,
  type RecordSuiteRunOutcome,
} from "./golden-questions-write-store.js";

export interface TriggerLiveEvaluationInput {
  /** Provider connection for the engine's model-access call. */
  readonly providerConnectionId: number;
  /** Model ref Model Access sends upstream. */
  readonly modelRef: string;
  /** Workspace context. */
  readonly workspaceId: number;
  /** Actor / user invoking the run (for audit). */
  readonly actorId: number;
  /**
   * Optional suite filter. When set, only that suite from
   * `DEFAULT_GOLDEN_QUESTION_SUITES` is evaluated. When absent, every
   * seeded suite runs.
   */
  readonly suiteKey?: string;
  /** Per-question wall-clock budget (ms). */
  readonly perQuestionTimeoutMs?: number;
}

export interface TriggerLiveEvaluationDeps {
  /**
   * Test seam — supply a synthesized runner. Production builds via
   * `buildLiveEngine(config).run.bind(engine)`.
   */
  readonly runnerFactory?: (config: LiveEngineConfig) => GraphAgentRunner;
  /**
   * Test seam — supply a fake write store. Production uses
   * `createGoldenQuestionsWriteStore()`.
   */
  readonly writeStore?: GoldenQuestionsWriteStore;
  /**
   * Test seam — supply the suite catalog. Production uses the
   * in-code `DEFAULT_GOLDEN_QUESTION_SUITES` seed (the canonical
   * source of truth).
   */
  readonly suiteCatalog?: ReadonlyArray<GoldenQuestionSuiteSeed>;
  /**
   * Test seam — override the failure-state emitter. The pure
   * evaluator defaults to the canonical `recordFailureStateEvent`
   * bridge.
   */
  readonly recordFailureStateEvent?: LiveEvaluationOptions["recordFailureStateEvent"];
}

export interface TriggerLiveEvaluationResult {
  readonly summary: LiveEvaluationSummary;
  readonly persistence: ReadonlyArray<RecordSuiteRunOutcome>;
  readonly suitesRun: number;
}

export class GoldenQuestionsSuiteNotFoundError extends Error {
  constructor(public readonly suiteKey: string) {
    super(
      `[trigger-live-evaluation] suiteKey="${suiteKey}" is not in DEFAULT_GOLDEN_QUESTION_SUITES`,
    );
    this.name = "GoldenQuestionsSuiteNotFoundError";
  }
}

/**
 * Convert the in-code seed shape (`GoldenQuestionSuiteSeed`) into the
 * live-evaluator's input shape (`GoldenQuestionSuite`). The conversion
 * is direct — each seed question is enriched with its parent suiteKey
 * to form a `GoldenQuestion`. Splitting into a helper lets tests
 * drive the seed → suite step without re-importing the live evaluator.
 */
export function suiteSeedsToSuites(
  seeds: ReadonlyArray<GoldenQuestionSuiteSeed>,
): GoldenQuestionSuite[] {
  return seeds.map((seed) => ({
    suiteKey: seed.suiteKey,
    name: seed.name,
    description: seed.description ?? null,
    questions: seed.questions.map((q) => ({
      suiteKey: seed.suiteKey,
      questionKey: q.questionKey,
      question: q.question,
      expectedAnswerPattern: q.expectedAnswerPattern,
      expectedPaths: q.expectedPaths,
      minimumCitationCount: q.minimumCitationCount,
    })),
  }));
}

/**
 * Compose the live-evaluation run: load suites → build engine →
 * run evaluator → persist each suite result. Returns the full
 * summary + the persistence outcome per suite.
 *
 * Throws `GoldenQuestionsSuiteNotFoundError` when the caller supplies
 * a `suiteKey` that isn't present in the in-code seed (typed so the
 * tRPC layer can map it to a 404).
 */
export async function triggerLiveEvaluation(
  input: TriggerLiveEvaluationInput,
  deps: TriggerLiveEvaluationDeps = {},
): Promise<TriggerLiveEvaluationResult> {
  const catalog = deps.suiteCatalog ?? DEFAULT_GOLDEN_QUESTION_SUITES;
  const filtered: ReadonlyArray<GoldenQuestionSuiteSeed> =
    input.suiteKey != null
      ? catalog.filter((s) => s.suiteKey === input.suiteKey)
      : catalog;
  if (input.suiteKey != null && filtered.length === 0) {
    throw new GoldenQuestionsSuiteNotFoundError(input.suiteKey);
  }
  const suites = suiteSeedsToSuites(filtered);

  const config: LiveEngineConfig = {
    providerConnectionId: input.providerConnectionId,
    modelRef: input.modelRef,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
  };
  const runner: GraphAgentRunner =
    deps.runnerFactory != null
      ? deps.runnerFactory(config)
      : (() => {
          const engine = buildLiveEngine(config);
          return engine.run.bind(engine);
        })();

  const evalOptions: LiveEvaluationOptions = {
    workspaceId: input.workspaceId,
    userId: input.actorId,
    ...(input.perQuestionTimeoutMs != null
      ? { perQuestionTimeoutMs: input.perQuestionTimeoutMs }
      : {}),
    ...(deps.recordFailureStateEvent !== undefined
      ? { recordFailureStateEvent: deps.recordFailureStateEvent }
      : {}),
  };
  const summary = await runLiveEvaluation(suites, runner, evalOptions);

  // Persist each suite's results. Per the write-store contract, we
  // call recordSuiteRun once per suite — partial failures leave a
  // persisted run row with some results, which is operator-debuggable.
  const store = deps.writeStore ?? createGoldenQuestionsWriteStore();
  const persistence: RecordSuiteRunOutcome[] = [];
  for (const suiteResult of summary.suites) {
    try {
      const outcome = await store.recordSuiteRun(suiteResult);
      persistence.push(outcome);
    } catch (err) {
      // The write-store throws on ASDB-null. We surface the error in
      // the persistence array as a synthesized not-seeded outcome so
      // the caller doesn't lose visibility into which suite failed
      // to persist — the in-memory summary still flows back.
      console.warn(
        `[trigger-live-evaluation] persistence failed for suiteKey="${suiteResult.suiteKey}": ${err instanceof Error ? err.message : String(err)}`,
      );
      persistence.push({
        status: "suite_not_seeded",
        suiteKey: suiteResult.suiteKey,
      });
    }
  }

  return {
    summary,
    persistence,
    suitesRun: suites.length,
  };
}
