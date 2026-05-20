// @vitest-environment jsdom
// PromotionLifecyclePanel — no-deferral continuation-23 slice 102 tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { PromotionLifecyclePanel } from "./PromotionLifecyclePanel";

interface SubmitResult {
  promotionId: number;
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
  rollbackState: {
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
      promotion: {
        submit: {
          useMutation: (opts: any) => {
            mocks.submitState.lastOpts = opts;
            return mocks.submitState;
          },
        },
        approve: {
          useMutation: (opts: any) => {
            mocks.approveState.lastOpts = opts;
            return mocks.approveState;
          },
        },
        reject: {
          useMutation: (opts: any) => {
            mocks.rejectState.lastOpts = opts;
            return mocks.rejectState;
          },
        },
        rollback: {
          useMutation: (opts: any) => {
            mocks.rollbackState.lastOpts = opts;
            return mocks.rollbackState;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  for (const m of [
    mocks.submitState,
    mocks.approveState,
    mocks.rejectState,
    mocks.rollbackState,
  ]) {
    m.isPending = false;
    m.mutate.mockReset();
    m.lastOpts = null;
  }
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("PromotionLifecyclePanel", () => {
  it("renders all four lifecycle sub-section labels", () => {
    render(<PromotionLifecyclePanel />);
    expect(screen.getAllByText(/submit promotion/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/approve promotion/i)).toBeInTheDocument();
    expect(screen.getByText(/reject promotion/i)).toBeInTheDocument();
    expect(screen.getByText(/rollback promotion/i)).toBeInTheDocument();
  });

  it("submit button is disabled until noteId + noteVersionId + kind are set", () => {
    render(<PromotionLifecyclePanel />);
    const btn = screen.getByTestId("prom-submit-button");
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByTestId("prom-submit-note-id"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-note-version-id"), {
      target: { value: "7" },
    });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByTestId("prom-submit-kind"), {
      target: { value: "knowledge_unit" },
    });
    expect(btn).not.toBeDisabled();
  });

  it("submit forwards all required fields + optional rationale", () => {
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-submit-note-id"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-note-version-id"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-kind"), {
      target: { value: "graph_skill_pack" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-rationale"), {
      target: { value: "policy review passed" },
    });
    fireEvent.click(screen.getByTestId("prom-submit-button"));
    expect(mocks.submitState.mutate).toHaveBeenCalledWith({
      noteId: 42,
      noteVersionId: 7,
      promotionKind: "graph_skill_pack",
      rationale: "policy review passed",
    });
  });

  it("submit omits rationale when empty", () => {
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-submit-note-id"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-note-version-id"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-kind"), {
      target: { value: "policy" },
    });
    fireEvent.click(screen.getByTestId("prom-submit-button"));
    expect(mocks.submitState.mutate).toHaveBeenCalledWith({
      noteId: 1,
      noteVersionId: 1,
      promotionKind: "policy",
    });
  });

  it("submit onSuccess appends a recent-row + toasts", () => {
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-submit-note-id"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-note-version-id"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-kind"), {
      target: { value: "cag_block" },
    });
    act(() => {
      mocks.submitState.lastOpts?.onSuccess?.({
        promotionId: 17,
        status: "in_review",
      });
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    const rows = screen.getAllByTestId("prom-recent-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("#17");
    expect(rows[0].textContent).toContain("cag_block");
    expect(rows[0].textContent).toContain("in_review");
  });

  it("submit onError fires toast.error", () => {
    render(<PromotionLifecyclePanel />);
    act(() => {
      mocks.submitState.lastOpts?.onError?.({ message: "policy denied" });
    });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Submit failed: policy denied",
    );
  });

  it("approve forwards proposalId", () => {
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-approve-id"), {
      target: { value: "23" },
    });
    fireEvent.click(screen.getByTestId("prom-approve-button"));
    expect(mocks.approveState.mutate).toHaveBeenCalledWith({
      promotionId: 23,
    });
  });

  it("reject forwards id + reason; reason omitted when empty", () => {
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-reject-id"), {
      target: { value: "31" },
    });
    fireEvent.change(screen.getByTestId("prom-reject-reason"), {
      target: { value: "insufficient evidence" },
    });
    fireEvent.click(screen.getByTestId("prom-reject-button"));
    expect(mocks.rejectState.mutate).toHaveBeenCalledWith({
      promotionId: 31,
      reason: "insufficient evidence",
    });
  });

  it("reject omits reason when blank", () => {
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-reject-id"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByTestId("prom-reject-button"));
    expect(mocks.rejectState.mutate).toHaveBeenCalledWith({
      promotionId: 9,
    });
  });

  it("rollback confirms then calls rollback", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-rollback-id"), {
      target: { value: "44" },
    });
    fireEvent.click(screen.getByTestId("prom-rollback-button"));
    expect(mocks.rollbackState.mutate).toHaveBeenCalledWith({
      promotionId: 44,
    });
    confirmSpy.mockRestore();
  });

  it("rollback cancellation skips mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-rollback-id"), {
      target: { value: "44" },
    });
    fireEvent.click(screen.getByTestId("prom-rollback-button"));
    expect(mocks.rollbackState.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("approve onSuccess clears the form + toasts", () => {
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-approve-id"), {
      target: { value: "5" },
    });
    act(() => {
      mocks.approveState.lastOpts?.onSuccess?.({ status: "approved" });
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(screen.getByTestId("prom-approve-id")).toHaveValue(null);
  });

  it("rollback onError fires toast.error", () => {
    render(<PromotionLifecyclePanel />);
    act(() => {
      mocks.rollbackState.lastOpts?.onError?.({ message: "not reversible" });
    });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Rollback failed: not reversible",
    );
  });

  it("pending state disables the submit button + shows spinner label", () => {
    mocks.submitState.isPending = true;
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-submit-note-id"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-note-version-id"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("prom-submit-kind"), {
      target: { value: "workflow" },
    });
    const btn = screen.getByTestId("prom-submit-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toMatch(/submitting/i);
  });

  it("recent shelf is capped at 10 entries", () => {
    render(<PromotionLifecyclePanel />);
    fireEvent.change(screen.getByTestId("prom-submit-kind"), {
      target: { value: "workflow" },
    });
    for (let i = 0; i < 12; i++) {
      act(() => {
        mocks.submitState.lastOpts?.onSuccess?.({
          promotionId: i + 1,
          status: "in_review",
        });
      });
    }
    const rows = screen.getAllByTestId("prom-recent-row");
    expect(rows).toHaveLength(10);
    expect(rows[0].textContent).toContain("#12");
  });
});
