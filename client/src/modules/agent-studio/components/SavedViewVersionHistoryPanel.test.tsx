// @vitest-environment jsdom
// SavedViewVersionHistoryPanel — branch coverage tests (16-δ first slice).

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      vault: {
        listSavedViewVersions: {
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
