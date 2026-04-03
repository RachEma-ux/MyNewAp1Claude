/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CodeStudioTemplatesPage from "./CodeStudioTemplatesPage";

const mocks = vi.hoisted(() => ({
  templates: [
    {
      id: 1,
      name: "Audit Job",
      description: "Audit prompt against repo code",
      category: "audit",
      templateType: "audit",
      isBuiltIn: true,
      titleTemplate: "Audit Job",
      objectiveTemplate: "Target prompt to audit:\n{{targetPrompt}}",
      defaultPriority: "normal",
      defaultConstraints: {},
      variableSchema: [
        {
          key: "targetPrompt",
          label: "Target prompt to audit",
          type: "long_text",
          required: true,
          placeholder: "Paste the exact original implementation prompt here",
        },
      ],
    },
  ],
  refetch: vi.fn(),
  seedMutate: vi.fn(),
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  importMutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    codeStudio: {
      templates: {
        list: {
          useQuery: () => ({
            data: mocks.templates,
            isLoading: false,
            refetch: mocks.refetch,
          }),
        },
        seed: {
          useMutation: () => ({ mutate: mocks.seedMutate, isPending: false }),
        },
        create: {
          useMutation: () => ({ mutate: mocks.createMutate, isPending: false }),
        },
        update: {
          useMutation: () => ({ mutate: mocks.updateMutate, isPending: false }),
        },
        delete: {
          useMutation: () => ({ mutate: mocks.deleteMutate, isPending: false }),
        },
        importFile: {
          useMutation: () => ({ mutate: mocks.importMutate, isPending: false }),
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe("CodeStudioTemplatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Templates page and shows template details", async () => {
    render(<CodeStudioTemplatesPage />);

    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(screen.getByText("Audit Job")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("View details"));

    expect(
      await screen.findAllByText("Target prompt to audit")
    ).not.toHaveLength(0);
    expect(screen.getByText("Objective Template")).toBeInTheDocument();
  });

  it("builds an import preview from a selected JSON file", async () => {
    const { container } = render(<CodeStudioTemplatesPage />);
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(
      [
        JSON.stringify({
          templates: [
            {
              name: "Imported Template",
              titleTemplate: "Imported Template",
              objectiveTemplate: "Target prompt to audit:\n{{targetPrompt}}",
              variableSchema: [
                {
                  key: "targetPrompt",
                  label: "Target prompt to audit",
                  type: "long_text",
                },
              ],
            },
          ],
        }),
      ],
      "templates.json",
      { type: "application/json" }
    );

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Imported Template")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Import Templates/i }));

    expect(mocks.importMutate).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "templates.json" })
    );
  });
});
