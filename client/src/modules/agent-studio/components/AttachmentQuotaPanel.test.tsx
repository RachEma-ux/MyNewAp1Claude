// @vitest-environment jsdom
// AttachmentQuotaPanel — branch coverage tests (15-δ third panel
// slice, PR-V1-65).
//
// Verifies all six rendering branches drive off the same data shape
// the `agentStudio.vault.getAttachmentQuota` procedure returns: a
// `{vaultId, bytesUsed, bytesLimit, utilization, attachmentCount,
//  overQuota}` record. Pattern mirrors AttachmentListPanel.test.tsx.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AttachmentQuotaPanel } from "./AttachmentQuotaPanel";

interface QuotaRow {
  readonly vaultId: number;
  readonly bytesUsed: number;
  readonly bytesLimit: number | null;
  readonly utilization: number | null;
  readonly attachmentCount: number;
  readonly overQuota: boolean;
}

const mocks = vi.hoisted(() => ({
  queryState: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as QuotaRow | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      vault: {
        getAttachmentQuota: {
          useQuery: () => mocks.queryState,
        },
      },
    },
  },
}));

function resetState(over: Partial<typeof mocks.queryState> = {}) {
  mocks.queryState.isLoading = over.isLoading ?? false;
  mocks.queryState.error = over.error ?? null;
  mocks.queryState.data = over.data;
}

describe("AttachmentQuotaPanel — query state branches", () => {
  it("renders loading state when isLoading=true", () => {
    resetState({ isLoading: true });
    render(<AttachmentQuotaPanel vaultId={7} />);
    expect(screen.getByText(/Loading quota/i)).toBeTruthy();
  });

  it("renders error state when the query fails", () => {
    resetState({ error: { message: "boom" } });
    render(<AttachmentQuotaPanel vaultId={7} />);
    expect(screen.getByText(/Failed to load quota/i)).toBeTruthy();
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  it("renders fallback when data is null/undefined", () => {
    resetState({ data: undefined });
    render(<AttachmentQuotaPanel vaultId={7} />);
    expect(screen.getByText(/No quota data/i)).toBeTruthy();
  });
});

describe("AttachmentQuotaPanel — quota branches", () => {
  it("renders the no-limit branch when bytesLimit is null", () => {
    resetState({
      data: {
        vaultId: 7,
        bytesUsed: 5_242_880,
        bytesLimit: null,
        utilization: null,
        attachmentCount: 3,
        overQuota: false,
      },
    });
    render(<AttachmentQuotaPanel vaultId={7} />);
    expect(screen.getByTestId("quota-no-limit")).toBeTruthy();
    expect(screen.getByText(/5\.0 MiB/)).toBeTruthy();
    expect(screen.getByText(/3 attachments/)).toBeTruthy();
  });

  it("renders the over-quota branch when overQuota=true", () => {
    resetState({
      data: {
        vaultId: 7,
        bytesUsed: 1024 * 1024 * 1024 * 2,
        bytesLimit: 1024 * 1024 * 1024,
        utilization: 2,
        attachmentCount: 5,
        overQuota: true,
      },
    });
    render(<AttachmentQuotaPanel vaultId={7} />);
    expect(screen.getByTestId("quota-over")).toBeTruthy();
    expect(screen.getByText(/Over quota/i)).toBeTruthy();
    expect(screen.getByText(/200\.0%/)).toBeTruthy();
    expect(
      screen.getByText(/new uploads will be rejected/i),
    ).toBeTruthy();
  });

  it("renders the approaching-quota branch when utilization > 0.8", () => {
    resetState({
      data: {
        vaultId: 7,
        bytesUsed: 900,
        bytesLimit: 1000,
        utilization: 0.9,
        attachmentCount: 2,
        overQuota: false,
      },
    });
    render(<AttachmentQuotaPanel vaultId={7} />);
    expect(screen.getByTestId("quota-approaching")).toBeTruthy();
    expect(screen.getByText(/Approaching quota/i)).toBeTruthy();
    expect(screen.getByText(/90\.0%/)).toBeTruthy();
  });

  it("renders the under-quota branch when utilization ≤ 0.8", () => {
    resetState({
      data: {
        vaultId: 7,
        bytesUsed: 500,
        bytesLimit: 1000,
        utilization: 0.5,
        attachmentCount: 1,
        overQuota: false,
      },
    });
    render(<AttachmentQuotaPanel vaultId={7} />);
    expect(screen.getByTestId("quota-under")).toBeTruthy();
    expect(screen.getByText(/50\.0%/)).toBeTruthy();
    expect(screen.getByText(/1 attachment$/)).toBeTruthy();
  });

  it("uses the singular 'attachment' form when count === 1", () => {
    resetState({
      data: {
        vaultId: 7,
        bytesUsed: 100,
        bytesLimit: 1000,
        utilization: 0.1,
        attachmentCount: 1,
        overQuota: false,
      },
    });
    render(<AttachmentQuotaPanel vaultId={7} />);
    expect(screen.getByText(/1 attachment$/)).toBeTruthy();
  });

  it("uses the plural 'attachments' form when count > 1 in the no-limit branch", () => {
    resetState({
      data: {
        vaultId: 7,
        bytesUsed: 0,
        bytesLimit: null,
        utilization: null,
        attachmentCount: 4,
        overQuota: false,
      },
    });
    render(<AttachmentQuotaPanel vaultId={7} />);
    expect(screen.getByText(/4 attachments/)).toBeTruthy();
  });
});
