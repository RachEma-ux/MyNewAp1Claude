// @vitest-environment jsdom
//
// CronStatusPanel — branch coverage tests.
//
// Covers the rendering branches of the workspace-observability bundled
// cron-status display against a mocked `agentStudio.workspaceObservability
// .getCronStatus` tRPC query:
//
//   - Loading state → LoadingState placeholder
//   - Error state → red "Failed to load cron status: …" card
//   - Data state with both retention + staleRunning populated
//   - Data state with only retention (staleRunning undefined)
//   - lastResult deletion counts surfaced; lastError surfaced
//
// Originally inline at the top of RetrofitPage.tsx; extracted at
// PR #722 to make this test possible.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { CronStatusPanel } from "./CronStatusPanel";

interface CronStatusData {
  retention?: {
    lastRunAt?: Date | string | null;
    lastError?: string | null;
    lastResult?: {
      errorEventsDeleted: number;
      notificationsDeleted: number;
      backgroundJobsDeleted: number;
    };
  };
  staleRunning?: {
    lastRunAt?: Date | string | null;
    lastError?: string | null;
    lastResult?: {
      scanned: number;
      failed: ReadonlyArray<unknown>;
    };
  };
}

const mocks = vi.hoisted(() => ({
  state: {
    isLoading: false,
    isError: false,
    error: null as { message: string } | null,
    data: undefined as CronStatusData | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      workspaceObservability: {
        getCronStatus: {
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

describe("CronStatusPanel", () => {
  it("renders the loading placeholder when the query is in flight", () => {
    mocks.state.isLoading = true;
    render(<CronStatusPanel />);
    expect(screen.getByText(/loading cron status/i)).toBeInTheDocument();
  });

  it("renders an error card with the surfaced message", () => {
    mocks.state.isError = true;
    mocks.state.error = { message: "ASDB unreachable" };
    render(<CronStatusPanel />);
    expect(screen.getByText(/failed to load cron status/i)).toBeInTheDocument();
    expect(screen.getByText(/ASDB unreachable/)).toBeInTheDocument();
  });

  it("falls back to 'unknown' when an error has no message field (undefined, not empty-string)", () => {
    mocks.state.isError = true;
    // The `?? "unknown"` only fires on null/undefined — empty string
    // stays empty. The shipped fallback is for "error object exists
    // but has no message field" (e.g. some non-Error throwables).
    mocks.state.error = {} as unknown as { message: string };
    render(<CronStatusPanel />);
    expect(screen.getByText(/unknown/i)).toBeInTheDocument();
  });

  it("renders both Retention sweep and Stale-running sweep cards on successful data", () => {
    mocks.state.data = {
      retention: {
        lastRunAt: new Date("2026-05-13T03:00:00Z"),
        lastError: null,
        lastResult: {
          errorEventsDeleted: 10,
          notificationsDeleted: 5,
          backgroundJobsDeleted: 7,
        },
      },
      staleRunning: {
        lastRunAt: new Date("2026-05-13T11:50:00Z"),
        lastError: null,
        lastResult: {
          scanned: 42,
          failed: [1, 2, 3],
        },
      },
    };
    render(<CronStatusPanel />);
    expect(screen.getByText(/retention sweep/i)).toBeInTheDocument();
    expect(screen.getByText(/stale-running sweep/i)).toBeInTheDocument();
  });

  it("aggregates the 3 deletion counts into a 'rows deleted' total", () => {
    mocks.state.data = {
      retention: {
        lastRunAt: new Date("2026-05-13T03:00:00Z"),
        lastResult: {
          errorEventsDeleted: 10,
          notificationsDeleted: 5,
          backgroundJobsDeleted: 7,
        },
      },
    };
    render(<CronStatusPanel />);
    // 10 + 5 + 7 = 22
    expect(screen.getByText("22")).toBeInTheDocument();
    // Per-table breakdown line: "errors 10 · notifications 5 · jobs 7"
    expect(screen.getByText(/errors 10/)).toBeInTheDocument();
    expect(screen.getByText(/notifications 5/)).toBeInTheDocument();
    expect(screen.getByText(/jobs 7/)).toBeInTheDocument();
  });

  it("surfaces the stale-running 'jobs failed' count and 'scanned' line", () => {
    mocks.state.data = {
      staleRunning: {
        lastRunAt: new Date("2026-05-13T11:50:00Z"),
        lastResult: {
          scanned: 42,
          failed: [1, 2, 3, 4, 5],
        },
      },
    };
    render(<CronStatusPanel />);
    expect(screen.getByText("5")).toBeInTheDocument(); // jobs failed
    expect(screen.getByText(/scanned 42/)).toBeInTheDocument();
  });

  it("shows '—' for both counts when lastResult is absent", () => {
    mocks.state.data = { retention: {}, staleRunning: {} };
    render(<CronStatusPanel />);
    const dashes = screen.getAllByText("—");
    // 2 dashes — one for retention rows deleted, one for staleRunning jobs failed
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces retention.lastError in a red error block", () => {
    mocks.state.data = {
      retention: { lastError: "ASDB connection reset" },
    };
    render(<CronStatusPanel />);
    expect(screen.getByText("ASDB connection reset")).toBeInTheDocument();
  });

  it("surfaces staleRunning.lastError in a red error block", () => {
    mocks.state.data = {
      staleRunning: { lastError: "Job pool exhausted" },
    };
    render(<CronStatusPanel />);
    expect(screen.getByText("Job pool exhausted")).toBeInTheDocument();
  });

  it("renders when only retention is present (staleRunning undefined)", () => {
    mocks.state.data = {
      retention: { lastRunAt: new Date("2026-05-13T03:00:00Z") },
    };
    render(<CronStatusPanel />);
    expect(screen.getByText(/retention sweep/i)).toBeInTheDocument();
    expect(screen.getByText(/stale-running sweep/i)).toBeInTheDocument();
  });
});
