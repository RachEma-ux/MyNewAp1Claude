// @vitest-environment jsdom
// SemanticEnrichmentProposalDetailPanel — branch coverage.
//
// Verifies T-D.4 carry-forward UI: lookup-by-id, status-gated
// Promote / Promote & apply affordances, mutation wiring, error +
// success flows, not-found envelope.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { SemanticEnrichmentProposalDetailPanel } from "./SemanticEnrichmentProposalDetailPanel";

interface ProposalDetail {
  readonly id: number;
  readonly runId: number | null;
  readonly proposalKind: string;
  readonly targetTypeKey: string | null;
  readonly targetId: number | null;
  readonly confidence: string | null;
  readonly status: string;
  readonly payload: Record<string, unknown> | null;
  readonly sourceEvidence: Record<string, unknown> | null;
  readonly createdAt: Date;
}

type DetailEnvelope =
  | { status: "ok"; proposalId: number; proposal: ProposalDetail }
  | { status: "not_found"; proposalId: number };

interface PromoteSuccess {
  status: "ok";
  enrichmentProposalId: number;
  correctionProposalId: number;
}

interface PromoteAndApproveSuccess {
  status: "ok";
  enrichmentProposalId: number;
  correctionProposalId: number;
  applied: boolean;
}

const mocks = vi.hoisted(() => ({
  authUser: { id: 42 } as { id: number } | null,
  detailState: {
    isLoading: false,
    isFetching: false,
    data: undefined as DetailEnvelope | undefined,
  },
  detailLastEnabled: null as null | boolean,
  invalidateMock: vi.fn(),
  promoteState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: PromoteSuccess) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  promoteAndApproveState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: PromoteAndApproveSuccess) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.authUser, loading: false, isAuthenticated: true }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      agentStudio: {
        semanticEnrichment: {
          getProposalDetail: { invalidate: mocks.invalidateMock },
        },
      },
    }),
    agentStudio: {
      semanticEnrichment: {
        getProposalDetail: {
          useQuery: (_input: unknown, opts: { enabled?: boolean }) => {
            mocks.detailLastEnabled = opts?.enabled ?? null;
            return mocks.detailState;
          },
        },
        promote: {
          useMutation: (opts: {
            onSuccess?: (d: PromoteSuccess) => void;
            onError?: (e: { message?: string }) => void;
          }) => {
            mocks.promoteState.lastOpts = opts;
            return mocks.promoteState;
          },
        },
        promoteAndApprove: {
          useMutation: (opts: {
            onSuccess?: (d: PromoteAndApproveSuccess) => void;
            onError?: (e: { message?: string }) => void;
          }) => {
            mocks.promoteAndApproveState.lastOpts = opts;
            return mocks.promoteAndApproveState;
          },
        },
      },
    },
  },
}));

