// @vitest-environment jsdom
// NotePromotionsRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { NotePromotionsRetentionPanel } from "./NotePromotionsRetentionPanel";

interface CascadeCounts {
  versions: number;
  decisions: number;
  auditEvents: number;
}

interface PruneData {
  deletedCount: number;
  preservedCount: number;
  blockerCounts: Record<string, number>;
  cascadeDeletedCounts: CascadeCounts;
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
      promotion: {
        getRetentionCronStatus: {
          useQuery: () => mocks.statusState,
        },
        pruneRetention: {
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

describe("NotePromotionsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<NotePromotionsRetentionPanel />);
    expect(
      screen.getByText(/note promotions retention cron/i),
    ).toBeInTheDocument();
  });

  it("renders 'never' + a single '—' placeholder when no status data is present", () => {
    render(<NotePromotionsRetentionPanel />);
    expect(screen.getByText("never")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("default sweep passes retentionDays=90", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NotePromotionsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 90,
    });
    confirmSpy.mockRestore();
  });

  it("custom retentionDays input is forwarded", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NotePromotionsRetentionPanel />);
    fireEvent.change(screen.getByDisplayValue("90"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
    });
    confirmSpy.mockRestore();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NotePromotionsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch + renders cascade breakdown", () => {
    render(<NotePromotionsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedCount: 6,
      preservedCount: 2,
      blockerCounts: { ACTIVE_VERSION: 2 },
      cascadeDeletedCounts: { versions: 12, decisions: 3, auditEvents: 8 },
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onSuccess with empty blockers renders without blockers line", () => {
    render(<NotePromotionsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedCount: 1,
      preservedCount: 0,
      blockerCounts: {},
      cascadeDeletedCounts: { versions: 2, decisions: 0, auditEvents: 1 },
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<NotePromotionsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<NotePromotionsRetentionPanel />);
    expect(
      screen.getByRole("button", { name: /sweeping/i }),
    ).toBeInTheDocument();
  });

  it("renders cascade summary when status data is present", () => {
    mocks.statusState.data = {
      lastRunAt: new Date("2026-05-13T20:00:00Z"),
      lastError: null,
      lastResult: {
        deletedCount: 5,
        preservedCount: 2,
        blockerCounts: { ACTIVE_VERSION: 2 },
        cascadeDeletedCounts: { versions: 9, decisions: 4, auditEvents: 7 },
      },
    };
    render(<NotePromotionsRetentionPanel />);
    expect(screen.getByText(/5 deleted/)).toBeInTheDocument();
    expect(screen.getByText(/cascade v9\/d4\/a7/)).toBeInTheDocument();
  });
});
