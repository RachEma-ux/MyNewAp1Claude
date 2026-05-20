// @vitest-environment jsdom
// CodeGraphPanel — no-deferral continuation-18 slice 87 tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CodeGraphPanel } from "./CodeGraphPanel";

interface IngestionRow {
  readonly ingestionId: string;
  readonly repositoryId: string;
  readonly status: string;
  readonly nodesUpserted: number;
  readonly edgesUpserted: number;
  readonly edgesRejected: number;
  readonly parserErrorCount: number;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}
interface RepositoryRow {
  readonly repositoryId: string;
  readonly latestIngestionId: string;
  readonly latestStatus: string;
  readonly latestNodesUpserted: number;
  readonly latestEdgesUpserted: number;
  readonly latestEdgesRejected: number;
  readonly latestStartedAt: Date;
  readonly latestCompletedAt: Date | null;
  readonly totalIngestionCount: number;
}
interface ParserErrorRow {
  readonly ingestionId: string;
  readonly repositoryId: string;
  readonly filePath: string;
  readonly reason: string;
  readonly message: string;
  readonly ingestionStartedAt: Date;
}
interface NodeRow {
  readonly id: string;
  readonly typeKey: string;
  readonly name: string;
  readonly filePath: string;
  readonly startLine?: number;
  readonly endLine?: number;
}
interface EdgeRow {
  readonly id: string;
  readonly sourceId: string;
  readonly edgeTypeKey: string;
  readonly targetId: string;
}

