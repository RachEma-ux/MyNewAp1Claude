// @vitest-environment jsdom
// RecommendationBatchRunnerPanel — no-deferral continuation-16 slice 81 tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { RecommendationBatchRunnerPanel } from "./RecommendationBatchRunnerPanel";

const KINDS = ["relevant_notes", "relevant_tools", "next_actions"] as const;

interface RecResult {
  readonly rank: number;
  readonly permissionStatus: "visible" | "redacted" | "hidden";
  readonly reason: string;
  readonly graphPath: string[];
  readonly sourceCitations: ReadonlyArray<{ typeKey: string; id: string }>;
  readonly confidence: number;
  readonly recommendedNode: { typeKey: string; id: string };
}
interface RecResponse {
  readonly kind: string;
  readonly anchor: { typeKey: string; id: string };
  readonly results: RecResult[];
  readonly redactedCount: number;
  readonly fullyHiddenCount: number;
}
interface BatchKindResult {
  readonly kind: string;
  readonly status: "ok" | "error";
  readonly response?: RecResponse;
  readonly errorMessage?: string;
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
  batchQueryCalls: [] as Array<unknown>,
  batchQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | { status: "ok"; results: BatchKindResult[] }
      | { status: "graphrag_unavailable" }
      | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      recommendation: {
        listKnownKinds: { useQuery: () => mocks.kindsQuery },
        recommendBatch: {
          useQuery: (input: unknown) => {
            mocks.batchQueryCalls.push(input);
            return mocks.batchQuery;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.kindsQuery.isLoading = false;
  mocks.kindsQuery.error = null;
  mocks.kindsQuery.data = {
    kinds: KINDS as unknown as string[],
    metadata: {
      relevant_notes: {
        label: "Relevant Notes",
        description: "n-desc",
      },
      relevant_tools: {
        label: "Relevant Tools",
        description: "t-desc",
      },
      next_actions: { label: "Next Actions", description: "a-desc" },
    },
  };
  mocks.batchQueryCalls.length = 0;
  mocks.batchQuery.isLoading = false;
  mocks.batchQuery.error = null;
  mocks.batchQuery.data = undefined;
});

function fillRequiredFields() {
  fireEvent.change(screen.getByTestId("rec-batch-workspace-id"), {
    target: { value: "7" },
  });
  fireEvent.change(screen.getByTestId("rec-batch-type-key"), {
    target: { value: "Note" },
  });
  fireEvent.change(screen.getByTestId("rec-batch-anchor-id"), {
    target: { value: "note-42" },
  });
}

describe("RecommendationBatchRunnerPanel — form", () => {
  it("renders the kind checkboxes + form fields + Run button", () => {
    render(<RecommendationBatchRunnerPanel />);
    expect(screen.getByTestId("rec-batch-kinds-list")).toBeTruthy();
    expect(screen.getByTestId("rec-batch-kind-relevant_notes")).toBeTruthy();
    expect(screen.getByTestId("rec-batch-kind-relevant_tools")).toBeTruthy();
    expect(screen.getByTestId("rec-batch-kind-next_actions")).toBeTruthy();
    expect(screen.getByTestId("rec-batch-workspace-id")).toBeTruthy();
    expect(screen.getByTestId("rec-batch-type-key")).toBeTruthy();
    expect(screen.getByTestId("rec-batch-anchor-id")).toBeTruthy();
    expect(screen.getByTestId("rec-batch-limit")).toBeTruthy();
    expect(screen.getByTestId("rec-batch-min-confidence")).toBeTruthy();
    expect(screen.getByTestId("rec-batch-run-submit")).toBeTruthy();
  });

  it("Run button disabled until at least one kind is selected + fields valid", () => {
    render(<RecommendationBatchRunnerPanel />);
    const btn = screen.getByTestId("rec-batch-run-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fillRequiredFields();
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_notes"));
    expect(btn.disabled).toBe(false);
  });

  it("Run button label reflects selected-kind count (1 vs 2+ pluralization)", () => {
    render(<RecommendationBatchRunnerPanel />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_notes"));
    expect(
      screen.getByTestId("rec-batch-run-submit").textContent,
    ).toMatch(/Run for 1 kind\b/);
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_tools"));
    expect(
      screen.getByTestId("rec-batch-run-submit").textContent,
    ).toMatch(/Run for 2 kinds/);
  });

  it("clicking Run threads the submitted input shape with preserved kind order", () => {
    render(<RecommendationBatchRunnerPanel />);
    fillRequiredFields();
    // Click in reverse order to verify the panel preserves
    // listKnownKinds order, not click order.
    fireEvent.click(screen.getByTestId("rec-batch-kind-next_actions"));
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_notes"));
    fireEvent.click(screen.getByTestId("rec-batch-run-submit"));
    const last = mocks.batchQueryCalls[
      mocks.batchQueryCalls.length - 1
    ] as Record<string, unknown> | undefined;
    expect(last?.kinds).toEqual(["relevant_notes", "next_actions"]);
    expect(last?.workspaceId).toBe(7);
    expect(last?.anchor).toEqual({ typeKey: "Note", id: "note-42" });
    expect("limit" in (last ?? {})).toBe(false);
    expect("minConfidence" in (last ?? {})).toBe(false);
  });

  it("clicking a checked kind unchecks it", () => {
    render(<RecommendationBatchRunnerPanel />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_notes"));
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_tools"));
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_notes"));
    fireEvent.click(screen.getByTestId("rec-batch-run-submit"));
    const last = mocks.batchQueryCalls[
      mocks.batchQueryCalls.length - 1
    ] as Record<string, unknown> | undefined;
    expect(last?.kinds).toEqual(["relevant_tools"]);
  });
});

describe("RecommendationBatchRunnerPanel — result rendering", () => {
  function setupOkBatch(over: Partial<{ results: BatchKindResult[] }> = {}) {
    mocks.batchQuery.data = {
      status: "ok",
      results: over.results ?? [
        {
          kind: "relevant_notes",
          status: "ok",
          response: {
            kind: "relevant_notes",
            anchor: { typeKey: "Note", id: "note-42" },
            results: [
              {
                rank: 1,
                permissionStatus: "visible",
                reason: "shares tag",
                graphPath: [],
                sourceCitations: [],
                confidence: 0.8,
                recommendedNode: { typeKey: "Note", id: "note-99" },
              },
            ],
            redactedCount: 0,
            fullyHiddenCount: 0,
          },
        },
        {
          kind: "relevant_tools",
          status: "error",
          errorMessage: "tools index offline",
        },
      ],
    };
    render(<RecommendationBatchRunnerPanel />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_notes"));
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_tools"));
    fireEvent.click(screen.getByTestId("rec-batch-run-submit"));
  }

  it("renders one section per kind with the per-kind status pill", () => {
    setupOkBatch();
    expect(screen.getAllByTestId("rec-batch-kind-section")).toHaveLength(2);
    // Two status pills — "ok" + "error" — both rendered.
    expect(screen.getByText(/^ok$/i)).toBeTruthy();
    expect(screen.getByText(/^error$/i)).toBeTruthy();
  });

  it("ok sections render per-result rows", () => {
    setupOkBatch();
    expect(screen.getAllByTestId("rec-batch-result-row")).toHaveLength(1);
    expect(screen.getByText(/note-99/)).toBeTruthy();
    expect(screen.getByText(/shares tag/)).toBeTruthy();
  });

  it("error sections render the errorMessage", () => {
    setupOkBatch();
    expect(screen.getByText(/tools index offline/i)).toBeTruthy();
  });

  it("ok section with empty results renders the empty-state copy", () => {
    setupOkBatch({
      results: [
        {
          kind: "relevant_notes",
          status: "ok",
          response: {
            kind: "relevant_notes",
            anchor: { typeKey: "Note", id: "note-42" },
            results: [],
            redactedCount: 0,
            fullyHiddenCount: 0,
          },
        },
      ],
    });
    expect(
      screen.getByText(/No results matched the confidence threshold/i),
    ).toBeTruthy();
  });

  it("graphrag_unavailable renders the informational empty-state", () => {
    mocks.batchQuery.data = { status: "graphrag_unavailable" };
    render(<RecommendationBatchRunnerPanel />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_notes"));
    fireEvent.click(screen.getByTestId("rec-batch-run-submit"));
    expect(screen.getByTestId("rec-batch-graphrag-unavailable")).toBeTruthy();
  });

  it("query error surfaces via the error testid", () => {
    mocks.batchQuery.error = { message: "backend timeout" };
    mocks.batchQuery.data = undefined;
    render(<RecommendationBatchRunnerPanel />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("rec-batch-kind-relevant_notes"));
    fireEvent.click(screen.getByTestId("rec-batch-run-submit"));
    expect(screen.getByTestId("rec-batch-result-error").textContent).toContain(
      "backend timeout",
    );
  });
});
