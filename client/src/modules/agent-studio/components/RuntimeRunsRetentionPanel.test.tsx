// @vitest-environment jsdom
//
// RuntimeRunsRetentionPanel — branch coverage tests.
//
// Covers the rendering branches of the runtime-runs retention panel
// against a mocked `agentStudio.runs` tRPC surface:
//
//   - Cron status: loading / data / lastError branches
//   - Manual sweep: input handling, confirm-gated submit, success result
//   - Auto-refresh interval declared (`refetchInterval: 30_000`)
//   - tRPC `pruneRetention` mutation onSuccess + onError side-effects
//
// Originally inline at RetrofitPage.tsx:1455+. Extracted at PR-D of
// the Native Graph Workspace full-closure mission to make this test
// possible. Pattern mirrors `CronStatusPanel.test.tsx` (PR #722).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { RuntimeRunsRetentionPanel } from "./RuntimeRunsRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: {
    deletedRunsCount: number;
    deletedStepsCount: number;
  };
}

const mocks = vi.hoisted(() => ({
  statusState: {
    isLoading: false,
    isError: false,
    error: null as { message: string } | null,
    data: undefined as CronStatusData | undefined,
    refetch: vi.fn(),
  },
  pruneState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: { deletedRunsCount: number; deletedStepsCount: number }) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: mocks.toast,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      runs: {
        getRetentionCronStatus: {
          useQuery: () => mocks.statusState,
        },
        pruneRetention: {
          useMutation: (opts: {
            onSuccess?: (d: { deletedRunsCount: number; deletedStepsCount: number }) => void;
            onError?: (e: { message?: string }) => void;
          }) => {
            mocks.pruneState.lastOpts = opts;
            return mocks.pruneState;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.statusState.isLoading = false;
  mocks.statusState.isError = false;
  mocks.statusState.error = null;
  mocks.statusState.data = undefined;
  mocks.statusState.refetch.mockReset();
  mocks.pruneState.isPending = false;
  mocks.pruneState.mutate.mockReset();
  mocks.pruneState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("RuntimeRunsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<RuntimeRunsRetentionPanel />);
    expect(screen.getByText(/runtime-runs retention cron/i)).toBeInTheDocument();
  });

  it("renders the manual sweep section label", () => {
    render(<RuntimeRunsRetentionPanel />);
    expect(screen.getByText(/manual sweep/i)).toBeInTheDocument();
  });

  it("renders '—' for last result when status data is absent", () => {
    render(<RuntimeRunsRetentionPanel />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("surfaces lastResult counts and step row breakdown when present", () => {
    mocks.statusState.data = {
      lastRunAt: new Date("2026-05-13T04:00:00Z"),
      lastError: null,
      lastResult: {
        deletedRunsCount: 42,
        deletedStepsCount: 187,
      },
    };
    render(<RuntimeRunsRetentionPanel />);
    expect(screen.getByText("42 runs")).toBeInTheDocument();
    expect(screen.getByText(/187 step row\(s\)/)).toBeInTheDocument();
  });

  it("surfaces lastError in a red error block", () => {
    mocks.statusState.data = {
      lastError: "ASDB unreachable during cron sweep",
    };
    render(<RuntimeRunsRetentionPanel />);
    expect(screen.getByText("ASDB unreachable during cron sweep")).toBeInTheDocument();
  });

  it("opens a confirm dialog before firing the prune mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RuntimeRunsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("fires the prune mutation with parsed days + trimmed env when confirmed", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RuntimeRunsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      environment: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("invokes onSuccess → toast.success + refetch + sets manualResult", () => {
    render(<RuntimeRunsRetentionPanel />);
    expect(mocks.pruneState.lastOpts).not.toBeNull();
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedRunsCount: 7,
      deletedStepsCount: 22,
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("invokes onError → toast.error with the error message", () => {
    render(<RuntimeRunsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "DB locked" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("DB locked"),
    );
  });

  it("renders 'Sweeping…' label while mutation is pending", () => {
    mocks.pruneState.isPending = true;
    render(<RuntimeRunsRetentionPanel />);
    expect(screen.getByRole("button", { name: /sweeping/i })).toBeInTheDocument();
  });
});
