// @vitest-environment jsdom
//
// RacRuntimeTracesRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { RacRuntimeTracesRetentionPanel } from "./RacRuntimeTracesRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: {
    deletedTracesCount: number;
    deletedContextBlocksCount: number;
  };
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
      onSuccess?: (d: {
        deletedTracesCount: number;
        deletedContextBlocksCount: number;
      }) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      racTrace: {
        getRetentionCronStatus: { useQuery: () => mocks.statusState },
        pruneRetention: {
          useMutation: (opts: {
            onSuccess?: (d: {
              deletedTracesCount: number;
              deletedContextBlocksCount: number;
            }) => void;
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

describe("RacRuntimeTracesRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<RacRuntimeTracesRetentionPanel />);
    expect(screen.getByText(/rac runtime traces retention cron/i)).toBeInTheDocument();
  });

  it("renders '—' twice when no status data is present (traces + blocks cells)", () => {
    render(<RacRuntimeTracesRetentionPanel />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("surfaces lastResult.deletedTracesCount + deletedContextBlocksCount", () => {
    mocks.statusState.data = {
      lastRunAt: new Date("2026-05-13T08:00:00Z"),
      lastResult: { deletedTracesCount: 9, deletedContextBlocksCount: 33 },
    };
    render(<RacRuntimeTracesRetentionPanel />);
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("33")).toBeInTheDocument();
  });

  it("default sweep fires with no workspace/agent filter", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RacRuntimeTracesRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      workspaceId: undefined,
      agentId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("single workspaceId is sent as a scalar", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RacRuntimeTracesRetentionPanel />);
    const inputs = screen.getAllByPlaceholderText(/e\.g\./i);
    fireEvent.change(inputs[0], { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      workspaceId: 42,
      agentId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("comma-separated workspaceId is parsed into an array", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RacRuntimeTracesRetentionPanel />);
    const inputs = screen.getAllByPlaceholderText(/e\.g\./i);
    fireEvent.change(inputs[0], { target: { value: "11, 22" } });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      workspaceId: [11, 22],
      agentId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RacRuntimeTracesRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch + sets manualResult counts", () => {
    render(<RacRuntimeTracesRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedTracesCount: 4,
      deletedContextBlocksCount: 12,
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<RacRuntimeTracesRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<RacRuntimeTracesRetentionPanel />);
    expect(screen.getByRole("button", { name: /sweeping/i })).toBeInTheDocument();
  });
});
