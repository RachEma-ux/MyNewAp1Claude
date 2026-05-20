// @vitest-environment jsdom
// SecurityGraphPanel — no-deferral continuation-17 slice 84 tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SecurityGraphPanel } from "./SecurityGraphPanel";

interface IngestionRow {
  readonly ingestionId: string;
  readonly sourceKey: string;
  readonly status: string;
  readonly nodesUpserted: number;
  readonly edgesUpserted: number;
  readonly edgesRejected: number;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}
interface SourceRow {
  readonly sourceKey: string;
  readonly latestIngestionId: string;
  readonly latestStatus: string;
  readonly latestNodesUpserted: number;
  readonly latestEdgesUpserted: number;
  readonly latestEdgesRejected: number;
  readonly latestStartedAt: Date;
  readonly latestCompletedAt: Date | null;
  readonly totalIngestionCount: number;
}
interface RejectionRow {
  readonly ingestionId: string;
  readonly sourceKey: string;
  readonly reason: string;
  readonly count: number;
  readonly ingestionStartedAt: Date;
}
interface NodeRow {
  readonly id: string;
  readonly typeKey: string;
  readonly name: string;
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
  sourcesQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as { sources: SourceRow[] } | undefined,
  },
  rejectionsQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as { rejections: RejectionRow[] } | undefined,
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
      securityGraph: {
        listIngestions: { useQuery: () => mocks.ingestionsQuery },
        listSources: { useQuery: () => mocks.sourcesQuery },
        listRecentRejectionsByReason: {
          useQuery: () => mocks.rejectionsQuery,
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
  mocks.sourcesQuery.isLoading = false;
  mocks.sourcesQuery.error = null;
  mocks.sourcesQuery.data = { sources: [] };
  mocks.rejectionsQuery.isLoading = false;
  mocks.rejectionsQuery.error = null;
  mocks.rejectionsQuery.data = { rejections: [] };
  mocks.knownTypesQuery.isLoading = false;
  mocks.knownTypesQuery.error = null;
  mocks.knownTypesQuery.data = {
    nodeTypes: ["CVE", "Service", "Owner"],
    edgeTypes: ["AFFECTS", "OWNED_BY"],
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

describe("SecurityGraphPanel — empty states", () => {
  it("renders sources empty-state when no sources", () => {
    render(<SecurityGraphPanel />);
    expect(
      screen.getByText(/No security-graph sources have ingested yet/i),
    ).toBeTruthy();
  });

  it("renders rejections empty-state when no rejections", () => {
    render(<SecurityGraphPanel />);
    expect(
      screen.getByText(/No edge rejections in recent ingestions/i),
    ).toBeTruthy();
  });

  it("renders ingestions empty-state when none persisted", () => {
    render(<SecurityGraphPanel />);
    expect(
      screen.getByText(/No security-graph ingestions persisted yet/i),
    ).toBeTruthy();
  });
});

describe("SecurityGraphPanel — populated lists", () => {
  function setupPopulatedFixture() {
    mocks.sourcesQuery.data = {
      sources: [
        {
          sourceKey: "nvd",
          latestIngestionId: "nvd::2026-05-20",
          latestStatus: "completed",
          latestNodesUpserted: 100,
          latestEdgesUpserted: 50,
          latestEdgesRejected: 2,
          latestStartedAt: new Date(),
          latestCompletedAt: new Date(),
          totalIngestionCount: 7,
        },
      ],
    };
    mocks.rejectionsQuery.data = {
      rejections: [
        {
          ingestionId: "nvd::2026-05-20",
          sourceKey: "nvd",
          reason: "schema_violation",
          count: 2,
          ingestionStartedAt: new Date(),
        },
      ],
    };
    mocks.ingestionsQuery.data = {
      ingestions: [
        {
          ingestionId: "nvd::2026-05-20",
          sourceKey: "nvd",
          status: "completed",
          nodesUpserted: 100,
          edgesUpserted: 50,
          edgesRejected: 2,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      ],
    };
  }

  it("renders one source row when sources are present", () => {
    setupPopulatedFixture();
    render(<SecurityGraphPanel />);
    expect(screen.getAllByTestId("sg-source-row")).toHaveLength(1);
    expect(screen.getByText(/7 run\(s\)/i)).toBeTruthy();
  });

  it("renders rejection row with reason + count + source", () => {
    setupPopulatedFixture();
    render(<SecurityGraphPanel />);
    expect(screen.getAllByTestId("sg-rejection-row")).toHaveLength(1);
    expect(screen.getByText(/schema_violation/)).toBeTruthy();
    expect(screen.getByText(/2 edge\(s\) in nvd/)).toBeTruthy();
  });

  it("renders ingestion row in the master list", () => {
    setupPopulatedFixture();
    render(<SecurityGraphPanel />);
    expect(screen.getAllByTestId("sg-ingestion-row")).toHaveLength(1);
    expect(screen.getByText(/nvd::2026-05-20/)).toBeTruthy();
  });
});

describe("SecurityGraphPanel — detail (stats + nodes + edges)", () => {
  function selectIngestion(over: {
    nodes?: NodeRow[];
    edges?: EdgeRow[];
    statsNotFound?: boolean;
  } = {}) {
    mocks.ingestionsQuery.data = {
      ingestions: [
        {
          ingestionId: "nvd::2026-05-20",
          sourceKey: "nvd",
          status: "completed",
          nodesUpserted: 100,
          edgesUpserted: 50,
          edgesRejected: 0,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      ],
    };
    if (over.statsNotFound) {
      mocks.statsQuery.data = {
        status: "not_found",
        ingestionId: "nvd::2026-05-20",
      };
    } else {
      mocks.statsQuery.data = {
        status: "ok",
        stats: {
          ingestionId: "nvd::2026-05-20",
          nodeCount: 100,
          edgeCount: 50,
          nodeTypeCounts: [{ typeKey: "CVE", count: 80 }],
          edgeTypeCounts: [{ edgeTypeKey: "AFFECTS", count: 50 }],
        },
      };
    }
    mocks.nodesQuery.data = {
      status: "ok",
      nodes: over.nodes ?? [
        { id: "cve-2026-1", typeKey: "CVE", name: "Cool exploit" },
      ],
    };
    mocks.edgesQuery.data = {
      status: "ok",
      edges: over.edges ?? [
        {
          id: "edge-1",
          sourceId: "cve-2026-1",
          edgeTypeKey: "AFFECTS",
          targetId: "service-auth",
        },
      ],
    };
    render(<SecurityGraphPanel />);
    fireEvent.click(screen.getAllByTestId("sg-ingestion-row")[0]);
  }

  it("clicking an ingestion mounts the detail container", () => {
    selectIngestion();
    expect(screen.getByTestId("sg-detail")).toBeTruthy();
    expect(screen.getByTestId("sg-stats")).toBeTruthy();
  });

  it("not_found stats render as destructive copy", () => {
    selectIngestion({ statsNotFound: true });
    expect(
      screen.getByText(/Ingestion nvd::2026-05-20 not found/i),
    ).toBeTruthy();
  });

  it("nodes drill-in renders one row per returned node", () => {
    selectIngestion();
    expect(screen.getAllByTestId("sg-node-row")).toHaveLength(1);
    expect(screen.getByText(/Cool exploit/)).toBeTruthy();
  });

  it("edges drill-in renders one row per returned edge", () => {
    selectIngestion();
    expect(screen.getAllByTestId("sg-edge-row")).toHaveLength(1);
    expect(screen.getByText(/cve-2026-1 → service-auth/)).toBeTruthy();
  });

  it("node-type filter threads typeKey into listIngestionNodes input", () => {
    selectIngestion();
    fireEvent.change(screen.getByTestId("sg-node-type-filter"), {
      target: { value: "CVE" },
    });
    const last = mocks.nodesQueryCalls[mocks.nodesQueryCalls.length - 1] as
      | Record<string, unknown>
      | undefined;
    expect(last?.typeKey).toBe("CVE");
  });

  it("edge-type filter threads edgeTypeKey into listIngestionEdges input", () => {
    selectIngestion();
    fireEvent.change(screen.getByTestId("sg-edge-type-filter"), {
      target: { value: "AFFECTS" },
    });
    const last = mocks.edgesQueryCalls[mocks.edgesQueryCalls.length - 1] as
      | Record<string, unknown>
      | undefined;
    expect(last?.edgeTypeKey).toBe("AFFECTS");
  });

  it("empty nodes list renders empty-state copy", () => {
    selectIngestion({ nodes: [] });
    expect(screen.getByText(/No nodes match the filter/i)).toBeTruthy();
  });
});
