// @vitest-environment jsdom
// GraphAgentRuntimeTracesRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { GraphAgentRuntimeTracesRetentionPanel } from "./GraphAgentRuntimeTracesRetentionPanel";

interface TraceCounts {
  graphSkillRuntimeUsages: number;
  queryTemplateRuns: number;
  graphAgentSteps: number;
  graphAgentRuns: number;
}

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: TraceCounts;
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
      onSuccess?: (d: TraceCounts) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      graphAgent: {
        getRuntimeTracesRetentionCronStatus: {
          useQuery: () => mocks.statusState,
        },
        pruneTraces: {
          useMutation: (opts: {
            onSuccess?: (d: TraceCounts) => void;
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

describe("GraphAgentRuntimeTracesRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<GraphAgentRuntimeTracesRetentionPanel />);
    expect(
      screen.getByText(/graph agent runtime traces retention cron/i),
    ).toBeInTheDocument();
  });

  it("renders 'never' + a single '—' placeholder when no status data is present", () => {
    render(<GraphAgentRuntimeTracesRetentionPanel />);
    expect(screen.getByText("never")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("default sweep passes 90 * 86_400_000 ms (90-day default)", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphAgentRuntimeTracesRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      olderThanMs: 90 * 86_400_000,
    });
    confirmSpy.mockRestore();
  });

  it("custom retentionDays converts to ms in the mutation payload", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphAgentRuntimeTracesRetentionPanel />);
    const input = screen.getByDisplayValue("90");
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      olderThanMs: 30 * 86_400_000,
    });
    confirmSpy.mockRestore();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GraphAgentRuntimeTracesRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch when data is present", () => {
    render(<GraphAgentRuntimeTracesRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      graphSkillRuntimeUsages: 3,
      queryTemplateRuns: 2,
      graphAgentSteps: 5,
      graphAgentRuns: 1,
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<GraphAgentRuntimeTracesRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<GraphAgentRuntimeTracesRetentionPanel />);
    expect(
      screen.getByRole("button", { name: /sweeping/i }),
    ).toBeInTheDocument();
  });

  it("renders rows-deleted breakdown when lastResult is present", () => {
    mocks.statusState.data = {
      lastRunAt: new Date("2026-05-13T15:00:00Z"),
      lastError: null,
      lastResult: {
        graphSkillRuntimeUsages: 11,
        queryTemplateRuns: 7,
        graphAgentSteps: 4,
        graphAgentRuns: 2,
      },
    };
    render(<GraphAgentRuntimeTracesRetentionPanel />);
    expect(screen.getByText(/24/)).toBeInTheDocument();
    expect(screen.getByText(/usages 11/)).toBeInTheDocument();
    expect(screen.getByText(/queryRuns 7/)).toBeInTheDocument();
  });
});
