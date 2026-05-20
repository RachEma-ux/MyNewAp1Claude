// @vitest-environment jsdom
// RecommendationRunnerPanel — no-deferral continuation-15 slice 78 tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { RecommendationRunnerPanel } from "./RecommendationRunnerPanel";

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
  recommendQueryCalls: [] as Array<unknown>,
  recommendQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as
      | { status: "ok"; response: RecResponse }
      | { status: "graphrag_unavailable" }
      | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      recommendation: {
        listKnownKinds: { useQuery: () => mocks.kindsQuery },
        recommend: {
          useQuery: (input: unknown) => {
            mocks.recommendQueryCalls.push(input);
            return mocks.recommendQuery;
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
  mocks.recommendQueryCalls.length = 0;
  mocks.recommendQuery.isLoading = false;
  mocks.recommendQuery.error = null;
  mocks.recommendQuery.data = undefined;
});

function fillRequiredFields() {
  fireEvent.change(screen.getByTestId("rec-kind"), {
    target: { value: "relevant_notes" },
  });
  fireEvent.change(screen.getByTestId("rec-workspace-id"), {
    target: { value: "7" },
  });
  fireEvent.change(screen.getByTestId("rec-type-key"), {
    target: { value: "Note" },
  });
  fireEvent.change(screen.getByTestId("rec-anchor-id"), {
    target: { value: "note-42" },
  });
}

describe("RecommendationRunnerPanel — form", () => {
  it("renders form fields + Run button", () => {
    render(<RecommendationRunnerPanel />);
    expect(screen.getByTestId("rec-kind")).toBeTruthy();
    expect(screen.getByTestId("rec-workspace-id")).toBeTruthy();
    expect(screen.getByTestId("rec-type-key")).toBeTruthy();
    expect(screen.getByTestId("rec-anchor-id")).toBeTruthy();
    expect(screen.getByTestId("rec-limit")).toBeTruthy();
    expect(screen.getByTestId("rec-min-confidence")).toBeTruthy();
    expect(screen.getByTestId("rec-run-submit")).toBeTruthy();
  });

  it("populates kind dropdown from listKnownKinds with metadata labels", () => {
    render(<RecommendationRunnerPanel />);
    const sel = screen.getByTestId("rec-kind") as HTMLSelectElement;
    expect(sel.options.length).toBe(4);
    expect(sel.options[1].textContent).toBe("Relevant Notes");
    expect(sel.options[3].textContent).toBe("Next Actions");
  });

  it("Run button disabled until required fields valid", () => {
    render(<RecommendationRunnerPanel />);
    const btn = screen.getByTestId("rec-run-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fillRequiredFields();
    expect(btn.disabled).toBe(false);
  });

  it("out-of-range limit disables Run", () => {
    render(<RecommendationRunnerPanel />);
    fillRequiredFields();
    fireEvent.change(screen.getByTestId("rec-limit"), {
      target: { value: "500" },
    });
    const btn = screen.getByTestId("rec-run-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("out-of-range minConfidence disables Run", () => {
    render(<RecommendationRunnerPanel />);
    fillRequiredFields();
    fireEvent.change(screen.getByTestId("rec-min-confidence"), {
      target: { value: "1.5" },
    });
    const btn = screen.getByTestId("rec-run-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("clicking Run threads the submitted input shape", () => {
    render(<RecommendationRunnerPanel />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("rec-run-submit"));
    const last = mocks.recommendQueryCalls[
      mocks.recommendQueryCalls.length - 1
    ] as Record<string, unknown> | undefined;
    expect(last?.kind).toBe("relevant_notes");
    expect(last?.workspaceId).toBe(7);
    expect(last?.anchor).toEqual({ typeKey: "Note", id: "note-42" });
    // defaults omitted
    expect("limit" in (last ?? {})).toBe(false);
    expect("minConfidence" in (last ?? {})).toBe(false);
  });

  it("non-default limit + minConfidence thread into the submitted shape", () => {
    render(<RecommendationRunnerPanel />);
    fillRequiredFields();
    fireEvent.change(screen.getByTestId("rec-limit"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByTestId("rec-min-confidence"), {
      target: { value: "0.7" },
    });
    fireEvent.click(screen.getByTestId("rec-run-submit"));
    const last = mocks.recommendQueryCalls[
      mocks.recommendQueryCalls.length - 1
    ] as Record<string, unknown> | undefined;
    expect(last?.limit).toBe(25);
    expect(last?.minConfidence).toBeCloseTo(0.7, 5);
  });
});

describe("RecommendationRunnerPanel — result rendering", () => {
  function setupOkResult(
    over: Partial<{
      results: RecResult[];
      redactedCount: number;
      fullyHiddenCount: number;
    }> = {},
  ) {
    mocks.recommendQuery.data = {
      status: "ok",
      response: {
        kind: "relevant_notes",
        anchor: { typeKey: "Note", id: "note-42" },
        results: over.results ?? [
          {
            rank: 1,
            permissionStatus: "visible",
            reason: "shares the same project tag",
            graphPath: ["TAGGED_WITH", "REVERSE_TAGGED_WITH"],
            sourceCitations: [{ typeKey: "Tag", id: "sprint-3" }],
            confidence: 0.85,
            recommendedNode: { typeKey: "Note", id: "note-99" },
          },
          {
            rank: 2,
            permissionStatus: "redacted",
            reason: "exists in a workspace you don't have access to",
            graphPath: [],
            sourceCitations: [],
            confidence: 0.72,
            recommendedNode: { typeKey: "Note", id: "__redacted__" },
          },
        ],
        redactedCount: over.redactedCount ?? 1,
        fullyHiddenCount: over.fullyHiddenCount ?? 0,
      },
    };
    render(<RecommendationRunnerPanel />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("rec-run-submit"));
  }

  it("renders the result container when status === ok", () => {
    setupOkResult();
    expect(screen.getByTestId("rec-result")).toBeTruthy();
    expect(screen.getAllByTestId("rec-result-row")).toHaveLength(2);
  });

  it("renders permission status pill per row", () => {
    setupOkResult();
    expect(screen.getByText(/^visible$/)).toBeTruthy();
    expect(screen.getByText(/^redacted$/)).toBeTruthy();
  });

  it("hidden banner appears when redactedCount + fullyHiddenCount > 0", () => {
    setupOkResult({ redactedCount: 2, fullyHiddenCount: 3 });
    expect(screen.getByTestId("rec-hidden-banner").textContent).toMatch(
      /2 redacted/i,
    );
    expect(screen.getByTestId("rec-hidden-banner").textContent).toMatch(
      /3 fully hidden/i,
    );
  });

  it("renders empty state when results array is empty", () => {
    setupOkResult({ results: [], redactedCount: 0, fullyHiddenCount: 0 });
    expect(
      screen.getByText(/No results matched the confidence threshold/i),
    ).toBeTruthy();
  });

  it("graphrag_unavailable envelope renders the empty-state banner", () => {
    mocks.recommendQuery.data = { status: "graphrag_unavailable" };
    render(<RecommendationRunnerPanel />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("rec-run-submit"));
    expect(screen.getByTestId("rec-graphrag-unavailable")).toBeTruthy();
  });

  it("query error surfaces via the error testid", () => {
    mocks.recommendQuery.error = { message: "service offline" };
    mocks.recommendQuery.data = undefined;
    render(<RecommendationRunnerPanel />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("rec-run-submit"));
    expect(screen.getByTestId("rec-result-error").textContent).toContain(
      "service offline",
    );
  });
});
