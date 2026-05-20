// @vitest-environment jsdom
// SavedViewVersionHistoryPanel — branch coverage tests.
// 16-δ first slice + no-deferral continuation-11 slice 66 (Restore).

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SavedViewVersionHistoryPanel } from "./SavedViewVersionHistoryPanel";

interface SavedViewVersionRow {
  readonly id: number;
  readonly savedViewId: number;
  readonly version: number;
  readonly name: string;
  readonly viewKind: string;
  readonly filters: unknown;
  readonly sort: unknown;
  readonly columns: unknown;
  readonly visibility: string;
  readonly capturedByUserId: number | null;
  readonly capturedAt: Date;
}

const mocks = vi.hoisted(() => ({
  queryState: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as SavedViewVersionRow[] | undefined,
  },
  restoreMut: {
    mutate: vi.fn<(input: { versionId: number }) => void>(),
    isPending: false,
  },
  // useUtils() returns this object — invalidate calls are spied
  // so the test can assert cache invalidation on success.
  utils: {
    agentStudio: {
      vault: {
        listSavedViewVersions: { invalidate: vi.fn() },
        listVisibleSavedViews: { invalidate: vi.fn() },
      },
    },
  },
  // Captured callbacks supplied by the panel; the test triggers them.
  restoreCallbacks: {
    onSuccess: null as (() => void) | null,
    onError: null as ((err: { message: string }) => void) | null,
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      vault: {
        listSavedViewVersions: {
          useQuery: () => mocks.queryState,
        },
        restoreSavedViewVersion: {
          useMutation: (opts?: {
            onSuccess?: () => void;
            onError?: (err: { message: string }) => void;
          }) => {
            mocks.restoreCallbacks.onSuccess = opts?.onSuccess ?? null;
            mocks.restoreCallbacks.onError = opts?.onError ?? null;
            return mocks.restoreMut;
          },
        },
      },
    },
    useUtils: () => mocks.utils,
  },
}));

function resetState(over: Partial<typeof mocks.queryState> = {}) {
  mocks.queryState.isLoading = over.isLoading ?? false;
  mocks.queryState.error = over.error ?? null;
  mocks.queryState.data = over.data;
}

beforeEach(() => {
  mocks.restoreMut.mutate.mockReset();
  mocks.restoreMut.isPending = false;
  mocks.utils.agentStudio.vault.listSavedViewVersions.invalidate.mockReset();
  mocks.utils.agentStudio.vault.listVisibleSavedViews.invalidate.mockReset();
  mocks.restoreCallbacks.onSuccess = null;
  mocks.restoreCallbacks.onError = null;
});

describe("SavedViewVersionHistoryPanel", () => {
  it("renders the loading state when isLoading=true", () => {
    resetState({ isLoading: true });
    render(<SavedViewVersionHistoryPanel savedViewId={7} />);
    expect(screen.getByText(/Loading versions/i)).toBeTruthy();
  });

  it("renders the error state when the query fails", () => {
    resetState({ error: { message: "boom" } });
    render(<SavedViewVersionHistoryPanel savedViewId={7} />);
    expect(screen.getByText(/Failed to load history/i)).toBeTruthy();
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  it("renders the empty state when there are no versions", () => {
    resetState({ data: [] });
    render(<SavedViewVersionHistoryPanel savedViewId={7} />);
    expect(screen.getByText(/No prior versions/i)).toBeTruthy();
  });

  it("renders one row per version with version number + name + capturedByUserId", () => {
    resetState({
      data: [
        {
          id: 100,
          savedViewId: 7,
          version: 2,
          name: "Second draft",
          viewKind: "kanban",
          filters: {},
          sort: {},
          columns: [],
          visibility: "personal",
          capturedByUserId: 42,
          capturedAt: new Date("2026-05-13T12:00:00Z"),
        },
        {
          id: 101,
          savedViewId: 7,
          version: 1,
          name: "First draft",
          viewKind: "kanban",
          filters: {},
          sort: {},
          columns: [],
          visibility: "personal",
          capturedByUserId: null,
          capturedAt: new Date("2026-05-12T12:00:00Z"),
        },
      ],
    });
    render(<SavedViewVersionHistoryPanel savedViewId={7} />);
    const rows = screen.getAllByTestId("saved-view-version-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText(/v2 — Second draft/)).toBeTruthy();
    expect(screen.getByText(/v1 — First draft/)).toBeTruthy();
    expect(screen.getByText(/Captured by user #42/)).toBeTruthy();
    // null capturedByUserId → "Captured by" line is NOT rendered for that row.
    expect(screen.queryByText(/Captured by user #null/)).toBeNull();
  });
});

describe("SavedViewVersionHistoryPanel — Restore button (slice 66)", () => {
  function setupTwoRowFixture() {
    resetState({
      data: [
        {
          id: 100,
          savedViewId: 7,
          version: 2,
          name: "Second draft",
          viewKind: "kanban",
          filters: {},
          sort: {},
          columns: [],
          visibility: "personal",
          capturedByUserId: 42,
          capturedAt: new Date("2026-05-13T12:00:00Z"),
        },
      ],
    });
  }

  it("renders a Restore button on each version row", () => {
    setupTwoRowFixture();
    render(<SavedViewVersionHistoryPanel savedViewId={7} />);
    expect(
      screen.getAllByTestId("saved-view-version-restore-button").length,
    ).toBe(1);
    expect(screen.getByRole("button", { name: /Restore/ })).toBeTruthy();
  });

  it("clicking Restore + confirming triggers the mutation with the versionId", () => {
    setupTwoRowFixture();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => true);
    render(<SavedViewVersionHistoryPanel savedViewId={7} />);
    fireEvent.click(
      screen.getByTestId("saved-view-version-restore-button"),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(mocks.restoreMut.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.restoreMut.mutate.mock.calls[0]?.[0]).toEqual({
      versionId: 100,
    });
    confirmSpy.mockRestore();
  });

  it("clicking Restore + cancelling does NOT trigger the mutation", () => {
    setupTwoRowFixture();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => false);
    render(<SavedViewVersionHistoryPanel savedViewId={7} />);
    fireEvent.click(
      screen.getByTestId("saved-view-version-restore-button"),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(mocks.restoreMut.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("onSuccess invalidates BOTH listSavedViewVersions + listVisibleSavedViews", () => {
    setupTwoRowFixture();
    render(<SavedViewVersionHistoryPanel savedViewId={7} />);
    // The component's `useMutation` registration captured the
    // onSuccess callback into mocks.restoreCallbacks during render.
    expect(mocks.restoreCallbacks.onSuccess).not.toBeNull();
    mocks.restoreCallbacks.onSuccess?.();
    expect(
      mocks.utils.agentStudio.vault.listSavedViewVersions.invalidate,
    ).toHaveBeenCalledWith({ savedViewId: 7 });
    expect(
      mocks.utils.agentStudio.vault.listVisibleSavedViews.invalidate,
    ).toHaveBeenCalledTimes(1);
  });

  it("Restore button is disabled while a restore is in flight", () => {
    setupTwoRowFixture();
    mocks.restoreMut.isPending = true;
    render(<SavedViewVersionHistoryPanel savedViewId={7} />);
    const btn = screen.getByTestId(
      "saved-view-version-restore-button",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
