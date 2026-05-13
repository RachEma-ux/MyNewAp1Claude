// @vitest-environment jsdom
// GraphQualityAgentRunsRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { GraphQualityAgentRunsRetentionPanel } from "./GraphQualityAgentRunsRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: { deletedAgentRunsCount: number };
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
      onSuccess?: (d: { deletedAgentRunsCount: number }) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      graphQuality: {
        getAgentRunsRetentionCronStatus: { useQuery: () => mocks.statusState },
        pruneAgentRunsRetention: {
          useMutation: (opts: {
            onSuccess?: (d: { deletedAgentRunsCount: number }) => void;
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

describe("GraphQualityAgentRunsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<GraphQualityAgentRunsRetentionPanel />);
    expect(
      screen.getByText(/graph quality agent runs retention cron/i),
    ).toBeInTheDocument();
  });

  it("renders '—' for agent runs deleted when no status data is present", () => {
    render(<GraphQualityAgentRunsRetentionPanel />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("default sweep includes both terminal statuses", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphQualityAgentRunsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["completed", "failed"],
      agentKey: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("single agentKey passed as scalar", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphQualityAgentRunsRetentionPanel />);
    fireEvent.change(screen.getByPlaceholderText(/graph_quality_agent/i), {
      target: { value: "graph_quality_agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["completed", "failed"],
      agentKey: "graph_quality_agent",
    });
    confirmSpy.mockRestore();
  });

  it("button is disabled when every status is unchecked", () => {
    render(<GraphQualityAgentRunsRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((c) => fireEvent.click(c));
    expect(
      screen.getByRole("button", { name: /run sweep now/i }),
    ).toBeDisabled();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GraphQualityAgentRunsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch", () => {
    render(<GraphQualityAgentRunsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({ deletedAgentRunsCount: 5 });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<GraphQualityAgentRunsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<GraphQualityAgentRunsRetentionPanel />);
    expect(
      screen.getByRole("button", { name: /sweeping/i }),
    ).toBeInTheDocument();
  });
});