function pendingProposal(
  overrides: Partial<ProposalDetail> = {},
): ProposalDetail {
  return {
    id: 100,
    runId: 5,
    proposalKind: "description_enrichment",
    targetTypeKey: "entity",
    targetId: 999,
    confidence: "0.97",
    status: "pending",
    payload: { newDescription: "An enriched description" },
    sourceEvidence: { sources: [{ url: "https://example.com" }] },
    createdAt: new Date("2026-05-18T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.authUser = { id: 42 };
  mocks.detailState.isLoading = false;
  mocks.detailState.isFetching = false;
  mocks.detailState.data = undefined;
  mocks.detailLastEnabled = null;
  mocks.invalidateMock.mockReset();
  mocks.promoteState.isPending = false;
  mocks.promoteState.mutate.mockReset();
  mocks.promoteState.lastOpts = null;
  mocks.promoteAndApproveState.isPending = false;
  mocks.promoteAndApproveState.mutate.mockReset();
  mocks.promoteAndApproveState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("SemanticEnrichmentProposalDetailPanel", () => {
  it("renders the section label and lookup input", () => {
    render(<SemanticEnrichmentProposalDetailPanel />);
    expect(
      screen.getByText(/semantic enrichment — proposal detail/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/proposal id/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /look up/i }),
    ).toBeInTheDocument();
  });

  it("query starts disabled until lookup is submitted", () => {
    render(<SemanticEnrichmentProposalDetailPanel />);
    expect(mocks.detailLastEnabled).toBe(false);
  });

  it("invalid lookup id triggers error toast and does NOT enable the query", () => {
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "-5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Enter a positive proposal id",
    );
    expect(mocks.detailLastEnabled).toBe(false);
  });

  it("valid lookup enables the detail query", () => {
    const { rerender } = render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    rerender(<SemanticEnrichmentProposalDetailPanel />);
    expect(mocks.detailLastEnabled).toBe(true);
  });

  it("not-found envelope renders an amber message", () => {
    mocks.detailState.data = { status: "not_found", proposalId: 100 };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    expect(
      screen.getByText(/proposal #100 not found/i),
    ).toBeInTheDocument();
  });

  it("pending proposal renders BOTH promote affordances", () => {
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal(),
    };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    expect(screen.getByTestId("promote-btn")).toBeInTheDocument();
    expect(
      screen.getByTestId("promote-and-approve-btn"),
    ).toBeInTheDocument();
  });

  it("non-pending status hides promote affordances and shows the gating note", () => {
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal({ status: "promoted" }),
    };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    expect(screen.queryByTestId("promote-btn")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("promote-and-approve-btn"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/promotion affordances are pending-only/i),
    ).toBeInTheDocument();
  });

  it("Promote button fires the promote mutation with proposalId (no rationale by default)", () => {
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal(),
    };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    fireEvent.click(screen.getByTestId("promote-btn"));
    expect(mocks.promoteState.mutate).toHaveBeenCalledWith({
      proposalId: 100,
    });
  });

  it("Promote button includes decisionRationale when provided", () => {
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal(),
    };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    fireEvent.change(screen.getByLabelText(/decision rationale/i), {
      target: { value: "confidence ≥ 0.95" },
    });
    fireEvent.click(screen.getByTestId("promote-btn"));
    expect(mocks.promoteState.mutate).toHaveBeenCalledWith({
      proposalId: 100,
      decisionRationale: "confidence ≥ 0.95",
    });
  });

  it("Promote & apply uses `rationale` field (NOT decisionRationale) + decidedByUserId from useAuth", () => {
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal(),
    };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    fireEvent.change(screen.getByLabelText(/decision rationale/i), {
      target: { value: "verified" },
    });
    fireEvent.click(screen.getByTestId("promote-and-approve-btn"));
    expect(mocks.promoteAndApproveState.mutate).toHaveBeenCalledWith({
      proposalId: 100,
      decidedByUserId: 42,
      rationale: "verified",
    });
  });

  it("Promote & apply blocks when not signed in (no user.id)", () => {
    mocks.authUser = null;
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal(),
    };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    fireEvent.click(screen.getByTestId("promote-and-approve-btn"));
    expect(mocks.promoteAndApproveState.mutate).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Sign-in required for promote & apply (decidedByUserId)",
    );
  });

  it("Promote success fires toast.success + invalidates the detail query + records lastResult", () => {
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal(),
    };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    act(() => {
      mocks.promoteState.lastOpts?.onSuccess?.({
        status: "ok",
        enrichmentProposalId: 100,
        correctionProposalId: 500,
      });
    });
    expect(mocks.toast.success).toHaveBeenCalledWith(
      expect.stringContaining("correction proposal #500"),
    );
    expect(mocks.invalidateMock).toHaveBeenCalled();
    expect(screen.getByText(/last action:/i)).toBeInTheDocument();
    expect(screen.getByText(/#500/)).toBeInTheDocument();
  });

  it("Promote error fires toast.error", () => {
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal(),
    };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    mocks.promoteState.lastOpts?.onError?.({ message: "boom" });
    expect(mocks.toast.error).toHaveBeenCalledWith("Promote failed: boom");
  });

  it("Promote & apply success reports the applied flag", () => {
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal(),
    };
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    act(() => {
      mocks.promoteAndApproveState.lastOpts?.onSuccess?.({
        status: "ok",
        enrichmentProposalId: 100,
        correctionProposalId: 501,
        applied: true,
      });
    });
    expect(mocks.toast.success).toHaveBeenCalledWith(
      expect.stringContaining("applied"),
    );
    expect(screen.getByText(/#501/)).toBeInTheDocument();
    expect(screen.getByText(/applied/)).toBeInTheDocument();
  });

  it("buttons share an isMutating disabled gate when promote is in-flight", () => {
    mocks.detailState.data = {
      status: "ok",
      proposalId: 100,
      proposal: pendingProposal(),
    };
    mocks.promoteState.isPending = true;
    render(<SemanticEnrichmentProposalDetailPanel />);
    fireEvent.change(screen.getByLabelText(/proposal id/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    expect(screen.getByTestId("promote-btn")).toBeDisabled();
    expect(screen.getByTestId("promote-and-approve-btn")).toBeDisabled();
  });
});
