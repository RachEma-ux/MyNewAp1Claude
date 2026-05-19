// @vitest-environment jsdom
// VaultTemplatesPage — no-deferral continuation-7 slice 53 smoke test.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import VaultTemplatesPage from "./VaultTemplatesPage";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      vault: {
        listTemplates: {
          useQuery: () => ({ isLoading: false, error: null, data: [] }),
        },
        createTemplate: {
          useMutation: () => ({
            mutate: vi.fn(),
            mutateAsync: vi.fn(),
            isLoading: false,
          }),
        },
      },
    },
    useUtils: () => ({
      agentStudio: {
        vault: {
          listTemplates: { invalidate: vi.fn() },
        },
      },
    }),
  },
}));

describe("VaultTemplatesPage", () => {
  it("renders the page header + the wrapped panel", () => {
    render(<VaultTemplatesPage />);
    // The panel + the PageHeader both contain "Vault templates" /
    // "Vault Templates" — use getAllByText to assert presence.
    expect(screen.getAllByText(/Vault [Tt]emplates/).length).toBeGreaterThan(0);
    // The PageHeader subtitle is unique to the page.
    expect(
      screen.getByText(/Scope the listing by entering a vault id/i),
    ).toBeTruthy();
  });

  it("subtitle names the operator-facing affordances", () => {
    render(<VaultTemplatesPage />);
    const subtitle = screen.getByText(
      /Scope the listing by entering a vault id/i,
    );
    expect(subtitle.textContent).toMatch(/new-template dialog/i);
  });
});
