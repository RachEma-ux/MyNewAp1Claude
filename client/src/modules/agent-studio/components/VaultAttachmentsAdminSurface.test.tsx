// @vitest-environment jsdom
// VaultAttachmentsAdminSurface — composition tests (15-δ slice
// PR-V1-66).
//
// Verifies the composition shell mounts both child panels and
// forwards the vaultId / listLimit props correctly. The child panels
// own their own tRPC queries — both are mocked at the trpc module
// boundary so the composition can be tested without spinning up the
// providers.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { VaultAttachmentsAdminSurface } from "./VaultAttachmentsAdminSurface";

const mocks = vi.hoisted(() => ({
  quotaUseQuery: vi.fn(),
  listUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      vault: {
        getAttachmentQuota: {
          useQuery: mocks.quotaUseQuery,
        },
        listAttachments: {
          useQuery: mocks.listUseQuery,
        },
      },
    },
  },
}));

function defaultQuotaState() {
  return {
    isLoading: false,
    error: null as { message: string } | null,
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
  return {
    isLoading: false,
    error: null as { message: string } | null,
    data: [] as unknown[],
  };
}

describe("VaultAttachmentsAdminSurface — composition", () => {
  beforeEach(() => {
    mocks.quotaUseQuery.mockReset();
    mocks.listUseQuery.mockReset();
  });

  it("renders a single composition wrapper with the vaultId attribute", () => {
    mocks.quotaUseQuery.mockReturnValue(defaultQuotaState());
    mocks.listUseQuery.mockReturnValue(defaultListState());

    render(<VaultAttachmentsAdminSurface vaultId={42} />);

    const surface = screen.getByTestId("vault-attachments-admin-surface");
    expect(surface).toBeTruthy();
    expect(surface.getAttribute("data-vault-id")).toBe("42");
  });

  it("renders both child panels (quota + list) inside the composition", () => {
    mocks.quotaUseQuery.mockReturnValue(defaultQuotaState());
    mocks.listUseQuery.mockReturnValue(defaultListState());

    render(<VaultAttachmentsAdminSurface vaultId={42} />);

    // Quota panel's section label
    expect(screen.getByText(/Attachment storage quota/i)).toBeTruthy();
    // List panel's section label
    expect(screen.getByText(/^Attachments$/i)).toBeTruthy();
  });

  it("forwards vaultId to the quota panel useQuery", () => {
    mocks.quotaUseQuery.mockReturnValue(defaultQuotaState());
    mocks.listUseQuery.mockReturnValue(defaultListState());

    render(<VaultAttachmentsAdminSurface vaultId={123} />);

    expect(mocks.quotaUseQuery).toHaveBeenCalled();
    const firstArg = mocks.quotaUseQuery.mock.calls[0]?.[0];
    expect(firstArg).toEqual({ vaultId: 123 });
  });

  it("forwards vaultId (and optional listLimit) to the list panel useQuery", () => {
    mocks.quotaUseQuery.mockReturnValue(defaultQuotaState());
    mocks.listUseQuery.mockReturnValue(defaultListState());

    render(<VaultAttachmentsAdminSurface vaultId={123} listLimit={50} />);

    expect(mocks.listUseQuery).toHaveBeenCalled();
    const firstArg = mocks.listUseQuery.mock.calls[0]?.[0];
    expect(firstArg?.vaultId).toBe(123);
    expect(firstArg?.limit).toBe(50);
  });

  it("renders the over-quota and empty-list states together when both apply", () => {
    mocks.quotaUseQuery.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        vaultId: 7,
        bytesUsed: 2000,
        bytesLimit: 1000,
        utilization: 2,
        attachmentCount: 0,
        overQuota: true,
      },
    });
    mocks.listUseQuery.mockReturnValue({
      isLoading: false,
      error: null,
      data: [],
    });

    render(<VaultAttachmentsAdminSurface vaultId={7} />);

    // Over-quota row from the quota panel
    expect(screen.getByTestId("quota-over")).toBeTruthy();
    // Empty state from the list panel
    expect(screen.getByText(/No attachments/i)).toBeTruthy();
  });
});
