// @vitest-environment jsdom
// VaultTemplatesPanel — branch coverage.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { VaultTemplatesPanel } from "./VaultTemplatesPanel";

interface VaultTemplateRow {
  id: number;
  vaultId: number | null;
  templateKey: string;
  name: string;
  contentMd: string;
}

const mocks = vi.hoisted(() => ({
  listingState: {
    isLoading: false,
    data: undefined as
      | undefined
      | { templates: ReadonlyArray<VaultTemplateRow> },
    refetch: vi.fn(),
  },
  listingLastInput: null as null | { vaultId?: number },
  invalidateMock: vi.fn(),
  createState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: { templateKey: string } | undefined) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      agentStudio: {
        vault: {
          listTemplates: { invalidate: mocks.invalidateMock },
        },
      },
    }),
    agentStudio: {
      vault: {
        listTemplates: {
          useQuery: (input: unknown) => {
            mocks.listingLastInput = input as { vaultId?: number };
            return mocks.listingState;
          },
        },
        createTemplate: {
          useMutation: (opts: {
            onSuccess?: (d: { templateKey: string } | undefined) => void;
            onError?: (e: { message?: string }) => void;
          }) => {
            mocks.createState.lastOpts = opts;
            return mocks.createState;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.listingState.isLoading = false;
  mocks.listingState.data = undefined;
  mocks.listingState.refetch.mockReset();
  mocks.listingLastInput = null;
  mocks.invalidateMock.mockReset();
  mocks.createState.isPending = false;
  mocks.createState.mutate.mockReset();
  mocks.createState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("VaultTemplatesPanel", () => {
  it("renders the section label + Refresh + New template button", () => {
    render(<VaultTemplatesPanel />);
    expect(screen.getByText(/vault templates/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /new template/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /refresh/i }),
    ).toBeInTheDocument();
  });

  it("starts with the create dialog hidden", () => {
    render(<VaultTemplatesPanel />);
    expect(
      screen.queryByTestId("vault-templates-create-submit"),
    ).not.toBeInTheDocument();
  });

  it("toggling 'New template' reveals the create form", () => {
    render(<VaultTemplatesPanel />);
    fireEvent.click(screen.getByTestId("vault-templates-toggle-create"));
    expect(screen.getByTestId("vault-templates-draft-key")).toBeInTheDocument();
    expect(screen.getByTestId("vault-templates-draft-name")).toBeInTheDocument();
    expect(screen.getByTestId("vault-templates-create-submit")).toBeInTheDocument();
  });

  it("create validation: empty key or name produces an error toast", () => {
    render(<VaultTemplatesPanel />);
    fireEvent.click(screen.getByTestId("vault-templates-toggle-create"));
    fireEvent.click(screen.getByTestId("vault-templates-create-submit"));
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Template key + name are required",
    );
    expect(mocks.createState.mutate).not.toHaveBeenCalled();
  });

  it("create submit fires mutate with the input + omits vaultId when blank", () => {
    render(<VaultTemplatesPanel />);
    fireEvent.click(screen.getByTestId("vault-templates-toggle-create"));
    fireEvent.change(screen.getByTestId("vault-templates-draft-key"), {
      target: { value: "weekly" },
    });
    fireEvent.change(screen.getByTestId("vault-templates-draft-name"), {
      target: { value: "Weekly review" },
    });
    fireEvent.change(screen.getByTestId("vault-templates-draft-body"), {
      target: { value: "# {{title}}" },
    });
    fireEvent.click(screen.getByTestId("vault-templates-create-submit"));
    expect(mocks.createState.mutate).toHaveBeenCalledWith({
      templateKey: "weekly",
      name: "Weekly review",
      contentMd: "# {{title}}",
    });
  });

  it("create submit forwards vaultId when set", () => {
    render(<VaultTemplatesPanel />);
    fireEvent.click(screen.getByTestId("vault-templates-toggle-create"));
    fireEvent.change(screen.getByTestId("vault-templates-draft-key"), {
      target: { value: "weekly" },
    });
    fireEvent.change(screen.getByTestId("vault-templates-draft-name"), {
      target: { value: "Weekly review" },
    });
    fireEvent.change(screen.getByTestId("vault-templates-draft-vault"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByTestId("vault-templates-create-submit"));
    expect(mocks.createState.mutate).toHaveBeenCalledWith({
      templateKey: "weekly",
      name: "Weekly review",
      contentMd: "",
      vaultId: 7,
    });
  });

  it("vault id filter forwards as number when set; empty filter forwards {}", () => {
    const { rerender } = render(<VaultTemplatesPanel />);
    // First render — empty filter
    expect(mocks.listingLastInput).toEqual({});
    fireEvent.change(screen.getByTestId("vault-templates-vault-filter"), {
      target: { value: "42" },
    });
    rerender(<VaultTemplatesPanel />);
    expect(mocks.listingLastInput).toEqual({ vaultId: 42 });
  });

  it("renders the empty-state when no templates and not loading", () => {
    render(<VaultTemplatesPanel />);
    expect(screen.getByText(/no templates yet/i)).toBeInTheDocument();
  });

  it("renders each template row with name + key + scope", () => {
    mocks.listingState.data = {
      templates: [
        {
          id: 1,
          vaultId: null,
          templateKey: "weekly",
          name: "Weekly review",
          contentMd: "# {{title}}",
        },
        {
          id: 2,
          vaultId: 7,
          templateKey: "scoped",
          name: "Scoped template",
          contentMd: "scoped",
        },
      ],
    };
    render(<VaultTemplatesPanel />);
    const rows = screen.getAllByTestId("vault-templates-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText(/weekly review/i)).toBeInTheDocument();
    expect(screen.getByText(/scoped template/i)).toBeInTheDocument();
    // Scope chip text — exact match (avoids "global" matching "globally")
    expect(
      screen.getByText("global", { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("vault 7", { exact: true }),
    ).toBeInTheDocument();
  });

  it("create success fires toast.success + clears the draft + invalidates the list", () => {
    render(<VaultTemplatesPanel />);
    fireEvent.click(screen.getByTestId("vault-templates-toggle-create"));
    act(() => {
      mocks.createState.lastOpts?.onSuccess?.({ templateKey: "weekly" });
    });
    expect(mocks.toast.success).toHaveBeenCalledWith(
      expect.stringContaining("weekly"),
    );
    expect(mocks.invalidateMock).toHaveBeenCalled();
  });

  it("create error fires toast.error", () => {
    render(<VaultTemplatesPanel />);
    fireEvent.click(screen.getByTestId("vault-templates-toggle-create"));
    act(() => {
      mocks.createState.lastOpts?.onError?.({ message: "boom" });
    });
    expect(mocks.toast.error).toHaveBeenCalledWith("Create failed: boom");
  });

  it("loading state shows a Loading indicator", () => {
    mocks.listingState.isLoading = true;
    render(<VaultTemplatesPanel />);
    expect(screen.getByText(/loading templates/i)).toBeInTheDocument();
  });
});
