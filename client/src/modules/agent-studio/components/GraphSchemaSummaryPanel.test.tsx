/**
 * @vitest-environment jsdom
 *
 * Phase 13 §6 — GraphSchemaSummaryPanel component tests.
 *
 * Covers rendering branches against a mocked
 * `agentStudio.graphAgent.schemaSummary` tRPC query.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphSchemaSummaryPanel from "./GraphSchemaSummaryPanel";

interface SummaryShape {
  nodeTypes: Array<{
    typeKey: string;
    displayName: string;
    description: string | null;
    category: string | null;
  }>;
  edgeTypes: Array<{
    typeKey: string;
    displayName: string;
    description: string | null;
    sourceNodeTypeKeys: string[];
    targetNodeTypeKeys: string[];
    cardinality: string | null;
    isDirected: boolean;
  }>;
  nodeTypeCountTotal: number;
  edgeTypeCountTotal: number;
  truncated: boolean;
}

const mocks = vi.hoisted(() => ({
  state: {
    isLoading: false,
    isError: false,
    error: null as { message: string } | null,
    data: undefined as SummaryShape | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      graphAgent: {
        schemaSummary: {
          useQuery: () => mocks.state,
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.state.isLoading = false;
  mocks.state.isError = false;
  mocks.state.error = null;
  mocks.state.data = undefined;
});

describe("GraphSchemaSummaryPanel — Phase 13 §6", () => {
  it("renders the loading state while the query is fetching", () => {
    mocks.state.isLoading = true;
    render(<GraphSchemaSummaryPanel />);
    expect(screen.getByText(/loading ontology/i)).toBeInTheDocument();
  });

  it("renders the error state with the surfaced message", () => {
    mocks.state.isError = true;
    mocks.state.error = { message: "ASDB unreachable" };
    render(<GraphSchemaSummaryPanel />);
    expect(
      screen.getByText(/failed to load schema summary/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/ASDB unreachable/)).toBeInTheDocument();
  });

  it("renders the empty state when ontology is empty", () => {
    mocks.state.data = {
      nodeTypes: [],
      edgeTypes: [],
      nodeTypeCountTotal: 0,
      edgeTypeCountTotal: 0,
      truncated: false,
    };
    render(<GraphSchemaSummaryPanel />);
    expect(screen.getByText(/no ontology registered/i)).toBeInTheDocument();
  });

  it("renders node types with typeKey, displayName, category, description", () => {
    mocks.state.data = {
      nodeTypes: [
        {
          typeKey: "Note",
          displayName: "Vault Note",
          description: "A markdown note",
          category: "knowledge",
        },
      ],
      edgeTypes: [],
      nodeTypeCountTotal: 1,
      edgeTypeCountTotal: 0,
      truncated: false,
    };
    render(<GraphSchemaSummaryPanel />);
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.getByText("Vault Note")).toBeInTheDocument();
    expect(screen.getByText("knowledge")).toBeInTheDocument();
    expect(screen.getByText("A markdown note")).toBeInTheDocument();
  });

  it("renders edge types with cardinality + arrow notation", () => {
    mocks.state.data = {
      nodeTypes: [],
      edgeTypes: [
        {
          typeKey: "LINKS_TO",
          displayName: "Links to",
          description: null,
          sourceNodeTypeKeys: ["Note"],
          targetNodeTypeKeys: ["Note"],
          cardinality: "many_to_many",
          isDirected: true,
        },
      ],
      nodeTypeCountTotal: 0,
      edgeTypeCountTotal: 1,
      truncated: false,
    };
    render(<GraphSchemaSummaryPanel />);
    expect(screen.getByText("LINKS_TO")).toBeInTheDocument();
    expect(screen.getByText("many_to_many")).toBeInTheDocument();
    // Arrow notation: "Note → Note"
    expect(screen.getByText(/Note\s*→\s*Note/)).toBeInTheDocument();
  });

  it("renders the truncated badge when summary.truncated is true", () => {
    mocks.state.data = {
      nodeTypes: [
        {
          typeKey: "A",
          displayName: "A",
          description: null,
          category: null,
        },
      ],
      edgeTypes: [],
      nodeTypeCountTotal: 26,
      edgeTypeCountTotal: 0,
      truncated: true,
    };
    render(<GraphSchemaSummaryPanel />);
    expect(screen.getByText("truncated")).toBeInTheDocument();
    expect(screen.getByText(/of 26\+/)).toBeInTheDocument();
  });

  it("renders the 'undirected' badge when isDirected is false", () => {
    mocks.state.data = {
      nodeTypes: [],
      edgeTypes: [
        {
          typeKey: "FRIENDS_WITH",
          displayName: "Friends with",
          description: null,
          sourceNodeTypeKeys: ["Person"],
          targetNodeTypeKeys: ["Person"],
          cardinality: "many_to_many",
          isDirected: false,
        },
      ],
      nodeTypeCountTotal: 0,
      edgeTypeCountTotal: 1,
      truncated: false,
    };
    render(<GraphSchemaSummaryPanel />);
    expect(screen.getByText("undirected")).toBeInTheDocument();
  });

  it("renders '*' when source/target type lists are empty", () => {
    mocks.state.data = {
      nodeTypes: [],
      edgeTypes: [
        {
          typeKey: "WILDCARD",
          displayName: "Wildcard",
          description: null,
          sourceNodeTypeKeys: [],
          targetNodeTypeKeys: [],
          cardinality: null,
          isDirected: true,
        },
      ],
      nodeTypeCountTotal: 0,
      edgeTypeCountTotal: 1,
      truncated: false,
    };
    render(<GraphSchemaSummaryPanel />);
    expect(screen.getByText(/\*\s*→\s*\*/)).toBeInTheDocument();
  });
});
