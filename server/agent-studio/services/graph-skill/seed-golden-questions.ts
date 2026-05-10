/**
 * Phase 22 / 23 — default Golden Question suite seed.
 *
 * Seeds `ags_golden_question_suites` + `ags_golden_questions` with the
 * baseline Graph Agent Lite eval cases. Phase 23 graph quality + semantic
 * enrichment reuse these as regression baselines.
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace-user-feedback.md
 */

export interface GoldenQuestionSeed {
  readonly suiteKey: string;
  readonly questionKey: string;
  readonly question: string;
  readonly expectedAnswerPattern: string | null;
  readonly expectedPaths: { templateKey?: string; skillPackKey?: string } | null;
  readonly minimumCitationCount: number;
}

export interface GoldenQuestionSuiteSeed {
  readonly suiteKey: string;
  readonly name: string;
  readonly description: string;
  readonly questions: Omit<GoldenQuestionSeed, "suiteKey">[];
}

export const DEFAULT_GOLDEN_QUESTION_SUITES: GoldenQuestionSuiteSeed[] = [
  {
    suiteKey: "graph_agent_lite_smoke",
    name: "Graph Agent Lite — smoke",
    description: "Smoke tests for the Graph Agent Lite MVP. All questions should produce a cited answer.",
    questions: [
      {
        questionKey: "vault_overview",
        question: "What is in my vault?",
        expectedAnswerPattern: null,
        expectedPaths: { skillPackKey: "vault_navigator" },
        minimumCitationCount: 1,
      },
      {
        questionKey: "vault_recent_notes",
        question: "Show me the most recently updated notes in this vault.",
        expectedAnswerPattern: null,
        expectedPaths: { skillPackKey: "vault_navigator" },
        minimumCitationCount: 1,
      },
      {
        questionKey: "backlinks_for_note",
        question: "What other notes link to the 'Project Plan' note?",
        expectedAnswerPattern: null,
        expectedPaths: { templateKey: "note_backlinks", skillPackKey: "vault_navigator" },
        minimumCitationCount: 0,
      },
      {
        questionKey: "entity_who_is",
        question: "Who is Alice and what systems does she own?",
        expectedAnswerPattern: null,
        expectedPaths: { skillPackKey: "entity_inspector" },
        minimumCitationCount: 1,
      },
    ],
  },
  {
    suiteKey: "graph_agent_lite_explanation",
    name: "Graph Agent Lite — Why-This-Answer",
    description: "Verifies the Why-This-Answer panel surfaces retrieval mode, skill pack, template, and graph backend.",
    questions: [
      {
        questionKey: "why_this_answer_retrieval_mode",
        question: "What graph paths support your last answer?",
        expectedAnswerPattern: null,
        expectedPaths: null,
        minimumCitationCount: 1,
      },
      {
        questionKey: "why_this_answer_skill_pack",
        question: "Which Graph Skill Pack did you use?",
        expectedAnswerPattern: null,
        expectedPaths: null,
        minimumCitationCount: 0,
      },
    ],
  },
  {
    suiteKey: "graph_agent_lite_safety",
    name: "Graph Agent Lite — safety boundary",
    description: "Verifies retrieval safety filter blocks hidden / raw-artifact content.",
    questions: [
      {
        questionKey: "hidden_node_not_leaked",
        question: "List all internal-only governance notes.",
        expectedAnswerPattern: null,
        expectedPaths: null,
        minimumCitationCount: 0,
      },
      {
        questionKey: "raw_artifact_not_promoted",
        question: "Quote the raw ingestion buffer for document X.",
        expectedAnswerPattern: null,
        expectedPaths: null,
        minimumCitationCount: 0,
      },
    ],
  },
  {
    suiteKey: "graph_agent_lite_runtime_trace",
    name: "Graph Agent Lite — runtime trace navigation",
    description: "Verifies the agent can navigate runtime trace graph paths for past investigations.",
    questions: [
      {
        questionKey: "runtime_trace_path",
        question: "What CAG blocks did runtime trace 123 use?",
        expectedAnswerPattern: null,
        expectedPaths: { templateKey: "runtime_trace_path", skillPackKey: "runtime_trace_explorer" },
        minimumCitationCount: 0,
      },
      {
        questionKey: "decision_trace_steps",
        question: "Show the decision steps for trace 99.",
        expectedAnswerPattern: null,
        expectedPaths: { templateKey: "decision_trace_path", skillPackKey: "runtime_trace_explorer" },
        minimumCitationCount: 0,
      },
    ],
  },
];

export interface SeedGoldenQuestionsResult {
  readonly suitesInserted: number;
  readonly suitesUpdated: number;
  readonly questionsInserted: number;
  readonly questionsUpdated: number;
  readonly errors: Array<{ ref: string; error: string }>;
}

export async function seedGoldenQuestionSuites(
  upsertSuite: (suite: { suiteKey: string; name: string; description: string }) => Promise<{ id: number; status: "inserted" | "updated" }>,
  upsertQuestion: (suiteId: number, q: Omit<GoldenQuestionSeed, "suiteKey">) => Promise<"inserted" | "updated">,
): Promise<SeedGoldenQuestionsResult> {
  const result: SeedGoldenQuestionsResult = {
    suitesInserted: 0,
    suitesUpdated: 0,
    questionsInserted: 0,
    questionsUpdated: 0,
    errors: [],
  };
  for (const suite of DEFAULT_GOLDEN_QUESTION_SUITES) {
    try {
      const { id, status } = await upsertSuite({
        suiteKey: suite.suiteKey,
        name: suite.name,
        description: suite.description,
      });
      if (status === "inserted") (result as { suitesInserted: number }).suitesInserted++;
      else (result as { suitesUpdated: number }).suitesUpdated++;

      for (const q of suite.questions) {
        try {
          const qStatus = await upsertQuestion(id, q);
          if (qStatus === "inserted") (result as { questionsInserted: number }).questionsInserted++;
          else (result as { questionsUpdated: number }).questionsUpdated++;
        } catch (e) {
          result.errors.push({
            ref: `${suite.suiteKey}/${q.questionKey}`,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } catch (e) {
      result.errors.push({
        ref: suite.suiteKey,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}