const mocks = vi.hoisted(() => ({
  ingestionsQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as { ingestions: IngestionRow[] } | undefined,
  },
  repositoriesQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as { repositories: RepositoryRow[] } | undefined,
  },
  parserErrorsQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as { errors: ParserErrorRow[] } | undefined,
  },
  knownTypesQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | {
          nodeTypes: readonly string[];
          edgeTypes: readonly string[];
          edgeConstraints: Record<string, unknown>;
        }
      | undefined,
  },
  statsQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | {
          status: "ok";
          stats: {
            ingestionId: string;
            nodeCount: number;
            edgeCount: number;
            nodeTypeCounts: ReadonlyArray<{ typeKey: string; count: number }>;
            edgeTypeCounts: ReadonlyArray<{
              edgeTypeKey: string;
              count: number;
            }>;
          };
        }
      | { status: "not_found"; ingestionId: string }
      | undefined,
  },
  nodesQueryCalls: [] as Array<unknown>,
  nodesQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | { status: "ok"; nodes: NodeRow[] }
      | { status: "ingestion_not_found"; ingestionId: string }
      | undefined,
  },
  edgesQueryCalls: [] as Array<unknown>,
  edgesQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | { status: "ok"; edges: EdgeRow[] }
      | { status: "ingestion_not_found"; ingestionId: string }
      | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      codeGraph: {
        listIngestions: { useQuery: () => mocks.ingestionsQuery },
        listRepositories: { useQuery: () => mocks.repositoriesQuery },
        listRecentParserErrors: {
          useQuery: () => mocks.parserErrorsQuery,
        },
        listKnownTypes: { useQuery: () => mocks.knownTypesQuery },
        getIngestionStats: { useQuery: () => mocks.statsQuery },
        listIngestionNodes: {
          useQuery: (input: unknown) => {
            mocks.nodesQueryCalls.push(input);
            return mocks.nodesQuery;
          },
        },
        listIngestionEdges: {
          useQuery: (input: unknown) => {
            mocks.edgesQueryCalls.push(input);
            return mocks.edgesQuery;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.ingestionsQuery.isLoading = false;
  mocks.ingestionsQuery.error = null;
  mocks.ingestionsQuery.data = { ingestions: [] };
  mocks.repositoriesQuery.isLoading = false;
  mocks.repositoriesQuery.error = null;
  mocks.repositoriesQuery.data = { repositories: [] };
  mocks.parserErrorsQuery.isLoading = false;
  mocks.parserErrorsQuery.error = null;
  mocks.parserErrorsQuery.data = { errors: [] };
  mocks.knownTypesQuery.isLoading = false;
  mocks.knownTypesQuery.error = null;
  mocks.knownTypesQuery.data = {
    nodeTypes: ["File", "Class", "Function"],
    edgeTypes: ["CALLS", "IMPORTS"],
    edgeConstraints: {},
  };
  mocks.statsQuery.isLoading = false;
  mocks.statsQuery.error = null;
  mocks.statsQuery.data = undefined;
  mocks.nodesQueryCalls.length = 0;
  mocks.nodesQuery.isLoading = false;
  mocks.nodesQuery.error = null;
  mocks.nodesQuery.data = undefined;
  mocks.edgesQueryCalls.length = 0;
  mocks.edgesQuery.isLoading = false;
  mocks.edgesQuery.error = null;
  mocks.edgesQuery.data = undefined;
});

describe("CodeGraphPanel — empty states", () => {
  it("renders repositories empty-state when none", () => {
    render(<CodeGraphPanel />);
    expect(
      screen.getByText(/No code-graph repositories have ingested yet/i),
    ).toBeTruthy();
  });

  it("renders parser-errors empty-state when none", () => {
    render(<CodeGraphPanel />);
    expect(
      screen.getByText(/No parser errors in recent ingestions/i),
    ).toBeTruthy();
  });

  it("renders ingestions empty-state when none persisted", () => {
    render(<CodeGraphPanel />);
    expect(
      screen.getByText(/No code-graph ingestions persisted yet/i),
    ).toBeTruthy();
  });
});

describe("CodeGraphPanel — populated lists", () => {
  function setupPopulatedFixture() {
    mocks.repositoriesQuery.data = {
      repositories: [
        {
          repositoryId: "frontend",
          latestIngestionId: "frontend::2026-05-20",
          latestStatus: "completed",
          latestNodesUpserted: 250,
          latestEdgesUpserted: 400,
          latestEdgesRejected: 0,
          latestStartedAt: new Date(),
          latestCompletedAt: new Date(),
          totalIngestionCount: 12,
        },
      ],
    };
    mocks.parserErrorsQuery.data = {
      errors: [
        {
          ingestionId: "frontend::2026-05-20",
          repositoryId: "frontend",
          filePath: "src/foo.ts",
          reason: "syntax_error",
          message: "unexpected token at line 42",
          ingestionStartedAt: new Date(),
        },
      ],
    };
    mocks.ingestionsQuery.data = {
      ingestions: [
        {
          ingestionId: "frontend::2026-05-20",
          repositoryId: "frontend",
          status: "completed",
          nodesUpserted: 250,
          edgesUpserted: 400,
          edgesRejected: 0,
          parserErrorCount: 1,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      ],
    };
  }

  it("renders one repository row", () => {
    setupPopulatedFixture();
    render(<CodeGraphPanel />);
    expect(screen.getAllByTestId("cg-repository-row")).toHaveLength(1);
    expect(screen.getByText(/12 run\(s\)/i)).toBeTruthy();
  });

  it("renders parser-error row with reason + filePath + message", () => {
    setupPopulatedFixture();
    render(<CodeGraphPanel />);
    expect(screen.getAllByTestId("cg-parser-error-row")).toHaveLength(1);
    expect(screen.getByText(/syntax_error/)).toBeTruthy();
    expect(screen.getByText(/src\/foo\.ts/)).toBeTruthy();
    expect(screen.getByText(/unexpected token at line 42/)).toBeTruthy();
  });

  it("renders ingestion row with parserErrorCount when > 0", () => {
    setupPopulatedFixture();
    render(<CodeGraphPanel />);
    expect(screen.getAllByTestId("cg-ingestion-row")).toHaveLength(1);
    expect(screen.getByText(/parser errors: 1/i)).toBeTruthy();
  });
});

describe("CodeGraphPanel — detail (stats + nodes + edges)", () => {
  function selectIngestion(
    over: {
      nodes?: NodeRow[];
      edges?: EdgeRow[];
      statsNotFound?: boolean;
    } = {},
  ) {
    mocks.ingestionsQuery.data = {
      ingestions: [
        {
          ingestionId: "frontend::2026-05-20",
          repositoryId: "frontend",
          status: "completed",
          nodesUpserted: 250,
          edgesUpserted: 400,
          edgesRejected: 0,
          parserErrorCount: 0,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      ],
    };
    if (over.statsNotFound) {
      mocks.statsQuery.data = {
        status: "not_found",
        ingestionId: "frontend::2026-05-20",
      };
    } else {
      mocks.statsQuery.data = {
        status: "ok",
        stats: {
          ingestionId: "frontend::2026-05-20",
          nodeCount: 250,
          edgeCount: 400,
          nodeTypeCounts: [{ typeKey: "Function", count: 180 }],
          edgeTypeCounts: [{ edgeTypeKey: "CALLS", count: 350 }],
        },
      };
    }
    mocks.nodesQuery.data = {
      status: "ok",
      nodes: over.nodes ?? [
        {
          id: "fn-1",
          typeKey: "Function",
          name: "renderTree",
          filePath: "src/foo.ts",
          startLine: 10,
          endLine: 42,
        },
      ],
    };
    mocks.edgesQuery.data = {
      status: "ok",
      edges: over.edges ?? [
        {
          id: "edge-1",
          sourceId: "fn-1",
          edgeTypeKey: "CALLS",
          targetId: "fn-2",
        },
      ],
    };
    render(<CodeGraphPanel />);
    fireEvent.click(screen.getAllByTestId("cg-ingestion-row")[0]);
  }

  it("clicking an ingestion mounts the detail container", () => {
    selectIngestion();
    expect(screen.getByTestId("cg-detail")).toBeTruthy();
    expect(screen.getByTestId("cg-stats")).toBeTruthy();
  });

  it("not_found stats render as destructive copy", () => {
    selectIngestion({ statsNotFound: true });
    expect(
      screen.getByText(/Ingestion frontend::2026-05-20 not found/i),
    ).toBeTruthy();
  });

  it("nodes drill-in renders one row per returned node with filePath + line range", () => {
    selectIngestion();
    expect(screen.getAllByTestId("cg-node-row")).toHaveLength(1);
    expect(screen.getByText(/renderTree/)).toBeTruthy();
    expect(screen.getByText(/src\/foo\.ts:10–42/)).toBeTruthy();
  });

  it("edges drill-in renders one row per returned edge", () => {
    selectIngestion();
    expect(screen.getAllByTestId("cg-edge-row")).toHaveLength(1);
    expect(screen.getByText(/fn-1 → fn-2/)).toBeTruthy();
  });

  it("node-type filter threads typeKey into listIngestionNodes input", () => {
    selectIngestion();
    fireEvent.change(screen.getByTestId("cg-node-type-filter"), {
      target: { value: "Function" },
    });
    const last = mocks.nodesQueryCalls[mocks.nodesQueryCalls.length - 1] as
      | Record<string, unknown>
      | undefined;
    expect(last?.typeKey).toBe("Function");
  });

  it("edge-type filter threads edgeTypeKey into listIngestionEdges input", () => {
    selectIngestion();
    fireEvent.change(screen.getByTestId("cg-edge-type-filter"), {
      target: { value: "CALLS" },
    });
    const last = mocks.edgesQueryCalls[mocks.edgesQueryCalls.length - 1] as
      | Record<string, unknown>
      | undefined;
    expect(last?.edgeTypeKey).toBe("CALLS");
  });

  it("empty nodes list renders empty-state copy", () => {
    selectIngestion({ nodes: [] });
    expect(screen.getByText(/No nodes match the filter/i)).toBeTruthy();
  });
});
