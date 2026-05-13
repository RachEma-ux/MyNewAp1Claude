// @vitest-environment jsdom
// TestRunsRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { TestRunsRetentionPanel } from "./TestRunsRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: { deletedRunsCount: number; deletedResultsCount: number };
}

const mocks = vi.hoisted(() => ({
  statusState: {
    isLoading: false,
    isError: false,
    data: undefined as CronStatusData | undefined,
    refetch: vi.fn(),
  },
  pruneState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: { deletedRunsCount: number; deletedResultsCount: number }) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      testing: {
        getRetentionCronStatus: { useQuery: () => mocks.statusState },
        pruneRetention: {
          useMutation: (opts: {
            onSuccess?: (d: { deletedRunsCount: number; deletedResultsCount: number }) => void;
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
  mocks.statusState.data = undefined;
  mocks.statusState.refetch.mockReset();
  mocks.pruneState.isPending = false;
  mocks.pruneState.mutate.mockReset();
  mocks.pruneState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("TestRunsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<TestRunsRetentionPanel />);
    expect(screen.getByText(/test runs retention cron/i)).toBeInTheDocument();
  });

  it("renders two '—' cells when no status data is present", () => {
    render(<TestRunsRetentionPanel />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("default sweep includes all three terminal statuses", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TestRunsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["passed", "failed", "cancelled"],
      agentId: undefined,
      suiteId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("agentId + suiteId scalars passed through", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TestRunsRetentionPanel />);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 42/i), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 99/i), {
      target: { value: "99" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["passed", "failed", "cancelled"],
      agentId: 42,
      suiteId: 99,
    });
    confirmSpy.mockRestore();
  });

  it("agentId CSV parsed as array when multiple", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TestRunsRetentionPanel />);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 42/i), {
      target: { value: "1, 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["passed", "failed", "cancelled"],
      agentId: [1, 2],
      suiteId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("button is disabled when every status is unchecked", () => {
    render(<TestRunsRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((c) => fireEvent.click(c));
    expect(
      screen.getByRole("button", { name: /run sweep now/i }),
    ).toBeDisabled();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TestRunsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch", () => {
    render(<TestRunsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedRunsCount: 2,
      deletedResultsCount: 6,
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<TestRunsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "kaboom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("kaboom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<TestRunsRetentionPanel />);
    expect(screen.getByRole("button", { name: /sweeping/i })).toBeInTheDocument();
  });
});
