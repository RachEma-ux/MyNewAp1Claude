// @vitest-environment jsdom
//
// ChatDiagnosticsPanel — branch coverage tests.
//
// Closes Phase 11b-3 residual sliver (inline chat diagnostics panel).
// Covers each rendering branch against a mocked agentStudio.runs.getDetail
// tRPC query.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ChatDiagnosticsPanel } from "./ChatDiagnosticsPanel";

interface RunData {
  sseFirstTokenMs?: number | null;
  sseDurationMs?: number | null;
  errorReason?: string | null;
  clientDisconnected?: boolean | null;
  idempotencyConflicts?: number | null;
  status?: string;
  durationMs?: number | null;
}

const mocks = vi.hoisted(() => ({
  state: {
    isLoading: false,
    isError: false,
    error: null as { message: string } | null,
    data: undefined as { run: RunData } | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      runs: {
        getDetail: {
          useQuery: () => mocks.state,
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.state.isLoading = false;
  mocks.state.isError = false;
  mocks.state.error = null;
  mocks.state.data = undefined;
});

describe("ChatDiagnosticsPanel", () => {
  it("renders the loading placeholder when the query is in flight", () => {
    mocks.state.isLoading = true;
    render(<ChatDiagnosticsPanel runtimeRunId={42} />);
    expect(screen.getByText(/loading chat diagnostics/i)).toBeInTheDocument();
  });

  it("renders the error branch when the query fails", () => {
    mocks.state.isError = true;
    mocks.state.error = { message: "boom" };
    render(<ChatDiagnosticsPanel runtimeRunId={42} />);
    expect(screen.getByText(/Failed to load chat diagnostics/i)).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("renders 'no runtime run row yet' when data is empty", () => {
    mocks.state.data = { run: undefined as unknown as RunData };
    render(<ChatDiagnosticsPanel runtimeRunId={42} />);
    expect(screen.getByText(/no runtime run row yet/i)).toBeInTheDocument();
  });

  it("renders the success badge for a healthy completed run", () => {
    mocks.state.data = {
      run: {
        sseFirstTokenMs: 87,
        sseDurationMs: 1240,
        idempotencyConflicts: 0,
        durationMs: 1300,
        errorReason: null,
        clientDisconnected: false,
        status: "completed",
      },
    };
    render(<ChatDiagnosticsPanel runtimeRunId={42} />);
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Chat diagnostics — run 42/)).toBeInTheDocument();
  });

  it("formats SSE first-token timing in ms", () => {
    mocks.state.data = {
      run: { sseFirstTokenMs: 87, sseDurationMs: null },
    };
    render(<ChatDiagnosticsPanel runtimeRunId={1} />);
    expect(screen.getByText("87 ms")).toBeInTheDocument();
  });

  it("formats SSE duration in seconds when > 1000ms", () => {
    mocks.state.data = {
      run: { sseFirstTokenMs: 50, sseDurationMs: 4500 },
    };
    render(<ChatDiagnosticsPanel runtimeRunId={1} />);
    expect(screen.getByText("4.50 s")).toBeInTheDocument();
  });

  it("renders '—' when timing is null", () => {
    mocks.state.data = { run: {} };
    render(<ChatDiagnosticsPanel runtimeRunId={1} />);
    const dashes = screen.getAllByText("—");
    // SSE first token + SSE duration + total duration — 3 timing slots
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("surfaces idempotency conflicts count", () => {
    mocks.state.data = {
      run: { idempotencyConflicts: 5 },
    };
    render(<ChatDiagnosticsPanel runtimeRunId={1} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("surfaces errorReason in a red block + error badge", () => {
    mocks.state.data = {
      run: { errorReason: "model timeout" },
    };
    render(<ChatDiagnosticsPanel runtimeRunId={1} />);
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("model timeout")).toBeInTheDocument();
  });

  it("surfaces clientDisconnected in an amber block + disconnected badge", () => {
    mocks.state.data = {
      run: { clientDisconnected: true, errorReason: null },
    };
    render(<ChatDiagnosticsPanel runtimeRunId={1} />);
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    expect(
      screen.getByText(/Client disconnected before the stream finished/i),
    ).toBeInTheDocument();
  });

  it("error badge wins over disconnected badge when both are present", () => {
    mocks.state.data = {
      run: { errorReason: "x", clientDisconnected: true },
    };
    render(<ChatDiagnosticsPanel runtimeRunId={1} />);
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.queryByText("disconnected")).toBeNull();
  });
});
