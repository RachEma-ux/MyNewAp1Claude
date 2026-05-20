// @vitest-environment jsdom
// GoldenQuestionsRecentRunsPanel — no-deferral continuation-13 slice 72 tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { GoldenQuestionsRecentRunsPanel } from "./GoldenQuestionsRecentRunsPanel";

interface SuiteRow {
  readonly id: number;
  readonly suiteKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly active: boolean;
  readonly questionCount: number;
  readonly createdAt: Date;
}

interface RunListRow {
  readonly id: number;
  readonly suiteId: number;
  readonly suiteKey: string;
  readonly status: string;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
}

interface ResultListRow {
  readonly id: number;
  readonly runId: number;
  readonly questionId: number;
  readonly questionKey: string;
  readonly question: string;
  readonly actualAnswer: string | null;
  readonly citationCount: number | null;
  readonly passed: boolean;
  readonly failureReason: string | null;
  readonly durationMs: number | null;
  readonly createdAt: Date;
}

interface RunStats {
  readonly runId: number;
  readonly suiteId: number;
  readonly suiteKey: string;
  readonly status: string;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly totalCount: number;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
}

interface QuestionDetail {
  readonly id: number;
  readonly suiteId: number;
  readonly suiteKey: string;
  readonly questionKey: string;
  readonly question: string;
  readonly expectedAnswerPattern: string | null;
  readonly expectedPaths: Record<string, unknown> | null;
  readonly minimumCitationCount: number;
  readonly createdAt: Date;
}

const mocks = vi.hoisted(() => ({
  suitesQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as { suites: SuiteRow[] } | undefined,
  },
  runsQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as { runs: RunListRow[] } | undefined,
  },
  // listRecentRuns receives an args object — capture the most recent
  // call so the suite-filter test can assert the suiteKey is threaded.
  runsQueryCalls: [] as Array<unknown>,
  statsQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | { status: "ok"; stats: RunStats }
      | { status: "not_found" }
      | undefined,
  },
  resultsQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | { status: "ok"; runId: number; results: ResultListRow[] }
      | { status: "not_found"; runId: number }
      | undefined,
  },
  questionDetailQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | { status: "ok"; questionId: number; question: QuestionDetail }
      | { status: "not_found"; questionId: number }
      | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      goldenQuestions: {
        listSuites: { useQuery: () => mocks.suitesQuery },
        listRecentRuns: {
          useQuery: (input: unknown) => {
            mocks.runsQueryCalls.push(input);
            return mocks.runsQuery;
          },
        },
        getRunStats: { useQuery: () => mocks.statsQuery },
        listRunResults: { useQuery: () => mocks.resultsQuery },
        getQuestionDetail: { useQuery: () => mocks.questionDetailQuery },
      },
    },
  },
}));

beforeEach(() => {
  mocks.suitesQuery.isLoading = false;
  mocks.suitesQuery.error = null;
  mocks.suitesQuery.data = { suites: [] };
  mocks.runsQuery.isLoading = false;
  mocks.runsQuery.error = null;
  mocks.runsQuery.data = { runs: [] };
  mocks.runsQueryCalls.length = 0;
  mocks.statsQuery.isLoading = false;
  mocks.statsQuery.error = null;
  mocks.statsQuery.data = undefined;
  mocks.resultsQuery.isLoading = false;
  mocks.resultsQuery.error = null;
  mocks.resultsQuery.data = undefined;
  mocks.questionDetailQuery.isLoading = false;
  mocks.questionDetailQuery.error = null;
  mocks.questionDetailQuery.data = undefined;
});

