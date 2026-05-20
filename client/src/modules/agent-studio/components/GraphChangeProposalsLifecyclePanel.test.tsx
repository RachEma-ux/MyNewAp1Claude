// @vitest-environment jsdom
// GraphChangeProposalsLifecyclePanel — no-deferral continuation-19 slice 90 tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { GraphChangeProposalsLifecyclePanel } from "./GraphChangeProposalsLifecyclePanel";

interface SubmitResult {
  proposalId: number;
  status: string;
}
interface DecisionResult {
  status: string;
}

const mocks = vi.hoisted(() => ({
  submitState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: SubmitResult) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  approveState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: DecisionResult) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  rejectState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: DecisionResult) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  withdrawState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: DecisionResult) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      graphChangeProposals: {
        submit: {
          useMutation: (opts: {
            onSuccess?: (d: SubmitResult) => void;
            onError?: (e: { message?: string }) => void;
          }) => {
            mocks.submitState.lastOpts = opts;
            return mocks.submitState;
          },
        },
        approve: {
          useMutation: (opts: {
            onSuccess?: (d: DecisionResult) => void;
            onError?: (e: { message?: string }) => void;
          }) => {
            mocks.approveState.lastOpts = opts;
            return mocks.approveState;
          },
        },
        reject: {
          useMutation: (opts: {
            onSuccess?: (d: DecisionResult) => void;
            onError?: (e: { message?: string }) => void;
          }) => {
            mocks.rejectState.lastOpts = opts;
            return mocks.rejectState;
          },
        },
        withdraw: {
          useMutation: (opts: {
            onSuccess?: (d: DecisionResult) => void;
            onError?: (e: { message?: string }) => void;
          }) => {
            mocks.withdrawState.lastOpts = opts;
            return mocks.withdrawState;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.submitState.isPending = false;
  mocks.submitState.mutate.mockReset();
  mocks.submitState.lastOpts = null;
  mocks.approveState.isPending = false;
  mocks.approveState.mutate.mockReset();
  mocks.approveState.lastOpts = null;
  mocks.rejectState.isPending = false;
  mocks.rejectState.mutate.mockReset();
  mocks.rejectState.lastOpts = null;
  mocks.withdrawState.isPending = false;
  mocks.withdrawState.mutate.mockReset();
  mocks.withdrawState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("GraphChangeProposalsLifecyclePanel", () => {
  it("renders all four lifecycle section labels", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    expect(screen.getAllByText(/submit proposal/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/approve proposal/i)).toBeInTheDocument();
    expect(screen.getByText(/reject proposal/i)).toBeInTheDocument();
    expect(screen.getByText(/withdraw proposal/i)).toBeInTheDocument();
  });

  it("submit button is disabled until proposalKind + itemKind + valid JSON payload are set", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    const btn = screen.getByTestId("gcp-submit-button");
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByTestId("gcp-submit-kind"), {
      target: { value: "create_node" },
    });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByTestId("gcp-submit-item-kind"), {
      target: { value: "node" },
    });
    // default payload is {} which is valid JSON object — should enable
    expect(btn).not.toBeDisabled();
  });

  it("submit with invalid JSON payload surfaces error + disables button", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-submit-kind"), {
      target: { value: "create_node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-kind"), {
      target: { value: "node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-payload"), {
      target: { value: "{ broken" },
    });
    expect(
      screen.getByTestId("gcp-submit-item-payload-error"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("gcp-submit-button")).toBeDisabled();
  });

  it("submit with JSON array payload is rejected", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-submit-kind"), {
      target: { value: "create_node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-kind"), {
      target: { value: "node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-payload"), {
      target: { value: "[1, 2, 3]" },
    });
    expect(
      screen.getByTestId("gcp-submit-item-payload-error"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("gcp-submit-button")).toBeDisabled();
  });

  it("submit forwards all optional fields when filled", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-submit-kind"), {
      target: { value: "update_node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-confidence"), {
      target: { value: "high" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-summary"), {
      target: { value: "Rename node Foo → Bar" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-agent-id"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-kind"), {
      target: { value: "node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-payload"), {
      target: { value: '{"nodeId": "n1", "newName": "Bar"}' },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-source-evidence"), {
      target: { value: '{"noteId": 7}' },
    });
    fireEvent.click(screen.getByTestId("gcp-submit-button"));
    expect(mocks.submitState.mutate).toHaveBeenCalledWith({
      proposalKind: "update_node",
      summary: "Rename node Foo → Bar",
      confidence: "high",
      proposedByAgentId: 42,
      items: [
        {
          itemKind: "node",
          itemPayload: { nodeId: "n1", newName: "Bar" },
          sourceEvidence: { noteId: 7 },
        },
      ],
    });
  });

  it("submit omits optional fields when empty", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-submit-kind"), {
      target: { value: "deprecate_node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-kind"), {
      target: { value: "node" },
    });
    fireEvent.click(screen.getByTestId("gcp-submit-button"));
    expect(mocks.submitState.mutate).toHaveBeenCalledWith({
      proposalKind: "deprecate_node",
      items: [
        {
          itemKind: "node",
          itemPayload: {},
        },
      ],
    });
  });

  it("submit invalid source-evidence JSON disables the button", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-submit-kind"), {
      target: { value: "create_node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-kind"), {
      target: { value: "node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-source-evidence"), {
      target: { value: "not json" },
    });
    expect(
      screen.getByTestId("gcp-submit-source-evidence-error"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("gcp-submit-button")).toBeDisabled();
  });

  it("submit onSuccess appends a row to the recent list + toasts", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-submit-kind"), {
      target: { value: "create_node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-kind"), {
      target: { value: "node" },
    });
    act(() => {
      mocks.submitState.lastOpts?.onSuccess?.({
        proposalId: 17,
        status: "in_review",
      });
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(screen.getByTestId("gcp-submit-recent-list")).toBeInTheDocument();
    const rows = screen.getAllByTestId("gcp-submit-recent-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("#17");
    expect(rows[0].textContent).toContain("create_node");
    expect(rows[0].textContent).toContain("in_review");
  });

  it("submit onError fires toast.error", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    act(() => {
      mocks.submitState.lastOpts?.onError?.({ message: "boom" });
    });
    expect(mocks.toast.error).toHaveBeenCalledWith("Submit failed: boom");
  });

  it("approve button is disabled until proposalId is a positive integer", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    const btn = screen.getByTestId("gcp-approve-button");
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByTestId("gcp-approve-id"), {
      target: { value: "0" },
    });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByTestId("gcp-approve-id"), {
      target: { value: "17" },
    });
    expect(btn).not.toBeDisabled();
  });

  it("approve forwards proposalId + rationale", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-approve-id"), {
      target: { value: "23" },
    });
    fireEvent.change(screen.getByTestId("gcp-approve-rationale"), {
      target: { value: "matches policy" },
    });
    fireEvent.click(screen.getByTestId("gcp-approve-button"));
    expect(mocks.approveState.mutate).toHaveBeenCalledWith({
      proposalId: 23,
      rationale: "matches policy",
    });
  });

  it("approve omits rationale when empty", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-approve-id"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByTestId("gcp-approve-button"));
    expect(mocks.approveState.mutate).toHaveBeenCalledWith({
      proposalId: 9,
    });
  });

  it("reject forwards proposalId + rationale", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-reject-id"), {
      target: { value: "31" },
    });
    fireEvent.change(screen.getByTestId("gcp-reject-rationale"), {
      target: { value: "evidence insufficient" },
    });
    fireEvent.click(screen.getByTestId("gcp-reject-button"));
    expect(mocks.rejectState.mutate).toHaveBeenCalledWith({
      proposalId: 31,
      rationale: "evidence insufficient",
    });
  });

  it("withdraw forwards proposalId only", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-withdraw-id"), {
      target: { value: "44" },
    });
    fireEvent.click(screen.getByTestId("gcp-withdraw-button"));
    expect(mocks.withdrawState.mutate).toHaveBeenCalledWith({
      proposalId: 44,
    });
  });

  it("approve onSuccess clears the form + toasts", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-approve-id"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByTestId("gcp-approve-rationale"), {
      target: { value: "ok" },
    });
    act(() => {
      mocks.approveState.lastOpts?.onSuccess?.({ status: "approved" });
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(screen.getByTestId("gcp-approve-id")).toHaveValue(null);
    expect(screen.getByTestId("gcp-approve-rationale")).toHaveValue("");
  });

  it("withdraw onError fires toast.error", () => {
    render(<GraphChangeProposalsLifecyclePanel />);
    act(() => {
      mocks.withdrawState.lastOpts?.onError?.({ message: "not allowed" });
    });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Withdraw failed: not allowed",
    );
  });

  it("pending state disables the submit button + shows spinner label", () => {
    mocks.submitState.isPending = true;
    render(<GraphChangeProposalsLifecyclePanel />);
    fireEvent.change(screen.getByTestId("gcp-submit-kind"), {
      target: { value: "create_node" },
    });
    fireEvent.change(screen.getByTestId("gcp-submit-item-kind"), {
      target: { value: "node" },
    });
    const btn = screen.getByTestId("gcp-submit-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toMatch(/submitting/i);
  });
});
