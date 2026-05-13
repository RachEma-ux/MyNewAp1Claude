/**
 * Native Graph Workspace MVP 4 — Phase 22 / 23.
 *
 * Operator entry point: run the Golden Question evaluation suite
 * against the live Graph Agent Lite engine. Mirrors the shape
 * referenced by the evaluation runbook at
 *   docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md
 * (§4.3).
 *
 * What this CLI does today (pre-operator-wiring):
 *   - Reads the seeded suites from ASDB.
 *   - Writes a structured markdown report at --output with the
 *     question inventory + expected paths + minimum citation counts.
 *   - Returns exit 0 with a `liveWired: false` status — the day-1
 *     shape; runbook §4.3 describes the live-wiring path.
 *   - Returns exit 1 only on infrastructure failure (ASDB
 *     unreachable, seed missing, IO failure).
 *
 * Live evaluation wiring (operator territory per runbook §4.4) is
 * intentionally NOT performed here yet — composing
 * GraphRepository + GraphRetrievalRouter + ModelAccessAdapter +
 * McpDispatchAdapter + RuntimeTraceAdapter for a live single-shot
 * eval requires per-deployment configuration and a workspace
 * smoke vault that this CLI cannot make assumptions about. When
 * that wiring lands, provider credentials MUST flow through
 * `withProviderCredential` per Plan v3 Decision D1 — never via
 * `process.env` in script bodies.
 *
 * Usage:
 *   DATABASE_URL_ASDB=postgres://... pnpm tsx scripts/agent-studio/run-golden-questions.ts \
 *     --suite all --output docs/evidence/graph-agent-lite/2026-MM-DD/report.md
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { desc, eq } from "drizzle-orm";

import { getAsDb } from "../../server/agent-studio/db/connection.js";
import {
  agsGoldenQuestionSuites,
  agsGoldenQuestions,
} from "../../drizzle/tables/agent-studio-graph-quality.js";

interface CliArgs {
  suite: string;
  output: string | null;
  requireLive: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { suite: "all", output: null, requireLive: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--suite") args.suite = argv[++i] ?? "all";
    else if (a === "--output") args.output = argv[++i] ?? null;
    else if (a === "--require-live") args.requireLive = true;
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

function formatReport(
  date: string,
  liveWired: boolean,
  reason: string,
  suites: SuiteRow[],
  questionsBySuite: Map<number, QuestionRow[]>,
): string {
  const lines: string[] = [];
  lines.push(`# Golden Question Evaluation Report — ${date}`);
  lines.push("");
  lines.push("**Generator:** `scripts/agent-studio/run-golden-questions.ts`");
  lines.push(
    "**Runbook:** `docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md`",
  );
  lines.push(`**Live-wired:** ${liveWired ? "yes" : "no"}`);
  if (!liveWired) {
    lines.push(`**Reason:** ${reason}`);
  }
  lines.push("");
  lines.push("## Inventory");
  lines.push("");
  for (const suite of suites) {
    const qs = questionsBySuite.get(suite.id) ?? [];
    lines.push(`### ${suite.name} (\`${suite.suiteKey}\`)`);
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
  lines.push("## Next steps (operator)");
  lines.push("");
  if (liveWired) {
    lines.push(
      "Live results are present above. Per the runbook §4.4 / §4.5, archive this report under `docs/evidence/graph-agent-lite/<date>/` and update the status doc.",
    );
  } else {
    lines.push(
      "Live evaluation is not wired in this CLI today. The runbook §4.4 describes the adapter composition needed (GraphRepository + GraphRetrievalRouter + ModelAccessAdapter + McpDispatchAdapter + RuntimeTraceAdapter). To proceed live, supply those adapters in a follow-up implementation PR and re-run.",
    );
  }
  lines.push("");
  return lines.join("\n");
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

  // Day-1 shape: adapter composition for GraphAgentEngine
  // (repository + retrievalRouter + modelAccess + mcpDispatcher +
  // runtimeTrace + decisionTrace) is operator-implementation
  // territory per runbook §4.4. Provider credentials for the
  // eventual modelAccess adapter MUST flow through
  // `withProviderCredential` (Plan v3 D1) — never via direct
  // `process.env` reads in script bodies. The inventory-only
  // report below is the day-1 closure-evidence shape.
  const liveWired = false;
  const reason =
    "Adapter composition not yet implemented in this CLI (runbook §4.4). When wired, model-access credentials must flow through withProviderCredential per Plan v3 D1.";

  const markdown = formatReport(date, liveWired, reason, allSuites, questionsBySuite);

  // Exit-code contract:
  //   - Default (no --require-live): exit 0 even when liveWired=false.
  //     Inventory report is valuable closure-evidence pre-live-wiring.
  //   - --require-live: exit 1 when liveWired=false. This is the flag
  //     the operator-implementation PR for adapter composition will
  //     use to gate the workflow on real live wiring being present.
  //   - When live wiring DOES land, this function additionally exits
  //     non-zero if any suite has a failed question (per runbook §4.4
  //     pass/fail criteria).
  const requireLiveFailed = args.requireLive && !liveWired;
  const exitCode = requireLiveFailed ? 1 : 0;

  if (args.output) {
    const path = isAbsolute(args.output) ? args.output : resolve(process.cwd(), args.output);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, markdown, "utf8");
    console.log(
      JSON.stringify({
        ok: !requireLiveFailed,
        liveWired,
        reason,
        requireLive: args.requireLive,
        suiteCount: allSuites.length,
        questionCount: Array.from(questionsBySuite.values()).reduce((a, b) => a + b.length, 0),
        output: path,
        exitCode,
      }),
    );
  } else {
    process.stdout.write(markdown + "\n");
  }

  if (requireLiveFailed) {
    console.error(
      "[golden-questions] --require-live set but live wiring is not present. " +
        "See runbook §4.4 for the adapter-composition implementation PR.",
    );
  }
  process.exit(exitCode);
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
