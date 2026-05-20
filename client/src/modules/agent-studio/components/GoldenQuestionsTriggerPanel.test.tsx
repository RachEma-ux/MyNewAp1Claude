// @vitest-environment jsdom
// GoldenQuestionsTriggerPanel — no-deferral continuation-12 slice 69 tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { GoldenQuestionsTriggerPanel } from "./GoldenQuestionsTriggerPanel";

interface SuiteRow {
  readonly id: number;
  readonly suiteKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly active: boolean;
  readonly questionCount: number;
  readonly createdAt: Date;
}

const mocks = vi.hoisted(() => ({
  suitesQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as { suites: SuiteRow[] } | undefined,
  },
  triggerMut: {
    mutate: vi.fn<(input: Record<string, unknown>) => void>(),
    isPending: false,
  },
  triggerCallbacks: {
    onSuccess: null as
      | ((data: {
          suitesRun: string[];
          persistence: Array<{ status: string; ok?: boolean; runId?: number }>;
          summary: unknown;
        }) => void)
      | null,
    onError: null as ((err: { message: string }) => void) | null,
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      goldenQuestions: {
        listSuites: { useQuery: () => mocks.suitesQuery },
        triggerLiveEvaluation: {
          useMutation: (opts?: {
            onSuccess?: (data: {
              suitesRun: string[];
              persistence: Array<{
                status: string;
                ok?: boolean;
                runId?: number;
              }>;
              summary: unknown;
            }) => void;
            onError?: (err: { message: string }) => void;
          }) => {
            mocks.triggerCallbacks.onSuccess = opts?.onSuccess ?? null;
            mocks.triggerCallbacks.onError = opts?.onError ?? null;
            return mocks.triggerMut;
          },
        },
      },
    },
  },
}));

function setSuites(over: Partial<typeof mocks.suitesQuery>) {
  mocks.suitesQuery.isLoading = over.isLoading ?? false;
  mocks.suitesQuery.error = over.error ?? null;
  mocks.suitesQuery.data = over.data;
}

beforeEach(() => {
  mocks.triggerMut.mutate.mockReset();
  mocks.triggerMut.isPending = false;
  mocks.triggerCallbacks.onSuccess = null;
  mocks.triggerCallbacks.onError = null;
});

