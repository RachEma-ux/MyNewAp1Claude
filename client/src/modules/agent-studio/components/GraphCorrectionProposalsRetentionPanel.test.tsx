// @vitest-environment jsdom
// GraphCorrectionProposalsRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { GraphCorrectionProposalsRetentionPanel } from "./GraphCorrectionProposalsRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: {
    deletedProposalsCount: number;
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
      graphCorrection: {
        getProposalsRetentionCronStatus: {
          useQuery: () => mocks.statusState,
        },
        pruneProposalsRetention: {
          useMutation: (opts: {
            onSuccess?: (d: {
              deletedProposalsCount: number;
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

describe("GraphCorrectionProposalsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<GraphCorrectionProposalsRetentionPanel />);
    expect(
      screen.getByText(/graph correction proposals retention cron/i),
    ).toBeInTheDocument();
  });

  it("renders two '—' cells when no status data is present", () => {
    render(<GraphCorrectionProposalsRetentionPanel />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("default sweep includes all four terminal statuses", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphCorrectionProposalsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["approved", "rejected", "applied", "superseded"],
      proposalKind: undefined,
      targetTypeKey: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("proposalKind + targetTypeKey single values are passed as scalars", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphCorrectionProposalsRetentionPanel />);
    fireEvent.change(screen.getByPlaceholderText(/rename-entity/i), {
      target: { value: "rename-entity" },
    });
    fireEvent.change(screen.getByPlaceholderText(/entity, relationship/i), {
      target: { value: "entity" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["approved", "rejected", "applied", "superseded"],
      proposalKind: "rename-entity",
      targetTypeKey: "entity",
    });
    confirmSpy.mockRestore();
  });

  it("button is disabled when every status is unchecked", () => {
    render(<GraphCorrectionProposalsRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((c) => fireEvent.click(c));
    expect(
      screen.getByRole("button", { name: /run sweep now/i }),
    ).toBeDisabled();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GraphCorrectionProposalsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch", () => {
    render(<GraphCorrectionProposalsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedProposalsCount: 2,
      deletedDecisionsCount: 1,
      deletedAuditEventsCount: 4,
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<GraphCorrectionProposalsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<GraphCorrectionProposalsRetentionPanel />);
    expect(
      screen.getByRole("button", { name: /sweeping/i }),
    ).toBeInTheDocument();
  });
});
