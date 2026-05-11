/**
 * @vitest-environment jsdom
 *
 * Phase 13 §5 — GraphAgentExplainPanel component tests.
 *
 * Covers rendering branches against a mocked
 * `agentStudio.graphAgent.explain` tRPC query:
 *   - Empty-state rendering when no runId is entered
 *   - Loading state while the query is fetching
 *   - Error state with the surfaced message
 *   - "no decision trace" empty state when the query returns
 *     `{ explanation: null }`
 *   - Full render: query header + step rows for a completed run
 *   - Failed-run rendering surfaces the error message
 *   - Reload button calls refetch
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import GraphAgentExplainPanel from "./GraphAgentExplainPanel";

interface ExplainQueryState {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  error: { message: string } | null;
  data: { runId: number; explanation: ExplanationShape | null } | undefined;
  refetch: () => void;
}

interface ExplanationShape {
  runtimeRunId: number;
  graphAgentRunId: number;
  agentKey: string;
  userQuery: string;
  status: string;
  durationMs: number | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  steps: Array<{
    stepIndex: number;
    stepKind: string;
    stepInput: Record<string, unknown> | null;
    stepOutput: Record<string, unknown> | null;
    durationMs: number | null;
    createdAt: Date;
  }>;
}

const mocks = vi.hoisted(() => ({
  lastQueryInput: undefined as unknown,
  lastQueryOptions: undefined as unknown,
  refetch: vi.fn(),
  state: {
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    data: undefined,
  } as ExplainQueryState,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      graphAgent: {
        explain: {
          useQuery: (input: unknown, opts: unknown) => {
            mocks.lastQueryInput = input;
            mocks.lastQueryOptions = opts;
            return {
              ...mocks.state,
              refetch: mocks.refetch,
            };
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.lastQueryInput = undefined;
  mocks.lastQueryOptions = undefined;
  mocks.refetch = vi.fn();
  mocks.state = {
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    data: undefined,
    refetch: mocks.refetch,
  };
});

describe("GraphAgentExplainPanel — Phase 13 §5", () => {
  it("renders the empty-state when no runId is entered", () => {
    render(<GraphAgentExplainPanel />);
    expect(screen.getByText(/enter a run id/i)).toBeInTheDocument();
    const opts = mocks.lastQueryOptions as { enabled: boolean };
    expect(opts.enabled).toBe(false);
  });

  it("enables the query when a positive integer runId is entered", () => {
    render(<GraphAgentExplainPanel initialRunId={42} />);
    const input = mocks.lastQueryInput as { runId: number };
    expect(input.runId).toBe(42);
    const opts = mocks.lastQueryOptions as { enabled: boolean };
    expect(opts.enabled).toBe(true);
  });

  it("does NOT enable the query for negative or non-numeric input", () => {
    render(<GraphAgentExplainPanel />);
    const inputField = screen.getByPlaceholderText(/e\.g\. 1234/i);
    fireEvent.change(inputField, { target: { value: "-5" } });
    const opts = mocks.lastQueryOptions as { enabled: boolean };
    expect(opts.enabled).toBe(false);
  });

  it("renders the loading state while the query is fetching", () => {
    mocks.state.isLoading = true;
    render(<GraphAgentExplainPanel initialRunId={1} />);
    expect(screen.getByText(/loading decision trace/i)).toBeInTheDocument();
  });

  it("renders the error state with the surfaced message", () => {
    mocks.state.isError = true;
    mocks.state.error = { message: "ASDB unreachable" };
    render(<GraphAgentExplainPanel initialRunId={1} />);
    expect(screen.getByText(/failed to load explanation/i)).toBeInTheDocument();
    expect(screen.getByText(/ASDB unreachable/)).toBeInTheDocument();
  });

  it("renders the 'no decision trace' empty state when explanation is null", () => {
    mocks.state.data = { runId: 1, explanation: null };
    render(<GraphAgentExplainPanel initialRunId={1} />);
    expect(
      screen.getByText(/no decision trace for this run/i),
    ).toBeInTheDocument();
  });

  it("renders the run header + step rows for a completed run", () => {
    mocks.state.data = {
      runId: 1,
      explanation: {
        runtimeRunId: 1,
        graphAgentRunId: 100,
        agentKey: "graph_agent_lite",
        userQuery: "what links to seed?",
        status: "completed",
        durationMs: 1500,
        errorMessage: null,
        startedAt: new Date(),
        completedAt: new Date(),
        steps: [
          {
            stepIndex: 1,
            stepKind: "plan_retrieval_mode",
            stepInput: null,
            stepOutput: { retrievalMode: "graphrag_local" },
            durationMs: 1,
            createdAt: new Date(),
          },
          {
            stepIndex: 2,
            stepKind: "retrieve",
            stepInput: null,
            stepOutput: { contextBlockCount: 3 },
            durationMs: 25,
            createdAt: new Date(),
          },
        ],
      },
    };
    render(<GraphAgentExplainPanel initialRunId={1} />);
    expect(screen.getByText("what links to seed?")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("plan_retrieval_mode")).toBeInTheDocument();
    expect(screen.getByText("retrieve")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("renders the errorMessage when the run failed", () => {
    mocks.state.data = {
      runId: 1,
      explanation: {
        runtimeRunId: 1,
        graphAgentRunId: 100,
        agentKey: "graph_agent_lite",
        userQuery: "q",
        status: "failed",
        durationMs: 500,
        errorMessage: "model boom",
        startedAt: new Date(),
        completedAt: new Date(),
        steps: [],
      },
    };
    render(<GraphAgentExplainPanel initialRunId={1} />);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/Error: model boom/i)).toBeInTheDocument();
  });

  it("Reload button triggers refetch", () => {
    render(<GraphAgentExplainPanel initialRunId={1} />);
    const btn = screen.getByRole("button", { name: /reload/i });
    fireEvent.click(btn);
    expect(mocks.refetch).toHaveBeenCalled();
  });
});
