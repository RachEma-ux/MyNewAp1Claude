// @vitest-environment jsdom
// AttachmentListPanel — branch coverage tests (15-δ first panel slice).

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AttachmentListPanel } from "./AttachmentListPanel";

interface AttachmentRow {
  readonly id: number;
  readonly vaultId: number;
  readonly noteId: number | null;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUri: string;
  readonly contentHash: string;
  readonly createdByUserId: number | null;
  readonly isSourceArtifact: boolean;
  readonly createdAt: Date;
}

const mocks = vi.hoisted(() => ({
  queryState: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as AttachmentRow[] | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      vault: {
        listAttachments: {
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

describe("AttachmentListPanel — input-guard branch", () => {
  it("renders an error card when neither vaultId nor noteId is supplied", () => {
    resetState();
    render(<AttachmentListPanel />);
    expect(
      screen.getByText(/requires either/i),
    ).toBeTruthy();
  });
});

describe("AttachmentListPanel — query state branches", () => {
  it("renders the loading state when isLoading=true", () => {
    resetState({ isLoading: true });
    render(<AttachmentListPanel vaultId={7} />);
    expect(screen.getByText(/Loading attachments/i)).toBeTruthy();
  });

  it("renders the error state when the query fails", () => {
    resetState({ error: { message: "boom" } });
    render(<AttachmentListPanel vaultId={7} />);
    expect(screen.getByText(/Failed to load attachments/i)).toBeTruthy();
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  it("renders the empty state when there are no attachments", () => {
    resetState({ data: [] });
    render(<AttachmentListPanel vaultId={7} />);
    expect(screen.getByText(/No attachments/i)).toBeTruthy();
  });
});

describe("AttachmentListPanel — populated rendering", () => {
  it("renders one row per attachment with filename + mimeType + formatted size", () => {
    resetState({
      data: [
        {
          id: 1,
          vaultId: 7,
          noteId: null,
          filename: "diagram.png",
          mimeType: "image/png",
          sizeBytes: 2048,
          storageUri: "s3://x/y",
          contentHash: "abc",
          createdByUserId: 42,
          isSourceArtifact: false,
          createdAt: new Date("2026-05-13T12:00:00Z"),
        },
        {
          id: 2,
          vaultId: 7,
          noteId: 99,
          filename: "raw-export.csv",
          mimeType: "text/csv",
          sizeBytes: 5_242_880,
          storageUri: "s3://x/z",
          contentHash: "def",
          createdByUserId: null,
          isSourceArtifact: true,
          createdAt: new Date("2026-05-14T12:00:00Z"),
        },
      ],
    });
    render(<AttachmentListPanel vaultId={7} />);
    const rows = screen.getAllByTestId("attachment-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("diagram.png")).toBeTruthy();
    expect(screen.getByText("raw-export.csv")).toBeTruthy();
    // 2048 → "2.0 KiB"
    expect(screen.getByText(/2\.0 KiB/)).toBeTruthy();
    // 5 MiB → "5.0 MiB"
    expect(screen.getByText(/5\.0 MiB/)).toBeTruthy();
    // Source-artifact badge appears for row 2 only.
    const badges = screen.getAllByTestId("attachment-source-artifact-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toMatch(/source artifact/);
  });

  it("formats sub-1KiB sizes in bytes", () => {
    resetState({
      data: [
        {
          id: 1,
          vaultId: 7,
          noteId: null,
          filename: "tiny.txt",
          mimeType: "text/plain",
          sizeBytes: 17,
          storageUri: "s3://x/y",
          contentHash: "abc",
          createdByUserId: null,
          isSourceArtifact: false,
          createdAt: new Date(),
        },
      ],
    });
    render(<AttachmentListPanel vaultId={7} />);
    expect(screen.getByText(/17 B/)).toBeTruthy();
  });
});
