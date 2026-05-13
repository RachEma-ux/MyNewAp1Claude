// @vitest-environment jsdom
//
// ToolCallTracesRetentionPanel — branch coverage tests.
// Mirrors McpTransitionsRetentionPanel.test.tsx pattern.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ToolCallTracesRetentionPanel } from "./ToolCallTracesRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: { deletedCount: number };
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
      onSuccess?: (d: { deletedCount: number }) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      runs: {
        getToolCallTracesRetentionCronStatus: {
          useQuery: () => mocks.statusState,
        },
        pruneToolCallTracesRetention: {
          useMutation: (opts: {
            onSuccess?: (d: { deletedCount: number }) => void;
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
  mocks.statusState.data = undefined;
  mocks.statusState.refetch.mockReset();
  mocks.pruneState.isPending = false;
  mocks.pruneState.mutate.mockReset();
  mocks.pruneState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("ToolCallTracesRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<ToolCallTracesRetentionPanel />);
    expect(screen.getByText(/tool-call-traces retention cron/i)).toBeInTheDocument();
  });

  it("renders the manual sweep section label", () => {
    render(<ToolCallTracesRetentionPanel />);
    expect(screen.getByText(/manual sweep/i)).toBeInTheDocument();
  });

  it("renders '—' when no status data is present", () => {
    render(<ToolCallTracesRetentionPanel />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("surfaces lastResult.deletedCount", () => {
    mocks.statusState.data = {
      lastRunAt: new Date("2026-05-13T05:00:00Z"),
      lastResult: { deletedCount: 444 },
    };
    render(<ToolCallTracesRetentionPanel />);
    expect(screen.getByText("444")).toBeInTheDocument();
  });

  it("surfaces lastError in a red block", () => {
    mocks.statusState.data = { lastError: "DB locked" };
    render(<ToolCallTracesRetentionPanel />);
    expect(screen.getByText("DB locked")).toBeInTheDocument();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ToolCallTracesRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("default sweep includes only dispatchResults=['ok']", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ToolCallTracesRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      dispatchResults: ["ok"],
    });
    confirmSpy.mockRestore();
  });

  it("aggressive checkbox flips dispatchResults to all three", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ToolCallTracesRetentionPanel />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      dispatchResults: ["ok", "error", "blocked"],
    });
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch", () => {
    render(<ToolCallTracesRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({ deletedCount: 7 });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error with the message", () => {
    render(<ToolCallTracesRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "kaboom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("kaboom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<ToolCallTracesRetentionPanel />);
    expect(screen.getByRole("button", { name: /sweeping/i })).toBeInTheDocument();
  });
});
