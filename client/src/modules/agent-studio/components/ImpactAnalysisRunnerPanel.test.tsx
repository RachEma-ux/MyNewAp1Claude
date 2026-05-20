// @vitest-environment jsdom
// ImpactAnalysisRunnerPanel — no-deferral continuation-14 slice 75 tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ImpactAnalysisRunnerPanel } from "./ImpactAnalysisRunnerPanel";

const KIND_VALUES = [
  "knowledge_impact",
  "runtime_impact",
  "code_impact",
] as const;

interface ImpactNode {
  readonly typeKey: string;
  readonly id: string;
  readonly depth: number;
  readonly visible: boolean;
  readonly label?: string;
}
interface ImpactEdge {
  readonly typeKey: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly visible: boolean;
}
interface ImpactResult {
  readonly kind: string;
  readonly startingNodeId: string;
  readonly nodes: ImpactNode[];
  readonly edges: ImpactEdge[];
  readonly truncated: boolean;
  readonly hiddenNodeCount: number;
}
interface ImpactSummary {
  readonly totalNodes: number;
  readonly visibleNodes: number;
  readonly hiddenNodes: number;
  readonly totalEdges: number;
  readonly visibleEdges: number;
  readonly hiddenEdges: number;
  readonly nodesByDepth: Record<number, number>;
  readonly maxObservedDepth: number;
}

const mocks = vi.hoisted(() => ({
  kindsQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | {
          kinds: readonly string[];
          metadata: Record<string, { label: string; description: string }>;
        }
      | undefined,
  },
  // captures the input passed to runImpactAnalysis.useQuery
  runQueryCalls: [] as Array<unknown>,
  runQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | { result: ImpactResult; mode: "stub" | "template" }
      | undefined,
  },
  summaryQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as { summary: ImpactSummary } | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      impactAnalysis: {
        listKnownKinds: { useQuery: () => mocks.kindsQuery },
        runImpactAnalysis: {
          useQuery: (input: unknown) => {
            mocks.runQueryCalls.push(input);
            return mocks.runQuery;
          },
        },
        summarizeResult: { useQuery: () => mocks.summaryQuery },
      },
    },
  },
}));

beforeEach(() => {
  mocks.kindsQuery.isLoading = false;
  mocks.kindsQuery.error = null;
  mocks.kindsQuery.data = {
    kinds: KIND_VALUES as unknown as string[],
    metadata: {
      knowledge_impact: {
        label: "Knowledge Impact",
        description: "k-desc",
      },
      runtime_impact: {
        label: "Runtime Impact",
        description: "r-desc",
      },
      code_impact: { label: "Code Impact", description: "c-desc" },
    },
  };
  mocks.runQueryCalls.length = 0;
  mocks.runQuery.isLoading = false;
  mocks.runQuery.error = null;
  mocks.runQuery.data = undefined;
  mocks.summaryQuery.isLoading = false;
  mocks.summaryQuery.error = null;
  mocks.summaryQuery.data = undefined;
});

