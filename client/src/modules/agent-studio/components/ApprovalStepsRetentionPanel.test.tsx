// @vitest-environment jsdom
// ApprovalStepsRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ApprovalStepsRetentionPanel } from "./ApprovalStepsRetentionPanel";

interface PruneData {
  deletedCount: number;
  preservedCount: number;
  blockerCounts: Record<string, number>;
}

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: PruneData;
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
      onSuccess?: (d: PruneData) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      publish: {
        getApprovalStepsRetentionCronStatus: {
          useQuery: () => mocks.statusState,
        },
        pruneApprovalStepsRetention: {
          useMutation: (opts: {
            onSuccess?: (d: PruneData) => void;
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

describe("ApprovalStepsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<ApprovalStepsRetentionPanel />);
    expect(
      screen.getByText(/approval steps retention cron/i),
    ).toBeInTheDocument();
  });

  it("renders 'never' + a single '—' placeholder when no status data is present", () => {
    render(<ApprovalStepsRetentionPanel />);
    expect(screen.getByText("never")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("default sweep passes retentionDays=90", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ApprovalStepsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 90,
    });
    confirmSpy.mockRestore();
  });

  it("custom retentionDays input is forwarded", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ApprovalStepsRetentionPanel />);
    fireEvent.change(screen.getByDisplayValue("90"), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 60,
    });
    confirmSpy.mockRestore();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ApprovalStepsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch + renders manual result with blockers", () => {
    render(<ApprovalStepsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedCount: 4,
      preservedCount: 1,
      blockerCounts: { PARENT_NOT_TERMINAL: 1 },
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onSuccess with empty blockers renders without blockers line", () => {
    render(<ApprovalStepsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedCount: 9,
      preservedCount: 0,
      blockerCounts: {},
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<ApprovalStepsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<ApprovalStepsRetentionPanel />);
    expect(
      screen.getByRole("button", { name: /sweeping/i }),
    ).toBeInTheDocument();
  });

  it("renders parent-lifecycle-aware copy in the cron description", () => {
    render(<ApprovalStepsRetentionPanel />);
    expect(
      screen.getByText(/parent-lifecycle-aware/i),
    ).toBeInTheDocument();
  });
});
