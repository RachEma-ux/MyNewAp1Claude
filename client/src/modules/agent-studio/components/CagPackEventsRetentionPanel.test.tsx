// @vitest-environment jsdom
// CagPackEventsRetentionPanel — branch coverage tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CagPackEventsRetentionPanel } from "./CagPackEventsRetentionPanel";

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
      cag: {
        getEventsRetentionCronStatus: { useQuery: () => mocks.statusState },
        pruneEventsRetention: {
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
  mocks.statusState.data = undefined;
  mocks.statusState.refetch.mockReset();
  mocks.pruneState.isPending = false;
  mocks.pruneState.mutate.mockReset();
  mocks.pruneState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("CagPackEventsRetentionPanel", () => {
  it("renders the cron status section label", () => {
    render(<CagPackEventsRetentionPanel />);
    expect(screen.getByText(/cag pack events retention cron/i)).toBeInTheDocument();
  });

  it("renders '—' for rows deleted when no status data is present", () => {
    render(<CagPackEventsRetentionPanel />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("default sweep includes only info severity", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CagPackEventsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      eventSeverities: ["info"],
      workspaceId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("ticking warn + error checkboxes adds them to eventSeverities", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CagPackEventsRetentionPanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // warn
    fireEvent.click(checkboxes[2]); // error
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      eventSeverities: ["info", "warn", "error"],
      workspaceId: undefined,
    });
    confirmSpy.mockRestore();
  });

  it("button is disabled when every severity is unchecked", () => {
    render(<CagPackEventsRetentionPanel />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // un-check info
    expect(
      screen.getByRole("button", { name: /run sweep now/i }),
    ).toBeDisabled();
  });

  it("workspaceId CSV parsed into array when multiple", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CagPackEventsRetentionPanel />);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 11, 22/i), {
      target: { value: "11, 22" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).toHaveBeenCalledWith({
      retentionDays: 30,
      eventSeverities: ["info"],
      workspaceId: [11, 22],
    });
    confirmSpy.mockRestore();
  });

  it("confirm-dismiss prevents mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CagPackEventsRetentionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run sweep now/i }));
    expect(mocks.pruneState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess fires toast.success + refetch", () => {
    render(<CagPackEventsRetentionPanel />);
    mocks.pruneState.lastOpts?.onSuccess?.({ deletedCount: 5 });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.statusState.refetch).toHaveBeenCalledOnce();
  });

  it("onError fires toast.error with the message", () => {
    render(<CagPackEventsRetentionPanel />);
    mocks.pruneState.lastOpts?.onError?.({ message: "fail" });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("fail"),
    );
  });

  it("renders 'Sweeping…' while pending", () => {
    mocks.pruneState.isPending = true;
    render(<CagPackEventsRetentionPanel />);
    expect(screen.getByRole("button", { name: /sweeping/i })).toBeInTheDocument();
  });
});
