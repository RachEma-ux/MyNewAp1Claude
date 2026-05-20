// GoldenQuestionsRecentRunsPanel — no-deferral continuation-13 slice 72.
//
// Closes the UI-consumer gap for the remaining 4 goldenQuestions.*
// read endpoints (listRecentRuns / getRunStats / listRunResults /
// getQuestionDetail). Mounted below GoldenQuestionsTriggerPanel on
// GoldenQuestionsPage so operators get the natural sequence
// "trigger → see what happened" without leaving the page.
//
// Master-detail with progressive disclosure:
//   1. Master: recent-runs list with optional suite filter
//   2. Detail (stats): badge row on selected run
//   3. Detail (results): per-question PASS/FAIL table with
//      truncated actualAnswer + failure reason
//   4. Detail (question): the result row expands inline to render
//      expectedPaths JSON via getQuestionDetail (lazy)

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "./ui";
import { formatRelative } from "./format-relative";

const RECENT_RUNS_LIMIT = 50;

// Trim long answers in the table view; the expand-row affordance
// surfaces the rest via getQuestionDetail.
function truncate(s: string | null, max: number): string {
  if (s == null) return "—";
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

export function GoldenQuestionsRecentRunsPanel() {
  const suitesQuery = trpc.agentStudio.goldenQuestions.listSuites.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const suites = suitesQuery.data?.suites ?? [];

  const [suiteFilter, setSuiteFilter] = useState<string>("");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(
    null,
  );

  const runsQuery = trpc.agentStudio.goldenQuestions.listRecentRuns.useQuery(
    suiteFilter !== ""
      ? { limit: RECENT_RUNS_LIMIT, suiteKey: suiteFilter }
      : { limit: RECENT_RUNS_LIMIT },
    { refetchOnWindowFocus: false },
  );

  const statsQuery = trpc.agentStudio.goldenQuestions.getRunStats.useQuery(
    selectedRunId !== null ? { runId: selectedRunId } : (undefined as never),
    { enabled: selectedRunId !== null, refetchOnWindowFocus: false },
  );

  const resultsQuery =
    trpc.agentStudio.goldenQuestions.listRunResults.useQuery(
      selectedRunId !== null
        ? { runId: selectedRunId }
        : (undefined as never),
      { enabled: selectedRunId !== null, refetchOnWindowFocus: false },
    );

  const questionDetailQuery =
    trpc.agentStudio.goldenQuestions.getQuestionDetail.useQuery(
      expandedQuestionId !== null
        ? { questionId: expandedQuestionId }
        : (undefined as never),
      { enabled: expandedQuestionId !== null, refetchOnWindowFocus: false },
    );

  const runs = runsQuery.data?.runs ?? [];

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <SectionLabel>Recent evaluation runs</SectionLabel>

        <div className="flex items-center gap-3">
          <label
            htmlFor="gq-recent-suite-filter"
            className="text-sm text-muted-foreground"
          >
            Filter by suite:
          </label>
          <select
            id="gq-recent-suite-filter"
            data-testid="gq-recent-suite-filter"
            className="rounded border bg-background p-1 text-sm"
            value={suiteFilter}
            onChange={(e) => {
              setSuiteFilter(e.target.value);
              setSelectedRunId(null);
              setExpandedQuestionId(null);
            }}
            disabled={suitesQuery.isLoading}
          >
            <option value="">(all suites)</option>
            {suites.map((s) => (
              <option key={s.suiteKey} value={s.suiteKey}>
                {s.name} ({s.suiteKey})
              </option>
            ))}
          </select>
        </div>

        {runsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading runs…</p>
        ) : runsQuery.error ? (
          <p className="text-sm text-destructive">
            Failed to load runs: {runsQuery.error.message}
          </p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No persisted runs yet. Trigger a run from the panel above —
            persistence writes appear here on next refetch.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="gq-recent-runs-list">
            {runs.map((r) => {
              const isSelected = r.id === selectedRunId;
              return (
                <li
                  key={r.id}
                  data-testid="gq-recent-runs-row"
                  className={
                    "cursor-pointer rounded border p-2 text-sm hover:bg-muted/40 " +
                    (isSelected ? "bg-muted/60 ring-1 ring-primary" : "")
                  }
                  onClick={() => {
                    setSelectedRunId(r.id);
                    setExpandedQuestionId(null);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      run #{r.id} — {r.suiteKey}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(r.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">
                      status: {r.status}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓ {r.passedCount}
                    </span>
                    <span className="text-destructive">
                      ✗ {r.failedCount}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {selectedRunId !== null && (
          <div
            className="space-y-3 rounded border bg-muted/20 p-3"
            data-testid="gq-recent-runs-detail"
          >
            <SectionLabel>Run #{selectedRunId} detail</SectionLabel>

            {statsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading stats…</p>
            ) : statsQuery.data?.status === "not_found" ? (
              <p className="text-xs text-destructive">
                Run #{selectedRunId} not found (probably purged).
              </p>
            ) : statsQuery.data?.status === "ok" && statsQuery.data.stats ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-background px-2 py-1">
                  total: {statsQuery.data.stats.totalCount}
                </span>
                <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  passed: {statsQuery.data.stats.passedCount}
                </span>
                <span className="rounded bg-destructive/10 px-2 py-1 text-destructive">
                  failed: {statsQuery.data.stats.failedCount}
                </span>
                <span className="rounded bg-background px-2 py-1">
                  status: {statsQuery.data.stats.status}
                </span>
              </div>
            ) : null}

            {resultsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">
                Loading results…
              </p>
            ) : resultsQuery.data?.status === "not_found" ? (
              <p className="text-xs text-destructive">
                Results unavailable for run #{selectedRunId}.
              </p>
            ) : resultsQuery.data?.status === "ok" &&
              resultsQuery.data.results ? (
              <ul
                className="space-y-1"
                data-testid="gq-recent-runs-results-list"
              >
                {resultsQuery.data.results.map((res) => {
                  const isExpanded = res.questionId === expandedQuestionId;
                  return (
                    <li
                      key={res.id}
                      data-testid="gq-recent-runs-result-row"
                      className="rounded border bg-background p-2 text-xs"
                    >
                      <div
                        className="flex cursor-pointer items-center gap-2"
                        data-testid="gq-recent-runs-result-row-toggle"
                        onClick={() =>
                          setExpandedQuestionId(
                            isExpanded ? null : res.questionId,
                          )
                        }
                      >
                        <span
                          className={
                            "rounded px-1.5 py-0.5 font-medium " +
                            (res.passed
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-destructive/10 text-destructive")
                          }
                        >
                          {res.passed ? "PASS" : "FAIL"}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {res.questionKey}
                        </span>
                        <span className="flex-1 truncate">
                          {res.question}
                        </span>
                        <span className="text-muted-foreground">
                          {isExpanded ? "▼" : "▶"}
                        </span>
                      </div>
                      {!res.passed && res.failureReason ? (
                        <p className="mt-1 text-destructive">
                          reason: {res.failureReason}
                        </p>
                      ) : null}
                      <p className="mt-1 text-muted-foreground">
                        answer: {truncate(res.actualAnswer, 200)}
                      </p>
                      {isExpanded ? (
                        <div
                          className="mt-2 rounded border bg-muted/30 p-2"
                          data-testid="gq-recent-runs-question-detail"
                        >
                          {questionDetailQuery.isLoading ? (
                            <p className="text-muted-foreground">
                              Loading question detail…
                            </p>
                          ) : questionDetailQuery.data?.status ===
                            "not_found" ? (
                            <p className="text-destructive">
                              Question #{res.questionId} not found.
                            </p>
                          ) : questionDetailQuery.data?.status === "ok" &&
                            questionDetailQuery.data.question ? (
                            <div className="space-y-1">
                              <p>
                                <span className="text-muted-foreground">
                                  expectedAnswerPattern:
                                </span>{" "}
                                {questionDetailQuery.data.question
                                  .expectedAnswerPattern ?? "—"}
                              </p>
                              <p>
                                <span className="text-muted-foreground">
                                  minimumCitationCount:
                                </span>{" "}
                                {
                                  questionDetailQuery.data.question
                                    .minimumCitationCount
                                }
                              </p>
                              <details className="text-muted-foreground">
                                <summary className="cursor-pointer">
                                  expectedPaths JSON
                                </summary>
                                <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[10px] leading-tight">
                                  {JSON.stringify(
                                    questionDetailQuery.data.question
                                      .expectedPaths,
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