describe("ImpactAnalysisRunnerPanel — form", () => {
  it("renders the form fields + Run button", () => {
    render(<ImpactAnalysisRunnerPanel />);
    expect(screen.getByTestId("ia-kind")).toBeTruthy();
    expect(screen.getByTestId("ia-type-key")).toBeTruthy();
    expect(screen.getByTestId("ia-node-id")).toBeTruthy();
    expect(screen.getByTestId("ia-depth")).toBeTruthy();
    expect(screen.getByTestId("ia-filter")).toBeTruthy();
    expect(screen.getByTestId("ia-run-submit")).toBeTruthy();
  });

  it("populates kind dropdown from listKnownKinds with metadata labels", () => {
    render(<ImpactAnalysisRunnerPanel />);
    const sel = screen.getByTestId("ia-kind") as HTMLSelectElement;
    // empty default + 3 kinds
    expect(sel.options.length).toBe(4);
    expect(sel.options[1].textContent).toBe("Knowledge Impact");
    expect(sel.options[2].textContent).toBe("Runtime Impact");
  });

  it("Run button disabled until valid kind + typeKey + id + depth supplied", () => {
    render(<ImpactAnalysisRunnerPanel />);
    const btn = screen.getByTestId("ia-run-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("ia-kind"), {
      target: { value: "knowledge_impact" },
    });
    fireEvent.change(screen.getByTestId("ia-type-key"), {
      target: { value: "Service" },
    });
    fireEvent.change(screen.getByTestId("ia-node-id"), {
      target: { value: "auth-svc" },
    });
    expect(btn.disabled).toBe(false);
  });

  it("out-of-range depth disables the Run button", () => {
    render(<ImpactAnalysisRunnerPanel />);
    fireEvent.change(screen.getByTestId("ia-kind"), {
      target: { value: "knowledge_impact" },
    });
    fireEvent.change(screen.getByTestId("ia-type-key"), {
      target: { value: "Service" },
    });
    fireEvent.change(screen.getByTestId("ia-node-id"), {
      target: { value: "auth-svc" },
    });
    fireEvent.change(screen.getByTestId("ia-depth"), {
      target: { value: "50" },
    });
    const btn = screen.getByTestId("ia-run-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("clicking Run flips runImpactAnalysis useQuery input shape", () => {
    render(<ImpactAnalysisRunnerPanel />);
    // First call (before submit) — query disabled with placeholder input
    expect(mocks.runQueryCalls.length).toBeGreaterThan(0);
    fireEvent.change(screen.getByTestId("ia-kind"), {
      target: { value: "knowledge_impact" },
    });
    fireEvent.change(screen.getByTestId("ia-type-key"), {
      target: { value: "Service" },
    });
    fireEvent.change(screen.getByTestId("ia-node-id"), {
      target: { value: "auth-svc" },
    });
    fireEvent.click(screen.getByTestId("ia-run-submit"));
    const last = mocks.runQueryCalls[mocks.runQueryCalls.length - 1] as
      | Record<string, unknown>
      | undefined;
    expect(last?.kind).toBe("knowledge_impact");
    expect(last?.startingNode).toEqual({ typeKey: "Service", id: "auth-svc" });
    // depth defaults to 3; should be omitted from the submitted shape.
    expect("maxDepth" in (last ?? {})).toBe(false);
  });

  it("non-default depth + filter thread into the submitted shape", () => {
    render(<ImpactAnalysisRunnerPanel />);
    fireEvent.change(screen.getByTestId("ia-kind"), {
      target: { value: "runtime_impact" },
    });
    fireEvent.change(screen.getByTestId("ia-type-key"), {
      target: { value: "Agent" },
    });
    fireEvent.change(screen.getByTestId("ia-node-id"), {
      target: { value: "draft-7" },
    });
    fireEvent.change(screen.getByTestId("ia-depth"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByTestId("ia-filter"), {
      target: { value: "Service, Owner, Endpoint" },
    });
    fireEvent.click(screen.getByTestId("ia-run-submit"));
    const last = mocks.runQueryCalls[mocks.runQueryCalls.length - 1] as
      | Record<string, unknown>
      | undefined;
    expect(last?.maxDepth).toBe(5);
    expect(last?.nodeTypeKeyFilter).toEqual(["Service", "Owner", "Endpoint"]);
  });
});

describe("ImpactAnalysisRunnerPanel — result rendering", () => {
  function setupSubmittedResult(
    over: Partial<{
      mode: "stub" | "template";
      nodes: ImpactNode[];
      truncated: boolean;
      hidden: number;
    }> = {},
  ) {
    mocks.runQuery.data = {
      mode: over.mode ?? "template",
      result: {
        kind: "knowledge_impact",
        startingNodeId: "auth-svc",
        nodes: over.nodes ?? [
          {
            typeKey: "Service",
            id: "auth-svc",
            depth: 0,
            visible: true,
            label: "Auth Service",
          },
          {
            typeKey: "Endpoint",
            id: "endpoint-1",
            depth: 1,
            visible: true,
            label: "POST /login",
          },
        ],
        edges: [],
        truncated: over.truncated ?? false,
        hiddenNodeCount: over.hidden ?? 0,
      },
    };
    mocks.summaryQuery.data = {
      summary: {
        totalNodes: 2,
        visibleNodes: 2,
        hiddenNodes: 0,
        totalEdges: 0,
        visibleEdges: 0,
        hiddenEdges: 0,
        nodesByDepth: { 0: 1, 1: 1 },
        maxObservedDepth: 1,
      },
    };
    render(<ImpactAnalysisRunnerPanel />);
    fireEvent.change(screen.getByTestId("ia-kind"), {
      target: { value: "knowledge_impact" },
    });
    fireEvent.change(screen.getByTestId("ia-type-key"), {
      target: { value: "Service" },
    });
    fireEvent.change(screen.getByTestId("ia-node-id"), {
      target: { value: "auth-svc" },
    });
    fireEvent.click(screen.getByTestId("ia-run-submit"));
  }

  it("renders the result container + mode pill when result lands", () => {
    setupSubmittedResult({ mode: "template" });
    expect(screen.getByTestId("ia-result")).toBeTruthy();
    expect(screen.getByTestId("ia-mode-pill").textContent).toMatch(
      /template/i,
    );
  });

  it("mode=stub renders with a different style class than template", () => {
    setupSubmittedResult({ mode: "stub" });
    const pill = screen.getByTestId("ia-mode-pill");
    expect(pill.textContent).toMatch(/stub/i);
    expect(pill.className).toContain("bg-muted");
  });

  it("truncated result renders the truncated badge", () => {
    setupSubmittedResult({ truncated: true });
    expect(screen.getByText(/truncated/i)).toBeTruthy();
  });

  it("renders the summary badge row when summarizeResult returns", () => {
    setupSubmittedResult();
    expect(screen.getByTestId("ia-summary")).toBeTruthy();
    expect(screen.getByText(/nodes: 2/i)).toBeTruthy();
    expect(screen.getByText(/max depth: 1/i)).toBeTruthy();
  });

  it("renders one node row per result node with depth + label", () => {
    setupSubmittedResult();
    const rows = screen.getAllByTestId("ia-node-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText(/Auth Service/)).toBeTruthy();
    expect(screen.getByText(/POST \/login/)).toBeTruthy();
  });

  it("renders empty-state for anchor-only results", () => {
    setupSubmittedResult({ nodes: [] });
    expect(
      screen.getByText(/No impact nodes returned/i),
    ).toBeTruthy();
  });

  it("surfaces query errors via the error testid", () => {
    mocks.runQuery.error = { message: "graph unavailable" };
    mocks.runQuery.data = undefined;
    render(<ImpactAnalysisRunnerPanel />);
    fireEvent.change(screen.getByTestId("ia-kind"), {
      target: { value: "knowledge_impact" },
    });
    fireEvent.change(screen.getByTestId("ia-type-key"), {
      target: { value: "Service" },
    });
    fireEvent.change(screen.getByTestId("ia-node-id"), {
      target: { value: "auth-svc" },
    });
    fireEvent.click(screen.getByTestId("ia-run-submit"));
    expect(screen.getByTestId("ia-result-error").textContent).toContain(
      "graph unavailable",
    );
  });
});
