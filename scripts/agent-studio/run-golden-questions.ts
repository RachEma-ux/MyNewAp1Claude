/**
 * Native Graph Workspace V1.0 — Golden Question evaluation CLI.
 *
 * Two modes:
 *
 *   --mode=dry-run (default)
 *     Reads the seeded suites from ASDB and emits a structured
 *     inventory markdown report. Exit 0 unless ASDB unreachable or
 *     seed missing.
 *
 *   --mode=live
 *     Composes the Graph Agent Lite engine with real adapter wiring
 *     (GraphRepository + GraphRetrievalRouter + ModelAccessAdapter +
 *     McpDispatchAdapter), runs each seeded question, scores against
 *     `expectedPaths` + `minimumCitationCount` + optional regex
 *     pattern, emits a markdown PASS/FAIL report PLUS a machine-
 *     readable JSON sidecar. Exit non-zero if any question fails.
 *
 *     Live mode requires the documented env vars (see
 *     `server/agent-studio/services/graph-skill/golden-questions/
 *     live-engine-factory.ts`):
 *       GOLDEN_Q_LIVE=true
 *       GOLDEN_Q_LIVE_PROVIDER_CONNECTION_ID
 *       GOLDEN_Q_LIVE_MODEL_REF
 *       GOLDEN_Q_LIVE_WORKSPACE_ID
 *       GOLDEN_Q_LIVE_ACTOR_ID
 *     Missing any of these in --mode=live → exit 2 (config error).
 *
 *     Plan v3 D1: model-access `execute()` resolves credentials via
 *     `withProviderCredential` internally — this script never reads
 *     raw provider-key env vars directly.
 *
 * Backwards-compatible flags:
 *   --require-live   Equivalent to --mode=live; preserved so the
 *                    existing workflow_dispatch input still works.
 *
 * Runbook:
 *   docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { desc, eq } from "drizzle-orm";

import { getAsDb } from "../../server/agent-studio/db/connection.js";
import {
  agsGoldenQuestionSuites,
  agsGoldenQuestions,
} from "../../drizzle/tables/agent-studio-graph-quality.js";
import {
  runLiveEvaluation,
  formatLiveReport,
  formatLiveReportJson,
  type GoldenQuestion,
  type GoldenQuestionSuite,
} from "../../server/agent-studio/services/graph-skill/golden-questions/live-evaluator.js";
import {
  buildLiveEngine,
  parseLiveEnv,
} from "../../server/agent-studio/services/graph-skill/golden-questions/live-engine-factory.js";

type Mode = "dry-run" | "live";

interface CliArgs {
  suite: string;
  output: string | null;
  jsonOutput: string | null;
  mode: Mode;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    suite: "all",
    output: null,
    jsonOutput: null,
    mode: "dry-run",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--suite") args.suite = argv[++i] ?? "all";
    else if (a === "--output") args.output = argv[++i] ?? null;
    else if (a === "--json-output") args.jsonOutput = argv[++i] ?? null;
    else if (a === "--require-live") args.mode = "live";
    else if (a === "--mode") {
      const v = argv[++i];
      if (v === "live" || v === "dry-run") args.mode = v;
      else throw new Error(`--mode must be 'dry-run' or 'live', got '${v}'`);
    }
  }
  return args;
}

interface SuiteRow {
  id: number;
  suiteKey: string;
  name: string;
  description: string | null;
}
interface QuestionRow {
  id: number;
  suiteId: number;
  questionKey: string;
  question: string;
  expectedAnswerPattern: string | null;
  expectedPaths: Record<string, unknown> | null;
  minimumCitationCount: number;
}

function formatDryRunReport(
  date: string,
  suites: SuiteRow[],
  questionsBySuite: Map<number, QuestionRow[]>,
): string {
  const lines: string[] = [];
  lines.push(`# Golden Question Evaluation Report (dry-run inventory) — ${date}`);
  lines.push("");
  lines.push("**Generator:** `scripts/agent-studio/run-golden-questions.ts --mode=dry-run`");
  lines.push(
    "**Runbook:** `docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md`",
  );
  lines.push("");
  lines.push("Inventory only — no engine invocation. To run live, re-invoke with `--mode=live` and the documented env vars.");
  lines.push("");
  for (const suite of suites) {
    const qs = questionsBySuite.get(suite.id) ?? [];
    lines.push(`## ${suite.name} (\`${suite.suiteKey}\`)`);
    if (suite.description) lines.push(suite.description);
    lines.push("");
    lines.push("| Question | Expected skill pack | Expected template | Min citations |");
    lines.push("| --- | --- | --- | ---: |");
    for (const q of qs) {
      const paths = q.expectedPaths ?? {};
      const skillPack =
        typeof (paths as { skillPackKey?: unknown }).skillPackKey === "string"
          ? `\`${(paths as { skillPackKey: string }).skillPackKey}\``
          : "—";
      const template =
        typeof (paths as { templateKey?: unknown }).templateKey === "string"
          ? `\`${(paths as { templateKey: string }).templateKey}\``
          : "—";
      lines.push(
        `| ${q.question} | ${skillPack} | ${template} | ${q.minimumCitationCount} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function rowsToSuites(
  suites: SuiteRow[],
  byId: Map<number, QuestionRow[]>,
): GoldenQuestionSuite[] {
  return suites.map((s) => ({
    suiteKey: s.suiteKey,
    name: s.name,
    description: s.description,
    questions: (byId.get(s.id) ?? []).map((q): GoldenQuestion => ({
      suiteKey: s.suiteKey,
      questionKey: q.questionKey,
      question: q.question,
      expectedAnswerPattern: q.expectedAnswerPattern,
      expectedPaths: q.expectedPaths as { templateKey?: string; skillPackKey?: string } | null,
      minimumCitationCount: q.minimumCitationCount,
    })),
  }));
}

async function main() {
  const args = parseArgs(process.argv);
  const date = new Date().toISOString().slice(0, 10);

  const db = getAsDb();
  if (!db) {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          "ASDB not configured. Set DATABASE_URL_ASDB and run the seed script before this one.",
      }),
    );
    process.exit(1);
  }

  const suiteQuery = db
    .select({
      id: agsGoldenQuestionSuites.id,
      suiteKey: agsGoldenQuestionSuites.suiteKey,
      name: agsGoldenQuestionSuites.name,
      description: agsGoldenQuestionSuites.description,
    })
    .from(agsGoldenQuestionSuites);

  const allSuites: SuiteRow[] =
    args.suite === "all"
      ? await suiteQuery.orderBy(desc(agsGoldenQuestionSuites.id))
      : await suiteQuery.where(eq(agsGoldenQuestionSuites.suiteKey, args.suite));

  if (allSuites.length === 0) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `No suites in ASDB. Run scripts/agent-studio/seed-golden-questions.ts first. (filter=${args.suite})`,
      }),
    );
    process.exit(1);
  }

  const questionsBySuite = new Map<number, QuestionRow[]>();
  for (const s of allSuites) {
    const qs = (await db
      .select({
        id: agsGoldenQuestions.id,
        suiteId: agsGoldenQuestions.suiteId,
        questionKey: agsGoldenQuestions.questionKey,
        question: agsGoldenQuestions.question,
        expectedAnswerPattern: agsGoldenQuestions.expectedAnswerPattern,
        expectedPaths: agsGoldenQuestions.expectedPaths,
        minimumCitationCount: agsGoldenQuestions.minimumCitationCount,
      })
      .from(agsGoldenQuestions)
      .where(eq(agsGoldenQuestions.suiteId, s.id))
      .orderBy(agsGoldenQuestions.id)) as QuestionRow[];
    questionsBySuite.set(s.id, qs);
  }

  if (args.mode === "dry-run") {
    const markdown = formatDryRunReport(date, allSuites, questionsBySuite);
    emit(args, markdown, null, {
      ok: true,
      mode: "dry-run",
      suiteCount: allSuites.length,
      questionCount: Array.from(questionsBySuite.values()).reduce((a, b) => a + b.length, 0),
    });
    process.exit(0);
  }

  // ── live mode ────────────────────────────────────────────────────
  const env = parseLiveEnv();
  if (!env.ok) {
    console.error(
      JSON.stringify({
        ok: false,
        mode: "live",
        error: `live-mode config error: ${env.reason}`,
      }),
    );
    process.exit(2);
  }

  const engine = buildLiveEngine(env.config);
  const suites = rowsToSuites(allSuites, questionsBySuite);

  const summary = await runLiveEvaluation(suites, (input) => engine.run(input), {
    workspaceId: env.config.workspaceId,
    userId: env.config.actorId,
  });

  const markdown = formatLiveReport(date, summary);
  const json = formatLiveReportJson(date, summary);
  emit(args, markdown, json, {
    ok: summary.overallPassed,
    mode: "live",
    summary: {
      overallPassed: summary.overallPassed,
      suitesPassed: summary.suitesPassed,
      suitesTotal: summary.suitesTotal,
      questionsPassed: summary.questionsPassed,
      questionsTotal: summary.questionsTotal,
      questionsErrored: summary.questionsErrored,
    },
  });
  process.exit(summary.overallPassed ? 0 : 1);
}

function emit(
  args: CliArgs,
  markdown: string,
  json: string | null,
  consoleLog: object,
): void {
  if (args.output) {
    const path = isAbsolute(args.output) ? args.output : resolve(process.cwd(), args.output);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, markdown, "utf8");
    if (json !== null && args.jsonOutput) {
      const jsonPath = isAbsolute(args.jsonOutput)
        ? args.jsonOutput
        : resolve(process.cwd(), args.jsonOutput);
      mkdirSync(dirname(jsonPath), { recursive: true });
      writeFileSync(jsonPath, json, "utf8");
    } else if (json !== null) {
      // Sidecar JSON next to the markdown when --json-output is omitted.
      const sidecarPath = path.replace(/\.md$/i, "") + ".json";
      writeFileSync(sidecarPath, json, "utf8");
    }
    console.log(JSON.stringify({ ...consoleLog, output: path }));
  } else {
    process.stdout.write(markdown + "\n");
    if (json !== null) process.stdout.write("\n" + json + "\n");
  }
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }),
  );
  process.exit(1);
});
