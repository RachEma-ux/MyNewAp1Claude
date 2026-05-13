// @vitest-environment jsdom
//
// McpTransitionsRetentionPanel — branch coverage tests.
//
// Mirrors RuntimeRunsRetentionPanel.test.tsx pattern (PR #729).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { McpTransitionsRetentionPanel } from "./McpTransitionsRetentionPanel";

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
      mcp: {
        getTransitionsRetentionCronStatus: {
          useQuery: () => mocks.statusState,
        },
        pruneTransitionsRetention: {
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

describe("McpTransitionsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<McpTransitionsRetentionPanel />);
    expect(screen.getByText(/mcp transitions retention cron/i)).toBeInTheDocument();
  });

  it("renders the manual sweep section label", () => {
    render(<McpTransitionsRetentionPanel />);
    expect(screen.getByText(/manual sweep/i)).toBeInTheDocument();
  });

  it("renders '—' for rows deleted when status data is absent", () => {
    render(<McpTransitionsRetentionPanel />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("surfaces lastResult.deletedCount", () => {
    mocks.statusState.data = {
      lastRunAt: new Date("2026-05-13T06:00:00Z"),
      lastResult: { deletedCount: 123 },
    };
    render(<McpTransitionsRetentionPanel />);
    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("surfaces lastError in a red block", () => {
    mocks.statusState.data = { lastError: "DB locked" };
    render(<McpTransitionsRetentionPanel />);
    expect(screen.getByText("DB locked")).toBeInTheDocument();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<McpTransitionsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("confirmed click fires mutate with parsed days + undefined serverId by default", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<McpTransitionsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      serverId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch + sets manualResult", () => {
    render(<McpTransitionsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({ deletedCount: 9 });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error with the error message", () => {
    render(<McpTransitionsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<McpTransitionsRetentionPanel />);
    expect(screen.getByRole("button", { name: /sweeping/i })).toBeInTheDocument();
  });
});
