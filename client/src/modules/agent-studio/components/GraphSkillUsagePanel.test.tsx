/**
 * @vitest-environment jsdom
 *
 * Phase 12.5 §9 — GraphSkillUsagePanel component tests.
 *
 * Covers the rendering branches of the panel against a mocked
 * `agentStudio.graphSkill.listUsageCounts` tRPC query (the §8
 * procedure shipped in PR #427):
 *
 *   - Loading state
 *   - Error state with surfaced message
 *   - Empty state (no rows in window)
 *   - Row rendering with skillKey + version badge + count + relative
 *     "latest used" timestamp
 *   - Window selector default (7 days) flowing into the query input
 *   - Filter input flowing into the query input with trim
 *   - Total-calls aggregate sums row counts correctly
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import GraphSkillUsagePanel from "./GraphSkillUsagePanel";

interface UsageRow {
  skillKey: string;
  packId: number;
  packVersionId: number;
  version: string;
  count: number;
  latestUsedAt: Date | null;
}

const mocks = vi.hoisted(() => ({
  lastQueryInput: undefined as unknown,
  state: {
    isLoading: false,
    isError: false,
    error: null as { message: string } | null,
    data: undefined as { rows: UsageRow[] } | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      graphSkill: {
        listUsageCounts: {
          useQuery: (input: unknown) => {
            mocks.lastQueryInput = input;
            return mocks.state;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.lastQueryInput = undefined;
  mocks.state.isLoading = false;
  mocks.state.isError = false;
  mocks.state.error = null;
  mocks.state.data = undefined;
});

describe("GraphSkillUsagePanel — Phase 12.5 §9", () => {
  it("renders the loading state while the query is fetching", () => {
    mocks.state.isLoading = true;
    render(<GraphSkillUsagePanel />);
    expect(screen.getByText(/loading usage counts/i)).toBeInTheDocument();
  });

  it("renders the error state with the surfaced message", () => {
    mocks.state.isError = true;
    mocks.state.error = { message: "ASDB unreachable" };
    render(<GraphSkillUsagePanel />);
    expect(screen.getByText(/failed to load usage counts/i)).toBeInTheDocument();
    expect(screen.getByText(/ASDB unreachable/)).toBeInTheDocument();
  });

  it("renders the empty state when the query returns zero rows", () => {
    mocks.state.data = { rows: [] };
    render(<GraphSkillUsagePanel />);
    expect(
      screen.getByText(/no usage rows in this window/i),
    ).toBeInTheDocument();
  });

  it("renders rows with skillKey, version badge, and count", () => {
    mocks.state.data = {
      rows: [
        {
          skillKey: "pack-a",
          packId: 1,
          packVersionId: 7,
          version: "1.0.0",
          count: 42,
          latestUsedAt: new Date(Date.now() - 5 * 60_000),
        },
        {
          skillKey: "pack-b",
          packId: 2,
          packVersionId: 11,
          version: "0.9.3",
          count: 5,
          latestUsedAt: null,
        },
      ],
    };
    render(<GraphSkillUsagePanel />);
    expect(screen.getByText("pack-a")).toBeInTheDocument();
    expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("pack-b")).toBeInTheDocument();
    expect(screen.getByText("v0.9.3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("aggregates total calls across all rows", () => {
    mocks.state.data = {
      rows: [
        {
          skillKey: "pack-a",
          packId: 1,
          packVersionId: 7,
          version: "1.0.0",
          count: 42,
          latestUsedAt: null,
        },
        {
          skillKey: "pack-b",
          packId: 2,
          packVersionId: 11,
          version: "0.9.3",
          count: 5,
          latestUsedAt: null,
        },
      ],
    };
    render(<GraphSkillUsagePanel />);
    // 42 + 5 = 47 — rendered as `47` via toLocaleString
    expect(screen.getByText("47")).toBeInTheDocument();
  });

  it("passes the default 7-day window to the query on initial render", () => {
    mocks.state.data = { rows: [] };
    render(<GraphSkillUsagePanel />);
    const input = mocks.lastQueryInput as {
      sinceMs?: number;
      skillKey?: string;
    };
    expect(input.sinceMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(input.skillKey).toBeUndefined();
  });

  it("passes a trimmed skillKey filter to the query when the input is populated", async () => {
    mocks.state.data = { rows: [] };
    render(<GraphSkillUsagePanel />);
    const filterInput = screen.getByPlaceholderText(
      /\(all packs\)/i,
    ) as HTMLInputElement;
    fireEvent.change(filterInput, { target: { value: "  pack-a  " } });
    await waitFor(() => {
      const input = mocks.lastQueryInput as {
        sinceMs?: number;
        skillKey?: string;
      };
      expect(input.skillKey).toBe("pack-a");
    });
  });

  it("does not send skillKey on the query when filter input is whitespace only", async () => {
    mocks.state.data = { rows: [] };
    render(<GraphSkillUsagePanel />);
    const filterInput = screen.getByPlaceholderText(
      /\(all packs\)/i,
    ) as HTMLInputElement;
    fireEvent.change(filterInput, { target: { value: "   " } });
    await waitFor(() => {
      const input = mocks.lastQueryInput as {
        sinceMs?: number;
        skillKey?: string;
      };
      expect(input.skillKey).toBeUndefined();
    });
  });
});
