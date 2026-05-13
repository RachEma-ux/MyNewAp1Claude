// @vitest-environment jsdom
// GraphChangeProposalsRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { GraphChangeProposalsRetentionPanel } from "./GraphChangeProposalsRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: {
    deletedProposalsCount: number;
    deletedItemsCount: number;
    deletedDecisionsCount: number;
    deletedAuditEventsCount: number;
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
        deletedProposalsCount: number;
        deletedItemsCount: number;
        deletedDecisionsCount: number;
        deletedAuditEventsCount: number;
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
      graphChange: {
        getProposalsRetentionCronStatus: {
          useQuery: () => mocks.statusState,
        },
        pruneProposalsRetention: {
          useMutation: (opts: {
            onSuccess?: (d: {
              deletedProposalsCount: number;
              deletedItemsCount: number;
              deletedDecisionsCount: number;
              deletedAuditEventsCount: number;
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
  mocks.statusState.data = undefined;
  mocks.statusState.refetch.mockReset();
  mocks.pruneState.isPending = false;
  mocks.pruneState.mutate.mockReset();
  mocks.pruneState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("GraphChangeProposalsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<GraphChangeProposalsRetentionPanel />);
    expect(
      screen.getByText(/graph change proposals retention cron/i),
    ).toBeInTheDocument();
  });

  it("renders 'never' + two '—' placeholders when no status data is present", () => {
    render(<GraphChangeProposalsRetentionPanel />);
    expect(screen.getByText("never")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("default sweep includes all three terminal statuses + undefined proposalKind", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphChangeProposalsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["approved", "rejected", "withdrawn"],
      proposalKind: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("proposalKind single value is passed as scalar", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphChangeProposalsRetentionPanel />);
    fireEvent.change(
      screen.getByPlaceholderText(/entity_merge, projection_correction/i),
      {
        target: { value: "entity_merge" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["approved", "rejected", "withdrawn"],
      proposalKind: "entity_merge",
    });
    confirmSpy.mockRestore();
  });

  it("proposalKind CSV with multiple values passes as array", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphChangeProposalsRetentionPanel />);
    fireEvent.change(
      screen.getByPlaceholderText(/entity_merge, projection_correction/i),
      {
        target: { value: "entity_merge, entity_split" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["approved", "rejected", "withdrawn"],
      proposalKind: ["entity_merge", "entity_split"],
    });
    confirmSpy.mockRestore();
  });

  it("button is disabled when every status is unchecked", () => {
    render(<GraphChangeProposalsRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((c) => fireEvent.click(c));
    expect(
      screen.getByRole("button", { name: /run sweep now/i }),
    ).toBeDisabled();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GraphChangeProposalsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch", () => {
    render(<GraphChangeProposalsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedProposalsCount: 2,
      deletedItemsCount: 5,
      deletedDecisionsCount: 1,
      deletedAuditEventsCount: 4,
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<GraphChangeProposalsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<GraphChangeProposalsRetentionPanel />);
    expect(
      screen.getByRole("button", { name: /sweeping/i }),
    ).toBeInTheDocument();
  });
});
