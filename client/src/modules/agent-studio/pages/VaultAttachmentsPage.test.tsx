// @vitest-environment jsdom
// VaultAttachmentsPage — V1+ 15-δ slice (PR-V1-83) page tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import VaultAttachmentsPage from "./VaultAttachmentsPage";

interface VaultRow {
  readonly id: number;
  readonly name: string;
}

const mocks = vi.hoisted(() => ({
  listMyVaultsState: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as VaultRow[] | undefined,
  },
  quotaUseQuery: vi.fn(),
  listAttachmentsUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      vault: {
        listMyVaults: {
          useQuery: () => mocks.listMyVaultsState,
        },
        getAttachmentQuota: {
          useQuery: mocks.quotaUseQuery,
        },
        listAttachments: {
          useQuery: mocks.listAttachmentsUseQuery,
        },
      },
    },
  },
}));

function resetVaultsState(over: Partial<typeof mocks.listMyVaultsState> = {}) {
  mocks.listMyVaultsState.isLoading = over.isLoading ?? false;
  mocks.listMyVaultsState.error = over.error ?? null;
  mocks.listMyVaultsState.data = over.data;
}

function defaultQuotaState() {
  return {
    isLoading: false,
    error: null,
    data: {
      vaultId: 0,
      bytesUsed: 0,
      bytesLimit: 1000,
      utilization: 0,
      attachmentCount: 0,
      overQuota: false,
    },
  };
}

function defaultListState() {
  return { isLoading: false, error: null, data: [] };
}

describe("VaultAttachmentsPage — vault picker query states", () => {
  beforeEach(() => {
    mocks.quotaUseQuery.mockReset();
    mocks.listAttachmentsUseQuery.mockReset();
    mocks.quotaUseQuery.mockReturnValue(defaultQuotaState());
    mocks.listAttachmentsUseQuery.mockReturnValue(defaultListState());
  });

  it("renders the loading state while vaults are loading", () => {
    resetVaultsState({ isLoading: true });
    render(<VaultAttachmentsPage />);
    expect(screen.getByText(/Loading vaults/i)).toBeTruthy();
    // The admin surface should NOT render yet (no selected vault).
    expect(
      screen.queryByTestId("vault-attachments-admin-surface"),
    ).toBeNull();
  });

  it("renders the error state when listMyVaults fails", () => {
    resetVaultsState({ error: { message: "no asdb" } });
    render(<VaultAttachmentsPage />);
    expect(screen.getByText(/Failed to load vaults/i)).toBeTruthy();
    expect(screen.getByText(/no asdb/)).toBeTruthy();
  });

  it("renders the empty state when the user has no vaults", () => {
    resetVaultsState({ data: [] });
    render(<VaultAttachmentsPage />);
    expect(screen.getByText(/No vaults found/i)).toBeTruthy();
    expect(
      screen.queryByTestId("vault-attachments-admin-surface"),
    ).toBeNull();
  });
});

describe("VaultAttachmentsPage — populated picker + admin surface", () => {
  beforeEach(() => {
    mocks.quotaUseQuery.mockReset();
    mocks.listAttachmentsUseQuery.mockReset();
    mocks.quotaUseQuery.mockReturnValue(defaultQuotaState());
    mocks.listAttachmentsUseQuery.mockReturnValue(defaultListState());
  });

  it("auto-selects the first vault and renders the admin surface", () => {
    resetVaultsState({
      data: [
        { id: 7, name: "Engineering" },
        { id: 11, name: "Marketing" },
      ],
    });
    render(<VaultAttachmentsPage />);
    const surface = screen.getByTestId("vault-attachments-admin-surface");
    expect(surface).toBeTruthy();
    expect(surface.getAttribute("data-vault-id")).toBe("7");
  });

  it("changing the picker selection updates the rendered surface", () => {
    resetVaultsState({
      data: [
        { id: 7, name: "Engineering" },
        { id: 11, name: "Marketing" },
      ],
    });
    render(<VaultAttachmentsPage />);
    const select = screen.getByTestId(
      "vault-attachments-page-vault-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "11" } });
    const surface = screen.getByTestId("vault-attachments-admin-surface");
    expect(surface.getAttribute("data-vault-id")).toBe("11");
  });

  it("dropdown options show 'name (#id)' labels", () => {
    resetVaultsState({
      data: [
        { id: 7, name: "Engineering" },
        { id: 11, name: "Marketing" },
      ],
    });
    render(<VaultAttachmentsPage />);
    expect(screen.getByText("Engineering (#7)")).toBeTruthy();
    expect(screen.getByText("Marketing (#11)")).toBeTruthy();
  });
});
