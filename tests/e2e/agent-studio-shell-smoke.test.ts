// @vitest-environment jsdom
//
// Native Graph Workspace closure — Layer 4 first slice (PR-C).
//
// Real component-render smoke test that exercises the Agent Studio
// shell + graph-workspace route registration end-to-end, without
// adding a Playwright dependency. See
//   docs/architecture/agent-studio-e2e-testing-strategy.md
// for the strategy: this file is the first slice; full Playwright
// wiring is V1.0 scope.
//
// Coverage:
//   - graph-workspace route is in the canonical route inventory
//   - GraphWorkspacePage composition renders without throwing
//   - critical view-name strings the shell switches on are stable
//
// The existing `tests/e2e/platform.test.ts` keeps its stub shape
// for now — replacing it wholesale is V1.0 scope.

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";

import { agentStudioRoutes } from "../../client/src/modules/agent-studio/routes";

// Mock tRPC so the GraphWorkspacePage compositional render doesn't
// reach the network. Same shape as the page's own test file.
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

describe("Layer 4 e2e — Agent Studio shell smoke (first slice)", () => {
  it("registers the graph-workspace route in the canonical inventory", () => {
    const paths = agentStudioRoutes.map((r) => r.path);
    expect(paths).toContain("/agent-studio/graph-workspace");
    const entry = agentStudioRoutes.find(
      (r) => r.path === "/agent-studio/graph-workspace",
    );
    expect(entry?.label).toBe("Graph Workspace");
  });

  it("registers the full canonical Agent Studio route set", () => {
    // Pinned list mirrors `client/src/modules/agent-studio/routes.tsx`.
    // A reordering or removal of a canonical path must update both
    // this assertion AND the manifest's `routeInventory`.
    const paths = agentStudioRoutes.map((r) => r.path);
    expect(paths).toEqual([
      "/agent-studio/new",
      "/agent-studio/templates",
      "/agent-studio/import",
      "/agent-studio/catalog/:section",
      "/agent-studio/catalog",
      "/agent-studio/marketplace",
      "/agent-studio/graph-workspace",
      "/agent-studio/:agentId/runs/:runId",
      "/agent-studio/:agentId/versions/compare",
      "/agent-studio/:agentId/:section",
      "/agent-studio/:agentId",
      "/agent-studio",
    ]);
  });

  it("graph-workspace route entry resolves to a lazy-or-static component", () => {
    const entry = agentStudioRoutes.find(
      (r) => r.path === "/agent-studio/graph-workspace",
    );
    expect(entry).toBeDefined();
    // LazyExoticComponent | ComponentType<any>. Cannot directly
    // execute, but the entry MUST exist as a non-null component
    // reference for the shell to mount the page.
    expect(entry?.component).toBeDefined();
  });

  it("renders GraphWorkspacePage without throwing", async () => {
    // Dynamic import keeps tsx-jsx out of this .ts file. Render via
    // createElement so we don't need the JSX transform in tests/.
    const { default: GraphWorkspacePage } = await import(
      "../../client/src/modules/agent-studio/pages/GraphWorkspacePage"
    );
    render(createElement(GraphWorkspacePage));
    expect(screen.getByText("Graph Workspace")).toBeInTheDocument();
  });
});
