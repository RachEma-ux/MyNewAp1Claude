// @vitest-environment jsdom
// BasesAdminPanel — no-deferral continuation-21 slice 96 tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { BasesAdminPanel } from "./BasesAdminPanel";

interface BaseRow {
  id: number;
  name: string;
  slug: string;
  icon?: string | null;
  archivedAt?: Date | null;
}
interface ColumnRow {
  id: number;
  key: string;
  name: string;
  dataType: string;
}
interface RowRow {
  id: number;
  cells: Record<string, unknown>;
  noteId?: number | null;
}
interface Snapshot {
  base: { id: number; name: string; slug: string; description?: string | null };
  columns: ColumnRow[];
  rows: RowRow[];
}

const mocks = vi.hoisted(() => ({
  listQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as BaseRow[] | undefined,
  },
  snapshotQuery: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as Snapshot | undefined,
  },
  createBase: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  updateBase: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  createCol: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  createRow: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  updateRow: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  deleteRow: { isPending: false, mutate: vi.fn(), lastOpts: null as any },
  invalidateList: vi.fn(),
  invalidateSnapshot: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      agentStudio: {
        bases: {
          list: { invalidate: mocks.invalidateList },
          getSnapshot: { invalidate: mocks.invalidateSnapshot },
        },
      },
    }),
    agentStudio: {
      bases: {
        list: { useQuery: () => mocks.listQuery },
        getSnapshot: { useQuery: () => mocks.snapshotQuery },
        create: {
          useMutation: (opts: any) => {
            mocks.createBase.lastOpts = opts;
            return mocks.createBase;
          },
        },
        update: {
          useMutation: (opts: any) => {
            mocks.updateBase.lastOpts = opts;
            return mocks.updateBase;
          },
        },
        createColumn: {
          useMutation: (opts: any) => {
            mocks.createCol.lastOpts = opts;
            return mocks.createCol;
          },
        },
        createRow: {
          useMutation: (opts: any) => {
            mocks.createRow.lastOpts = opts;
            return mocks.createRow;
          },
        },
        updateRow: {
          useMutation: (opts: any) => {
            mocks.updateRow.lastOpts = opts;
            return mocks.updateRow;
          },
        },
        deleteRow: {
          useMutation: (opts: any) => {
            mocks.deleteRow.lastOpts = opts;
            return mocks.deleteRow;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  for (const m of [
    mocks.createBase,
    mocks.updateBase,
    mocks.createCol,
    mocks.createRow,
    mocks.updateRow,
    mocks.deleteRow,
  ]) {
    m.isPending = false;
    m.mutate.mockReset();
    m.lastOpts = null;
  }
  mocks.listQuery.isLoading = false;
  mocks.listQuery.error = null;
  mocks.listQuery.data = undefined;
  mocks.snapshotQuery.isLoading = false;
  mocks.snapshotQuery.error = null;
  mocks.snapshotQuery.data = undefined;
  mocks.invalidateList.mockReset();
  mocks.invalidateSnapshot.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("BasesAdminPanel", () => {
  it("renders Scope + Bases list sections + detail empty state by default", () => {
    render(<BasesAdminPanel />);
    expect(screen.getByText(/^scope$/i)).toBeInTheDocument();
    expect(screen.getByText(/bases list/i)).toBeInTheDocument();
    expect(screen.getByTestId("ba-detail-empty")).toBeInTheDocument();
  });

  it("empty bases list renders an empty-state hint", () => {
    mocks.listQuery.data = [];
    render(<BasesAdminPanel />);
    expect(screen.getByTestId("ba-list-empty")).toBeInTheDocument();
  });

  it("renders rows when listQuery has data + clicking a row shows detail (snapshot empty)", () => {
    mocks.listQuery.data = [
      { id: 5, name: "Research", slug: "research", icon: "📚" },
    ];
    mocks.snapshotQuery.data = {
      base: { id: 5, name: "Research", slug: "research" },
      columns: [],
      rows: [],
    };
    render(<BasesAdminPanel />);
    const rows = screen.getAllByTestId("ba-list-row");
    expect(rows).toHaveLength(1);
    fireEvent.click(screen.getByTestId("ba-list-row-select"));
    expect(screen.getByTestId("ba-detail")).toBeInTheDocument();
    expect(screen.getByTestId("ba-col-empty")).toBeInTheDocument();
    expect(screen.getByTestId("ba-row-empty")).toBeInTheDocument();
  });

  it("create-base form is disabled until name + slug are valid", () => {
    render(<BasesAdminPanel />);
    const btn = screen.getByTestId("ba-create-button");
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByTestId("ba-create-name"), {
      target: { value: "My Base" },
    });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByTestId("ba-create-slug"), {
      target: { value: "my-base" },
    });
    expect(btn).not.toBeDisabled();
  });

  it("invalid slug shows error and keeps the button disabled", () => {
    render(<BasesAdminPanel />);
    fireEvent.change(screen.getByTestId("ba-create-name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByTestId("ba-create-slug"), {
      target: { value: "-bad" },
    });
    expect(screen.getByTestId("ba-create-slug-error")).toBeInTheDocument();
    expect(screen.getByTestId("ba-create-button")).toBeDisabled();
  });

  it("create-base mutate is called with scope + form values", () => {
    render(<BasesAdminPanel />);
    fireEvent.change(screen.getByTestId("ba-workspace-id"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByTestId("ba-create-name"), {
      target: { value: "My Base" },
    });
    fireEvent.change(screen.getByTestId("ba-create-slug"), {
      target: { value: "my-base" },
    });
    fireEvent.change(screen.getByTestId("ba-create-desc"), {
      target: { value: "desc" },
    });
    fireEvent.click(screen.getByTestId("ba-create-button"));
    expect(mocks.createBase.mutate).toHaveBeenCalledWith({
      workspaceId: 7,
      name: "My Base",
      slug: "my-base",
      description: "desc",
    });
  });

  it("archive button toggles via update mutation", () => {
    mocks.listQuery.data = [
      { id: 5, name: "Research", slug: "research" },
    ];
    render(<BasesAdminPanel />);
    fireEvent.click(screen.getByTestId("ba-list-row-archive"));
    expect(mocks.updateBase.mutate).toHaveBeenCalledWith({
      baseId: 5,
      archived: true,
    });
  });

  it("create-column form passes a closed-enum dataType", () => {
    mocks.listQuery.data = [
      { id: 5, name: "Research", slug: "research" },
    ];
    mocks.snapshotQuery.data = {
      base: { id: 5, name: "Research", slug: "research" },
      columns: [],
      rows: [],
    };
    render(<BasesAdminPanel />);
    fireEvent.click(screen.getByTestId("ba-list-row-select"));
    fireEvent.change(screen.getByTestId("ba-col-key"), {
      target: { value: "status" },
    });
    fireEvent.change(screen.getByTestId("ba-col-name"), {
      target: { value: "Status" },
    });
    fireEvent.change(screen.getByTestId("ba-col-type"), {
      target: { value: "select" },
    });
    fireEvent.click(screen.getByTestId("ba-col-create-button"));
    expect(mocks.createCol.mutate).toHaveBeenCalledWith({
      baseId: 5,
      key: "status",
      name: "Status",
      dataType: "select",
    });
  });

  it("invalid column key shows error + disables button", () => {
    mocks.listQuery.data = [
      { id: 5, name: "Research", slug: "research" },
    ];
    mocks.snapshotQuery.data = {
      base: { id: 5, name: "Research", slug: "research" },
      columns: [],
      rows: [],
    };
    render(<BasesAdminPanel />);
    fireEvent.click(screen.getByTestId("ba-list-row-select"));
    fireEvent.change(screen.getByTestId("ba-col-key"), {
      target: { value: "1invalid" },
    });
    expect(screen.getByTestId("ba-col-key-error")).toBeInTheDocument();
    expect(screen.getByTestId("ba-col-create-button")).toBeDisabled();
  });

  it("create-row passes cells as a JSON object", () => {
    mocks.listQuery.data = [
      { id: 5, name: "Research", slug: "research" },
    ];
    mocks.snapshotQuery.data = {
      base: { id: 5, name: "Research", slug: "research" },
      columns: [{ id: 1, key: "status", name: "Status", dataType: "text" }],
      rows: [],
    };
    render(<BasesAdminPanel />);
    fireEvent.click(screen.getByTestId("ba-list-row-select"));
    fireEvent.change(screen.getByTestId("ba-row-create-cells"), {
      target: { value: '{"status": "open"}' },
    });
    fireEvent.click(screen.getByTestId("ba-row-create-button"));
    expect(mocks.createRow.mutate).toHaveBeenCalledWith({
      baseId: 5,
      cells: { status: "open" },
    });
  });

  it("invalid row cells JSON disables create-row button + shows error", () => {
    mocks.listQuery.data = [
      { id: 5, name: "Research", slug: "research" },
    ];
    mocks.snapshotQuery.data = {
      base: { id: 5, name: "Research", slug: "research" },
      columns: [],
      rows: [],
    };
    render(<BasesAdminPanel />);
    fireEvent.click(screen.getByTestId("ba-list-row-select"));
    fireEvent.change(screen.getByTestId("ba-row-create-cells"), {
      target: { value: "[1,2,3]" },
    });
    expect(screen.getByTestId("ba-row-create-error")).toBeInTheDocument();
    expect(screen.getByTestId("ba-row-create-button")).toBeDisabled();
  });

  it("edit row opens an editor and saving calls updateRow", () => {
    mocks.listQuery.data = [
      { id: 5, name: "Research", slug: "research" },
    ];
    mocks.snapshotQuery.data = {
      base: { id: 5, name: "Research", slug: "research" },
      columns: [{ id: 1, key: "status", name: "Status", dataType: "text" }],
      rows: [{ id: 9, cells: { status: "open" } }],
    };
    render(<BasesAdminPanel />);
    fireEvent.click(screen.getByTestId("ba-list-row-select"));
    fireEvent.click(screen.getByTestId("ba-row-edit"));
    const textarea = screen.getByTestId("ba-row-edit-cells");
    fireEvent.change(textarea, {
      target: { value: '{"status": "done"}' },
    });
    fireEvent.click(screen.getByTestId("ba-row-edit-save"));
    expect(mocks.updateRow.mutate).toHaveBeenCalledWith({
      rowId: 9,
      cells: { status: "done" },
    });
  });

  it("delete row confirms and calls deleteRow", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.listQuery.data = [
      { id: 5, name: "Research", slug: "research" },
    ];
    mocks.snapshotQuery.data = {
      base: { id: 5, name: "Research", slug: "research" },
      columns: [],
      rows: [{ id: 9, cells: {} }],
    };
    render(<BasesAdminPanel />);
    fireEvent.click(screen.getByTestId("ba-list-row-select"));
    fireEvent.click(screen.getByTestId("ba-row-delete"));
    expect(mocks.deleteRow.mutate).toHaveBeenCalledWith({ rowId: 9 });
    confirmSpy.mockRestore();
  });

  it("delete row cancellation skips the mutation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mocks.listQuery.data = [
      { id: 5, name: "Research", slug: "research" },
    ];
    mocks.snapshotQuery.data = {
      base: { id: 5, name: "Research", slug: "research" },
      columns: [],
      rows: [{ id: 9, cells: {} }],
    };
    render(<BasesAdminPanel />);
    fireEvent.click(screen.getByTestId("ba-list-row-select"));
    fireEvent.click(screen.getByTestId("ba-row-delete"));
    expect(mocks.deleteRow.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("create-base onSuccess invalidates the list + toasts", () => {
    render(<BasesAdminPanel />);
    act(() => {
      mocks.createBase.lastOpts?.onSuccess?.({ id: 7 });
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.invalidateList).toHaveBeenCalled();
  });

  it("list error message is surfaced", () => {
    mocks.listQuery.error = { message: "boom" };
    render(<BasesAdminPanel />);
    expect(screen.getByTestId("ba-list-error").textContent).toContain("boom");
  });
});