describe("GoldenQuestionsTriggerPanel", () => {
  it("renders the form fields + the submit button", () => {
    setSuites({ data: { suites: [] } });
    render(<GoldenQuestionsTriggerPanel />);
    expect(screen.getByTestId("gq-provider-connection-id")).toBeTruthy();
    expect(screen.getByTestId("gq-model-ref")).toBeTruthy();
    expect(screen.getByTestId("gq-workspace-id")).toBeTruthy();
    expect(screen.getByTestId("gq-actor-id")).toBeTruthy();
    expect(screen.getByTestId("gq-suite-key")).toBeTruthy();
    expect(screen.getByTestId("gq-timeout")).toBeTruthy();
    expect(screen.getByTestId("gq-trigger-submit")).toBeTruthy();
  });

  it("Run button is disabled until all required fields are valid", () => {
    setSuites({ data: { suites: [] } });
    render(<GoldenQuestionsTriggerPanel />);
    const btn = screen.getByTestId("gq-trigger-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("gq-provider-connection-id"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByTestId("gq-model-ref"), {
      target: { value: "anthropic/claude-3-5-sonnet" },
    });
    fireEvent.change(screen.getByTestId("gq-workspace-id"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByTestId("gq-actor-id"), {
      target: { value: "1" },
    });
    expect(btn.disabled).toBe(false);
  });

  it("populates the suite dropdown from listSuites", () => {
    setSuites({
      data: {
        suites: [
          {
            id: 1,
            suiteKey: "smoke",
            name: "Smoke",
            description: null,
            active: true,
            questionCount: 5,
            createdAt: new Date(),
          },
          {
            id: 2,
            suiteKey: "regression",
            name: "Regression",
            description: null,
            active: true,
            questionCount: 12,
            createdAt: new Date(),
          },
        ],
      },
    });
    render(<GoldenQuestionsTriggerPanel />);
    const sel = screen.getByTestId("gq-suite-key") as HTMLSelectElement;
    // default empty option + 2 suite options
    expect(sel.options.length).toBe(3);
    expect(sel.options[1].value).toBe("smoke");
    expect(sel.options[2].value).toBe("regression");
  });

  it("submit calls triggerMut.mutate with parsed numeric fields + omits suiteKey when blank", () => {
    setSuites({ data: { suites: [] } });
    render(<GoldenQuestionsTriggerPanel />);
    fireEvent.change(screen.getByTestId("gq-provider-connection-id"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByTestId("gq-model-ref"), {
      target: { value: "anthropic/claude-3-5-sonnet" },
    });
    fireEvent.change(screen.getByTestId("gq-workspace-id"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByTestId("gq-actor-id"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByTestId("gq-trigger-submit"));
    expect(mocks.triggerMut.mutate).toHaveBeenCalledTimes(1);
    const arg = mocks.triggerMut.mutate.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(arg.providerConnectionId).toBe(42);
    expect(arg.modelRef).toBe("anthropic/claude-3-5-sonnet");
    expect(arg.workspaceId).toBe(7);
    expect(arg.actorId).toBe(1);
    expect("suiteKey" in arg).toBe(false);
    // 30_000 is the default — should be omitted
    expect("perQuestionTimeoutMs" in arg).toBe(false);
  });

  it("submit threads suiteKey + non-default timeout when supplied", () => {
    setSuites({
      data: {
        suites: [
          {
            id: 1,
            suiteKey: "smoke",
            name: "Smoke",
            description: null,
            active: true,
            questionCount: 5,
            createdAt: new Date(),
          },
        ],
      },
    });
    render(<GoldenQuestionsTriggerPanel />);
    fireEvent.change(screen.getByTestId("gq-provider-connection-id"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByTestId("gq-model-ref"), {
      target: { value: "anthropic/claude-3-5-sonnet" },
    });
    fireEvent.change(screen.getByTestId("gq-workspace-id"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByTestId("gq-actor-id"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("gq-suite-key"), {
      target: { value: "smoke" },
    });
    fireEvent.change(screen.getByTestId("gq-timeout"), {
      target: { value: "60000" },
    });
    fireEvent.click(screen.getByTestId("gq-trigger-submit"));
    const arg = mocks.triggerMut.mutate.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(arg.suiteKey).toBe("smoke");
    expect(arg.perQuestionTimeoutMs).toBe(60000);
  });

  it("invalid (out-of-range) timeout disables the Run button", () => {
    setSuites({ data: { suites: [] } });
    render(<GoldenQuestionsTriggerPanel />);
    fireEvent.change(screen.getByTestId("gq-provider-connection-id"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByTestId("gq-model-ref"), {
      target: { value: "anthropic/claude-3-5-sonnet" },
    });
    fireEvent.change(screen.getByTestId("gq-workspace-id"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByTestId("gq-actor-id"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("gq-timeout"), {
      target: { value: "100" },
    });
    const btn = screen.getByTestId("gq-trigger-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Run button is disabled while a trigger is in flight", () => {
    setSuites({ data: { suites: [] } });
    mocks.triggerMut.isPending = true;
    render(<GoldenQuestionsTriggerPanel />);
    fireEvent.change(screen.getByTestId("gq-provider-connection-id"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByTestId("gq-model-ref"), {
      target: { value: "anthropic/claude-3-5-sonnet" },
    });
    fireEvent.change(screen.getByTestId("gq-workspace-id"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByTestId("gq-actor-id"), {
      target: { value: "1" },
    });
    const btn = screen.getByTestId("gq-trigger-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/Running/);
  });
});
