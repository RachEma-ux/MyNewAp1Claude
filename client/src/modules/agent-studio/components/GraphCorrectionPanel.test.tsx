// @vitest-environment jsdom
// GraphCorrectionPanel — no-deferral continuation-24 slice 105 tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { GraphCorrectionPanel } from "./GraphCorrectionPanel";

interface ProposalRow {
  id: number;
  proposalKind: string;
  status: string;
  targetTypeKey?: string | null;
  targetId?: number | null;
  confidence?: number | null;
  proposedChange?: Record<string, unknown>;
}
interface AuditRow {
  id: number;
  eventKind: string;
  actedByUserId?: number | null;
}

const mocks = vi.hoisted(() => ({
  listQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as ProposalRow[] | undefined,
  },
  detailQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as ProposalRow | undefined,
  },
  auditQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as AuditRow[] | undefined,
  },
  submitMut: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  approveMut: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  rejectMut: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  reviseMut: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  withdrawMut: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  bulkApproveMut: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  bulkRejectMut: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  invalidateList: vi.fn(),
  invalidateGet: vi.fn(),
  invalidateAudit: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      agentStudio: {
        graphCorrection: {
          list: { invalidate: mocks.invalidateList },
          get: { invalidate: mocks.invalidateGet },
          listAudit: { invalidate: mocks.invalidateAudit },
        },
      },
    }),
    agentStudio: {
      graphCorrection: {
        list: { useQuery: () => mocks.listQuery },
        get: { useQuery: () => mocks.detailQuery },
        listAudit: { useQuery: () => mocks.auditQuery },
        submit: {
          useMutation: (opts: any) => {
            mocks.submitMut.lastOpts = opts;
            return mocks.submitMut;
          },
        },
        approve: {
          useMutation: (opts: any) => {
            mocks.approveMut.lastOpts = opts;
            return mocks.approveMut;
          },
        },
        reject: {
          useMutation: (opts: any) => {
            mocks.rejectMut.lastOpts = opts;
            return mocks.rejectMut;
          },
        },
        requestRevision: {
          useMutation: (opts: any) => {
            mocks.reviseMut.lastOpts = opts;
            return mocks.reviseMut;
          },
        },
        withdraw: {
          useMutation: (opts: any) => {
            mocks.withdrawMut.lastOpts = opts;
            return mocks.withdrawMut;
          },
        },
        bulkApprove: {
          useMutation: (opts: any) => {
            mocks.bulkApproveMut.lastOpts = opts;
            return mocks.bulkApproveMut;
          },
        },
        bulkReject: {
          useMutation: (opts: any) => {
            mocks.bulkRejectMut.lastOpts = opts;
            return mocks.bulkRejectMut;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.listQuery.isLoading = false;
  mocks.listQuery.error = null;
  mocks.listQuery.data = undefined;
  mocks.detailQuery.isLoading = false;
  mocks.detailQuery.error = null;
  mocks.detailQuery.data = undefined;
  mocks.auditQuery.isLoading = false;
  mocks.auditQuery.error = null;
  mocks.auditQuery.data = undefined;
  for (const m of [
    mocks.submitMut,
    mocks.approveMut,
    mocks.rejectMut,
    mocks.reviseMut,
    mocks.withdrawMut,
    mocks.bulkApproveMut,
    mocks.bulkRejectMut,
  ]) {
    m.isPending = false;
    m.mutate.mockReset();
    m.lastOpts = null;
  }
  mocks.invalidateList.mockReset();
  mocks.invalidateGet.mockReset();
  mocks.invalidateAudit.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("GraphCorrectionPanel", () => {
  it("renders the four section labels + detail empty state by default", () => {
    render(<GraphCorrectionPanel />);
    expect(
      screen.getByText(/submit correction proposal/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/filter proposals/i)).toBeInTheDocument();
    expect(screen.getByText(/^proposals$/i)).toBeInTheDocument();
    expect(screen.getByTestId("gc-detail-empty")).toBeInTheDocument();
  });

  it("submit form is disabled until proposalKind + valid JSON change", () => {
    render(<GraphCorrectionPanel />);
    const btn = screen.getByTestId("gc-submit-button");
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByTestId("gc-submit-kind"), {
      target: { value: "entity_rename" },
    });
    expect(btn).not.toBeDisabled();
  });

  it("submit forwards optional fields when filled", () => {
    render(<GraphCorrectionPanel />);
    fireEvent.change(screen.getByTestId("gc-submit-kind"), {
      target: { value: "entity_rename" },
    });
    fireEvent.change(screen.getByTestId("gc-submit-target-type"), {
      target: { value: "Concept" },
    });
    fireEvent.change(screen.getByTestId("gc-submit-target-id"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByTestId("gc-submit-confidence"), {
      target: { value: "0.75" },
    });
    fireEvent.change(screen.getByTestId("gc-submit-change"), {
      target: { value: '{"newName": "Bar"}' },
    });
    fireEvent.change(screen.getByTestId("gc-submit-rationale"), {
      target: { value: "Cleaner" },
    });
    fireEvent.click(screen.getByTestId("gc-submit-button"));
    expect(mocks.submitMut.mutate).toHaveBeenCalledWith({
      proposalKind: "entity_rename",
      targetTypeKey: "Concept",
      targetId: 42,
      proposedChange: { newName: "Bar" },
      confidence: 0.75,
      rationale: "Cleaner",
    });
  });

  it("invalid proposedChange JSON disables submit + shows error", () => {
    render(<GraphCorrectionPanel />);
    fireEvent.change(screen.getByTestId("gc-submit-kind"), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByTestId("gc-submit-change"), {
      target: { value: "[1,2,3]" },
    });
    expect(screen.getByTestId("gc-submit-change-error")).toBeInTheDocument();
    expect(screen.getByTestId("gc-submit-button")).toBeDisabled();
  });

  it("empty list renders empty-state", () => {
    mocks.listQuery.data = [];
    render(<GraphCorrectionPanel />);
    expect(screen.getByTestId("gc-list-empty")).toBeInTheDocument();
  });

  it("list rows render + click loads detail (when detailQuery data is set)", () => {
    mocks.listQuery.data = [
      {
        id: 5,
        proposalKind: "entity_rename",
        status: "pending",
        targetTypeKey: "Concept",
        targetId: 9,
      },
    ];
    mocks.detailQuery.data = {
      id: 5,
      proposalKind: "entity_rename",
      status: "pending",
      proposedChange: { newName: "Bar" },
    };
    mocks.auditQuery.data = [];
    render(<GraphCorrectionPanel />);
    const row = screen.getAllByTestId("gc-list-row")[0];
    expect(row.textContent).toContain("entity_rename");
    expect(row.textContent).toContain("pending");
    fireEvent.click(screen.getByTestId("gc-list-row-select"));
    expect(screen.getByTestId("gc-detail")).toBeInTheDocument();
    expect(screen.getByTestId("gc-detail-change").textContent).toContain(
      "newName",
    );
    expect(screen.getByTestId("gc-audit-empty")).toBeInTheDocument();
  });

  it("checkbox multi-select exposes bulk bar + shared rationale", () => {
    mocks.listQuery.data = [
      { id: 1, proposalKind: "k", status: "pending" },
      { id: 2, proposalKind: "k", status: "pending" },
    ];
    render(<GraphCorrectionPanel />);
    const checkboxes = screen.getAllByTestId("gc-list-row-checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(screen.getByTestId("gc-bulk-bar").textContent).toContain(
      "2 selected",
    );
    fireEvent.change(screen.getByTestId("gc-bulk-rationale"), {
      target: { value: "merged dupes" },
    });
    fireEvent.click(screen.getByTestId("gc-bulk-approve"));
    expect(mocks.bulkApproveMut.mutate).toHaveBeenCalledWith({
      proposalIds: [1, 2],
      rationale: "merged dupes",
    });
  });

  it("bulk reject submits proposalIds without rationale when blank", () => {
    mocks.listQuery.data = [
      { id: 1, proposalKind: "k", status: "pending" },
    ];
    render(<GraphCorrectionPanel />);
    fireEvent.click(screen.getByTestId("gc-list-row-checkbox"));
    fireEvent.click(screen.getByTestId("gc-bulk-reject"));
    expect(mocks.bulkRejectMut.mutate).toHaveBeenCalledWith({
      proposalIds: [1],
    });
  });

  it("clear button removes selection", () => {
    mocks.listQuery.data = [{ id: 1, proposalKind: "k", status: "pending" }];
    render(<GraphCorrectionPanel />);
    fireEvent.click(screen.getByTestId("gc-list-row-checkbox"));
    expect(screen.getByTestId("gc-bulk-bar")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("gc-bulk-clear"));
    expect(screen.queryByTestId("gc-bulk-bar")).not.toBeInTheDocument();
  });

  it("detail approve forwards proposalId + rationale", () => {
    mocks.listQuery.data = [
      { id: 5, proposalKind: "k", status: "pending" },
    ];
    mocks.detailQuery.data = {
      id: 5,
      proposalKind: "k",
      status: "pending",
    };
    mocks.auditQuery.data = [];
    render(<GraphCorrectionPanel />);
    fireEvent.click(screen.getByTestId("gc-list-row-select"));
    fireEvent.change(screen.getByTestId("gc-detail-rationale"), {
      target: { value: "policy match" },
    });
    fireEvent.click(screen.getByTestId("gc-detail-approve"));
    expect(mocks.approveMut.mutate).toHaveBeenCalledWith({
      proposalId: 5,
      rationale: "policy match",
    });
  });

  it("detail request revision uses the requestRevision mutation", () => {
    mocks.listQuery.data = [{ id: 7, proposalKind: "k", status: "pending" }];
    mocks.detailQuery.data = { id: 7, proposalKind: "k", status: "pending" };
    mocks.auditQuery.data = [];
    render(<GraphCorrectionPanel />);
    fireEvent.click(screen.getByTestId("gc-list-row-select"));
    fireEvent.click(screen.getByTestId("gc-detail-revise"));
    expect(mocks.reviseMut.mutate).toHaveBeenCalledWith({ proposalId: 7 });
  });

  it("detail withdraw confirms first", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.listQuery.data = [{ id: 9, proposalKind: "k", status: "pending" }];
    mocks.detailQuery.data = { id: 9, proposalKind: "k", status: "pending" };
    mocks.auditQuery.data = [];
    render(<GraphCorrectionPanel />);
    fireEvent.click(screen.getByTestId("gc-list-row-select"));
    fireEvent.click(screen.getByTestId("gc-detail-withdraw"));
    expect(mocks.withdrawMut.mutate).toHaveBeenCalledWith({ proposalId: 9 });
    confirmSpy.mockRestore();
  });

  it("detail withdraw cancellation skips the mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mocks.listQuery.data = [{ id: 9, proposalKind: "k", status: "pending" }];
    mocks.detailQuery.data = { id: 9, proposalKind: "k", status: "pending" };
    mocks.auditQuery.data = [];
    render(<GraphCorrectionPanel />);
    fireEvent.click(screen.getByTestId("gc-list-row-select"));
    fireEvent.click(screen.getByTestId("gc-detail-withdraw"));
    expect(mocks.withdrawMut.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("audit list renders rows when data present", () => {
    mocks.listQuery.data = [
      { id: 5, proposalKind: "k", status: "pending" },
    ];
    mocks.detailQuery.data = {
      id: 5,
      proposalKind: "k",
      status: "pending",
    };
    mocks.auditQuery.data = [
      { id: 1, eventKind: "submitted", actedByUserId: 7 },
      { id: 2, eventKind: "approved", actedByUserId: 8 },
    ];
    render(<GraphCorrectionPanel />);
    fireEvent.click(screen.getByTestId("gc-list-row-select"));
    const audit = screen.getAllByTestId("gc-audit-row");
    expect(audit).toHaveLength(2);
    expect(audit[0].textContent).toContain("submitted");
    expect(audit[1].textContent).toContain("approved");
  });

  it("list error message is surfaced", () => {
    mocks.listQuery.error = { message: "boom" };
    render(<GraphCorrectionPanel />);
    expect(screen.getByTestId("gc-list-error").textContent).toContain("boom");
  });

  it("approve onSuccess invalidates list + get + audit", () => {
    mocks.listQuery.data = [
      { id: 5, proposalKind: "k", status: "pending" },
    ];
    mocks.detailQuery.data = {
      id: 5,
      proposalKind: "k",
      status: "pending",
    };
    mocks.auditQuery.data = [];
    render(<GraphCorrectionPanel />);
    fireEvent.click(screen.getByTestId("gc-list-row-select"));
    act(() => {
      mocks.approveMut.lastOpts?.onSuccess?.({});
    });
    expect(mocks.invalidateList).toHaveBeenCalled();
    expect(mocks.invalidateGet).toHaveBeenCalled();
    expect(mocks.invalidateAudit).toHaveBeenCalled();
  });
});