describe("GoldenQuestionsRecentRunsPanel — master list", () => {
  it("renders empty state when no runs", () => {
    render(<GoldenQuestionsRecentRunsPanel />);
    expect(screen.getByText(/No persisted runs yet/i)).toBeTruthy();
  });

  it("renders loading state", () => {
    mocks.runsQuery.isLoading = true;
    mocks.runsQuery.data = undefined;
    render(<GoldenQuestionsRecentRunsPanel />);
    expect(screen.getByText(/Loading runs/i)).toBeTruthy();
  });

  it("renders one row per run with pass/fail counts", () => {
    mocks.runsQuery.data = {
      runs: [
        {
          id: 100,
          suiteId: 1,
          suiteKey: "smoke",
          status: "passed",
          passedCount: 5,
          failedCount: 0,
          startedAt: new Date("2026-05-19T00:00:00Z"),
          completedAt: new Date("2026-05-19T00:01:00Z"),
          createdAt: new Date("2026-05-19T00:00:00Z"),
        },
      ],
    };
    render(<GoldenQuestionsRecentRunsPanel />);
    expect(screen.getAllByTestId("gq-recent-runs-row")).toHaveLength(1);
    expect(screen.getByText(/run #100 — smoke/)).toBeTruthy();
    expect(screen.getByText(/✓ 5/)).toBeTruthy();
    expect(screen.getByText(/✗ 0/)).toBeTruthy();
  });

  it("suite filter threads suiteKey into the listRecentRuns query", () => {
    mocks.suitesQuery.data = {
      suites: [
        {
          id: 1,
          suiteKey: "smoke",
          name: "Smoke",
          description: null,
          active: true,
          questionCount: 5,
          createdAt: new Date(),
        },
      ],
    };
    render(<GoldenQuestionsRecentRunsPanel />);
    // Initial call with no filter
    expect(mocks.runsQueryCalls[0]).toEqual({ limit: 50 });
    fireEvent.change(screen.getByTestId("gq-recent-suite-filter"), {
      target: { value: "smoke" },
    });
    // Subsequent call with suiteKey
    const last = mocks.runsQueryCalls[mocks.runsQueryCalls.length - 1];
    expect(last).toEqual({ limit: 50, suiteKey: "smoke" });
  });
});

describe("GoldenQuestionsRecentRunsPanel — detail (stats + results)", () => {
  function selectFirstRun() {
    mocks.runsQuery.data = {
      runs: [
        {
          id: 100,
          suiteId: 1,
          suiteKey: "smoke",
          status: "passed",
          passedCount: 1,
          failedCount: 1,
          startedAt: new Date(),
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ],
    };
    render(<GoldenQuestionsRecentRunsPanel />);
    fireEvent.click(screen.getAllByTestId("gq-recent-runs-row")[0]);
  }

  it("clicking a run mounts the detail container", () => {
    selectFirstRun();
    expect(screen.getByTestId("gq-recent-runs-detail")).toBeTruthy();
    expect(screen.getByText(/Run #100 detail/i)).toBeTruthy();
  });

  it("renders stats badge row when getRunStats returns ok", () => {
    mocks.statsQuery.data = {
      status: "ok",
      stats: {
        runId: 100,
        suiteId: 1,
        suiteKey: "smoke",
        status: "completed",
        passedCount: 1,
        failedCount: 1,
        totalCount: 2,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    };
    selectFirstRun();
    expect(screen.getByText(/passed: 1/i)).toBeTruthy();
    expect(screen.getByText(/failed: 1/i)).toBeTruthy();
    expect(screen.getByText(/total: 2/i)).toBeTruthy();
  });

  it("renders not_found when stats are missing", () => {
    mocks.statsQuery.data = { status: "not_found" };
    selectFirstRun();
    expect(screen.getByText(/Run #100 not found/i)).toBeTruthy();
  });

  it("renders per-question result rows with PASS/FAIL pills", () => {
    mocks.resultsQuery.data = {
      status: "ok",
      runId: 100,
      results: [
        {
          id: 1,
          runId: 100,
          questionId: 11,
          questionKey: "q-ok",
          question: "first question",
          actualAnswer: "a fine answer",
          citationCount: 2,
          passed: true,
          failureReason: null,
          durationMs: 50,
          createdAt: new Date(),
        },
        {
          id: 2,
          runId: 100,
          questionId: 22,
          questionKey: "q-bad",
          question: "second question",
          actualAnswer: null,
          citationCount: null,
          passed: false,
          failureReason: "missing citation",
          durationMs: 25,
          createdAt: new Date(),
        },
      ],
    };
    selectFirstRun();
    const rows = screen.getAllByTestId("gq-recent-runs-result-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("PASS")).toBeTruthy();
    expect(screen.getByText("FAIL")).toBeTruthy();
    expect(screen.getByText(/reason: missing citation/)).toBeTruthy();
  });
});

describe("GoldenQuestionsRecentRunsPanel — question detail (expand)", () => {
  function selectThenExpand() {
    mocks.runsQuery.data = {
      runs: [
        {
          id: 100,
          suiteId: 1,
          suiteKey: "smoke",
          status: "passed",
          passedCount: 0,
          failedCount: 1,
          startedAt: new Date(),
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ],
    };
    mocks.resultsQuery.data = {
      status: "ok",
      runId: 100,
      results: [
        {
          id: 1,
          runId: 100,
          questionId: 11,
          questionKey: "q-bad",
          question: "what color is the sky?",
          actualAnswer: "purple",
          citationCount: 0,
          passed: false,
          failureReason: "wrong",
          durationMs: 12,
          createdAt: new Date(),
        },
      ],
    };
    mocks.questionDetailQuery.data = {
      status: "ok",
      questionId: 11,
      question: {
        id: 11,
        suiteId: 1,
        suiteKey: "smoke",
        questionKey: "q-bad",
        question: "what color is the sky?",
        expectedAnswerPattern: "blue",
        expectedPaths: { path1: ["node-a", "node-b"] },
        minimumCitationCount: 1,
        createdAt: new Date(),
      },
    };
    render(<GoldenQuestionsRecentRunsPanel />);
    fireEvent.click(screen.getAllByTestId("gq-recent-runs-row")[0]);
    fireEvent.click(
      screen.getAllByTestId("gq-recent-runs-result-row-toggle")[0],
    );
  }

  it("clicking a result row expands it + shows question detail", () => {
    selectThenExpand();
    expect(screen.getByTestId("gq-recent-runs-question-detail")).toBeTruthy();
    expect(screen.getByText(/expectedAnswerPattern:/i)).toBeTruthy();
    expect(screen.getByText(/blue/)).toBeTruthy();
    expect(screen.getByText(/minimumCitationCount:/i)).toBeTruthy();
  });

  it("expectedPaths JSON is rendered inside the expanded panel", () => {
    selectThenExpand();
    // The pre element contains JSON.stringify of expectedPaths.
    const detail = screen.getByTestId("gq-recent-runs-question-detail");
    expect(detail.textContent).toContain("path1");
    expect(detail.textContent).toContain("node-a");
  });
});
