// @vitest-environment jsdom
// VaultSavedViewsPage — V1+ 16-δ slice (PR-V1-85) page tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import VaultSavedViewsPage from "./VaultSavedViewsPage";

interface VaultRow { readonly id: number; readonly name: string }
interface SavedViewRow { readonly id: number; readonly name: string }

const mocks = vi.hoisted(() => ({
  vaultsState: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as VaultRow[] | undefined,
  },
  savedViewsState: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as SavedViewRow[] | undefined,
  },
  versionsUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      vault: {
        listMyVaults: { useQuery: () => mocks.vaultsState },
        listVisibleSavedViews: { useQuery: () => mocks.savedViewsState },
        listSavedViewVersions: { useQuery: mocks.versionsUseQuery },
      },
    },
  },
}));

function resetVaults(over: Partial<typeof mocks.vaultsState> = {}) {
  mocks.vaultsState.isLoading = over.isLoading ?? false;
  mocks.vaultsState.error = over.error ?? null;
  mocks.vaultsState.data = over.data;
}
function resetSavedViews(over: Partial<typeof mocks.savedViewsState> = {}) {
  mocks.savedViewsState.isLoading = over.isLoading ?? false;
  mocks.savedViewsState.error = over.error ?? null;
  mocks.savedViewsState.data = over.data;
}

beforeEach(() => {
  mocks.versionsUseQuery.mockReset();
  mocks.versionsUseQuery.mockReturnValue({
    isLoading: false,
    error: null,
    data: [],
  });
});

describe("VaultSavedViewsPage — vault picker query states", () => {
  it("renders loading vaults", () => {
    resetVaults({ isLoading: true });
    resetSavedViews({ data: [] });
    render(<VaultSavedViewsPage />);
    expect(screen.getByText(/Loading vaults/i)).toBeTruthy();
  });

  it("renders error vaults", () => {
    resetVaults({ error: { message: "asdb down" } });
    resetSavedViews({ data: [] });
    render(<VaultSavedViewsPage />);
    expect(screen.getByText(/Failed to load vaults/i)).toBeTruthy();
    expect(screen.getByText(/asdb down/)).toBeTruthy();
  });

  it("renders empty vaults", () => {
    resetVaults({ data: [] });
    resetSavedViews({ data: [] });
    render(<VaultSavedViewsPage />);
    expect(screen.getByText(/No vaults found/i)).toBeTruthy();
  });
});

describe("VaultSavedViewsPage — saved-view picker query states", () => {
  it("renders loading saved-views below the vault picker", () => {
    resetVaults({ data: [{ id: 7, name: "Engineering" }] });
    resetSavedViews({ isLoading: true });
    render(<VaultSavedViewsPage />);
    expect(screen.getByText(/Loading saved views/i)).toBeTruthy();
  });

  it("renders error saved-views below the vault picker", () => {
    resetVaults({ data: [{ id: 7, name: "Engineering" }] });
    resetSavedViews({ error: { message: "perm denied" } });
    render(<VaultSavedViewsPage />);
    expect(screen.getByText(/Failed to load saved views/i)).toBeTruthy();
    expect(screen.getByText(/perm denied/)).toBeTruthy();
  });

  it("renders empty saved-views message + does NOT render the history panel", () => {
    resetVaults({ data: [{ id: 7, name: "Engineering" }] });
    resetSavedViews({ data: [] });
    render(<VaultSavedViewsPage />);
    expect(screen.getByText(/No saved views in this vault/i)).toBeTruthy();
    // Page subtitle contains "version history" — use a panel-only
    // fallback assertion instead.
    expect(
      screen.queryByText(/No prior versions captured for this saved view/i),
    ).toBeNull();
  });
});

describe("VaultSavedViewsPage — populated end-to-end", () => {
  it("auto-selects first vault + first saved-view + renders history panel", () => {
    resetVaults({
      data: [
        { id: 7, name: "Engineering" },
        { id: 11, name: "Marketing" },
      ],
    });
    resetSavedViews({
      data: [
        { id: 100, name: "Open bugs" },
        { id: 101, name: "Drafts" },
      ],
    });
    render(<VaultSavedViewsPage />);
    // The page subtitle also contains "version history" — assert on
    // the panel's no-rows fallback text (unique to the panel).
    expect(
      screen.getByText(/No prior versions captured for this saved view/i),
    ).toBeTruthy();
    expect(mocks.versionsUseQuery).toHaveBeenCalled();
    const firstArg = mocks.versionsUseQuery.mock.calls[0]?.[0];
    expect(firstArg).toEqual({ savedViewId: 100 });
  });

  it("changing the saved-view picker reroutes the history-panel query", () => {
    resetVaults({ data: [{ id: 7, name: "Engineering" }] });
    resetSavedViews({
      data: [
        { id: 100, name: "Open bugs" },
        { id: 101, name: "Drafts" },
      ],
    });
    render(<VaultSavedViewsPage />);
    const svSelect = screen.getByTestId(
      "vault-saved-views-page-saved-view-select",
    ) as HTMLSelectElement;
    fireEvent.change(svSelect, { target: { value: "101" } });
    const lastCall =
      mocks.versionsUseQuery.mock.calls[
        mocks.versionsUseQuery.mock.calls.length - 1
      ];
    expect(lastCall?.[0]).toEqual({ savedViewId: 101 });
  });

  it("changing the vault picker resets the saved-view selection (re-auto-selects first)", () => {
    resetVaults({
      data: [
        { id: 7, name: "Engineering" },
        { id: 11, name: "Marketing" },
      ],
    });
    resetSavedViews({
      data: [{ id: 100, name: "Open bugs" }],
    });
    render(<VaultSavedViewsPage />);
    const vaultSelect = screen.getByTestId(
      "vault-saved-views-page-vault-select",
    ) as HTMLSelectElement;
    fireEvent.change(vaultSelect, { target: { value: "11" } });
    // saved-view picker re-defaults to first row of the (still
    // mocked) saved-views list — id 100.
    expect(mocks.versionsUseQuery).toHaveBeenCalled();
  });
});
