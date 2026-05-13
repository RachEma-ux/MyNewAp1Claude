// @vitest-environment jsdom
//
// CatalogSyncLogRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CatalogSyncLogRetentionPanel } from "./CatalogSyncLogRetentionPanel";

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
      catalogSyncLog: {
        getRetentionCronStatus: { useQuery: () => mocks.statusState },
        pruneRetention: {
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

describe("CatalogSyncLogRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<CatalogSyncLogRetentionPanel />);
    expect(screen.getByText(/catalog sync log retention cron/i)).toBeInTheDocument();
  });

  it("renders '—' when no status data is present", () => {
    render(<CatalogSyncLogRetentionPanel />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("surfaces lastResult.deletedCount", () => {
    mocks.statusState.data = {
      lastRunAt: new Date("2026-05-13T07:00:00Z"),
      lastResult: { deletedCount: 88 },
    };
    render(<CatalogSyncLogRetentionPanel />);
    expect(screen.getByText("88")).toBeInTheDocument();
  });

  it("default selection includes registered + published, excludes deprecated", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CatalogSyncLogRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      eventTypes: [
        "aiTypes.catalog.registered",
        "aiTypes.catalog.published",
      ],
    });
    confirmSpy.mockRestore();
  });

  it("ticking the deprecated checkbox adds it to the eventTypes payload", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CatalogSyncLogRetentionPanel />);
    // Last checkbox is deprecated.
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[checkboxes.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      eventTypes: [
        "aiTypes.catalog.registered",
        "aiTypes.catalog.published",
        "aiTypes.catalog.deprecated",
      ],
    });
    confirmSpy.mockRestore();
  });

  it("button is disabled when every checkbox is unchecked", () => {
    render(<CatalogSyncLogRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    // checkboxes[2] (deprecated) starts unchecked; now all three are unchecked.
    const btn = screen.getByRole("button", { name: /run sweep now/i });
    expect(btn).toBeDisabled();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CatalogSyncLogRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch + sets manualResult", () => {
    render(<CatalogSyncLogRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({ deletedCount: 12 });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error with the message", () => {
    render(<CatalogSyncLogRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "fail" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("fail"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<CatalogSyncLogRetentionPanel />);
    expect(screen.getByRole("button", { name: /sweeping/i })).toBeInTheDocument();
  });
});
