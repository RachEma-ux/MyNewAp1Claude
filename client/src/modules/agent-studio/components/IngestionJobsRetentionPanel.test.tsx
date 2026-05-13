// @vitest-environment jsdom
// IngestionJobsRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { IngestionJobsRetentionPanel } from "./IngestionJobsRetentionPanel";

interface CronStatusData {
  lastRunAt?: Date | string | null;
  lastError?: string | null;
  lastResult?: { deletedJobsCount: number };
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
      onSuccess?: (d: { deletedJobsCount: number }) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      ingestion: {
        getJobsRetentionCronStatus: {
          useQuery: () => mocks.statusState,
        },
        pruneJobsRetention: {
          useMutation: (opts: {
            onSuccess?: (d: { deletedJobsCount: number }) => void;
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

describe("IngestionJobsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<IngestionJobsRetentionPanel />);
    expect(
      screen.getByText(/ingestion jobs retention cron/i),
    ).toBeInTheDocument();
  });

  it("renders 'never' + a single '—' placeholder when no status data is present", () => {
    render(<IngestionJobsRetentionPanel />);
    expect(screen.getByText("never")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("default sweep includes all three terminal statuses + undefined scopes", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<IngestionJobsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["succeeded", "failed", "unsupported_type"],
      workspaceId: undefined,
      sourceConnectorKey: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("workspaceId + connectorKey single values are passed as scalars", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<IngestionJobsRetentionPanel />);
    fireEvent.change(screen.getByPlaceholderText(/11, 22/i), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByPlaceholderText(/s3, gdrive/i), {
      target: { value: "s3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["succeeded", "failed", "unsupported_type"],
      workspaceId: 11,
      sourceConnectorKey: "s3",
    });
    confirmSpy.mockRestore();
  });

  it("workspaceId CSV with multiple values passes as array", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<IngestionJobsRetentionPanel />);
    fireEvent.change(screen.getByPlaceholderText(/11, 22/i), {
      target: { value: "11, 22, 33" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      statuses: ["succeeded", "failed", "unsupported_type"],
      workspaceId: [11, 22, 33],
      sourceConnectorKey: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("button is disabled when every status is unchecked", () => {
    render(<IngestionJobsRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((c) => fireEvent.click(c));
    expect(
      screen.getByRole("button", { name: /run sweep now/i }),
    ).toBeDisabled();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<IngestionJobsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch", () => {
    render(<IngestionJobsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({ deletedJobsCount: 7 });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error", () => {
    render(<IngestionJobsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<IngestionJobsRetentionPanel />);
    expect(
      screen.getByRole("button", { name: /sweeping/i }),
    ).toBeInTheDocument();
  });
});
