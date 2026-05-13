// @vitest-environment jsdom
// GraphQualityScansRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { GraphQualityScansRetentionPanel } from "./GraphQualityScansRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: { deletedScansCount: number; deletedFindingsCount: number };
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
      onSuccess?: (d: { deletedScansCount: number; deletedFindingsCount: number }) => void;
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
        getScansRetentionCronStatus: { useQuery: () => mocks.statusState },
        pruneScansRetention: {
          useMutation: (opts: {
            onSuccess?: (d: { deletedScansCount: number; deletedFindingsCount: number }) => void;
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

describe("GraphQualityScansRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<GraphQualityScansRetentionPanel />);
    expect(screen.getByText(/graph quality scans retention cron/i)).toBeInTheDocument();
  });

  it("renders two '—' cells when no status data is present", () => {
    render(<GraphQualityScansRetentionPanel />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("default sweep includes all three terminal statuses", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphQualityScansRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["completed", "failed", "cancelled"],
      scanKind: undefined,
      scope: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("scanKind CSV parsed into array", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphQualityScansRetentionPanel />);
    fireEvent.change(
      screen.getByPlaceholderText(/orphan-detector/i),
      { target: { value: "orphan, broken" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["completed", "failed", "cancelled"],
      scanKind: ["orphan", "broken"],
      scope: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("single scope passed as scalar", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GraphQualityScansRetentionPanel />);
    fireEvent.change(screen.getByPlaceholderText(/workspace:11/i), {
      target: { value: "workspace:42" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["completed", "failed", "cancelled"],
      scanKind: undefined,
      scope: "workspace:42",
    });
    confirmSpy.mockRestore();
  });

  it("button is disabled when every status is unchecked", () => {
    render(<GraphQualityScansRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((c) => fireEvent.click(c));
    expect(
      screen.getByRole("button", { name: /run sweep now/i }),
    ).toBeDisabled();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GraphQualityScansRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch", () => {
    render(<GraphQualityScansRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({
      deletedScansCount: 3,
      deletedFindingsCount: 9,
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<GraphQualityScansRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<GraphQualityScansRetentionPanel />);
    expect(screen.getByRole("button", { name: /sweeping/i })).toBeInTheDocument();
  });
});
