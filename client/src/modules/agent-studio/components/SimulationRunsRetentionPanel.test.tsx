// @vitest-environment jsdom
// SimulationRunsRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SimulationRunsRetentionPanel } from "./SimulationRunsRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: { deletedRunsCount: number; deletedStepsCount: number };
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
      onSuccess?: (d: { deletedRunsCount: number; deletedStepsCount: number }) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      simulation: {
        getRetentionCronStatus: { useQuery: () => mocks.statusState },
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
  mocks.statusState.data = undefined;
  mocks.statusState.refetch.mockReset();
  mocks.pruneState.isPending = false;
  mocks.pruneState.mutate.mockReset();
  mocks.pruneState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("SimulationRunsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<SimulationRunsRetentionPanel />);
    expect(screen.getByText(/simulation runs retention cron/i)).toBeInTheDocument();
  });

  it("renders two '—' cells (runs + steps deleted) when no status data is present", () => {
    render(<SimulationRunsRetentionPanel />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("surfaces lastResult counts", () => {
    mocks.statusState.data = {
      lastRunAt: new Date("2026-05-13T10:00:00Z"),
      lastResult: { deletedRunsCount: 7, deletedStepsCount: 22 },
    };
    render(<SimulationRunsRetentionPanel />);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
  });

  it("default sweep includes all three terminal statuses", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SimulationRunsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["passed", "failed", "cancelled"],
      agentId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("unchecking failed + cancelled narrows to passed-only", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SimulationRunsRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // failed off
    fireEvent.click(checkboxes[2]); // cancelled off
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["passed"],
      agentId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("button is disabled when every status is unchecked", () => {
    render(<SimulationRunsRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((c) => fireEvent.click(c));
    expect(
      screen.getByRole("button", { name: /run sweep now/i }),
    ).toBeDisabled();
  });

  it("agentId CSV parsed as array when multiple", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SimulationRunsRetentionPanel />);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 42/i), {
      target: { value: "11, 22" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["passed", "failed", "cancelled"],
      agentId: [11, 22],
    });
    confirmSpy.mockRestore();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SimulationRunsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch", () => {
    render(<SimulationRunsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedRunsCount: 3,
      deletedStepsCount: 9,
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<SimulationRunsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<SimulationRunsRetentionPanel />);
    expect(screen.getByRole("button", { name: /sweeping/i })).toBeInTheDocument();
  });
});
