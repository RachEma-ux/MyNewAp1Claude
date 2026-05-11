/**
 * @vitest-environment jsdom
 *
 * Phase 13 §7 — GraphWorkspacePage host page tests.
 *
 * Mounts all three Graph Workspace panels on a single host page at
 * `/agent-studio/graph-workspace`. The page is purely compositional
 * — these tests confirm each panel renders and the page header is
 * present. Panel-internal behavior is covered by their own tests.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphWorkspacePage from "./GraphWorkspacePage";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      client: {
        agentStudio: {
          graphAgent: {
            exportTraceMarkdown: { query: vi.fn() },
          },
        },
      },
    }),
    agentStudio: {
      graphSkill: {
        listUsageCounts: {
          useQuery: () => ({ isLoading: false, isError: false, data: { rows: [] } }),
        },
      },
      graphAgent: {
        explain: {
          useQuery: () => ({ isLoading: false, isError: false, data: undefined }),
        },
        schemaSummary: {
          useQuery: () => ({ isLoading: false, isError: false, data: undefined }),
        },
      },
    },
  },
}));

describe("GraphWorkspacePage — Phase 13 §7", () => {
  it("renders the page header", () => {
    render(<GraphWorkspacePage />);
    expect(screen.getByText("Graph Workspace")).toBeInTheDocument();
  });

  it("mounts the GraphSkillUsagePanel (Phase 12.5 §9)", () => {
    render(<GraphWorkspacePage />);
    expect(screen.getByText("Graph Skill Pack Usage")).toBeInTheDocument();
  });

  it("mounts the GraphAgentExplainPanel (Phase 13 §5)", () => {
    render(<GraphWorkspacePage />);
    expect(screen.getByText("Why This Answer?")).toBeInTheDocument();
  });

  it("mounts the GraphSchemaSummaryPanel (Phase 13 §6)", () => {
    render(<GraphWorkspacePage />);
    expect(screen.getByText(/Graph Schema/i)).toBeInTheDocument();
  });
});
