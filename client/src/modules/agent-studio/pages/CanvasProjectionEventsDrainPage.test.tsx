// @vitest-environment jsdom
// CanvasProjectionEventsDrainPage — V1+ 17-γ slice (PR-V1-86)
// page tests.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import CanvasProjectionEventsDrainPage from "./CanvasProjectionEventsDrainPage";

const mocks = vi.hoisted(() => ({
  statusState: {
    isLoading: false,
    error: null as { message: string } | null,
    data: null as
      | null
      | {
          ticksRun: number;
          cursorMapSize: number;
          lastTickResult: null | {
            totalProcessed: number;
            workspacesScanned: number;
            totalFailed: number;
            anyHitMaxBatches: boolean;
          };
          lastTickError: null | { message: string; at: Date };
        },
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      canvasProjectionEventsDrain: {
        getDrainStatus: { useQuery: () => mocks.statusState },
      },
    },
  },
}));

describe("CanvasProjectionEventsDrainPage — page mount", () => {
  it("renders the page header + the drain status panel", () => {
    mocks.statusState.isLoading = false;
    mocks.statusState.error = null;
    mocks.statusState.data = {
      ticksRun: 3,
      cursorMapSize: 2,
      lastTickResult: {
        totalProcessed: 5,
        workspacesScanned: 2,
        totalFailed: 0,
        anyHitMaxBatches: false,
      },
      lastTickError: null,
    };
    render(<CanvasProjectionEventsDrainPage />);
    // PageHeader subtitle (unique to the page; the panel
    // SectionLabel also says "Canvas projection events drain").
    expect(
      screen.getByText(/Operator observability for the 17-γ canvas/i),
    ).toBeTruthy();
    // Populated content from the panel — unique to the panel body.
    expect(screen.getByText(/Ticks run:/)).toBeTruthy();
  });

  it("renders the loading branch from the panel when status is loading", () => {
    mocks.statusState.isLoading = true;
    mocks.statusState.error = null;
    mocks.statusState.data = null;
    render(<CanvasProjectionEventsDrainPage />);
    expect(screen.getByText(/Loading drain status/i)).toBeTruthy();
  });

  it("renders the error branch from the panel when status fails", () => {
    mocks.statusState.isLoading = false;
    mocks.statusState.error = { message: "asdb down" };
    mocks.statusState.data = null;
    render(<CanvasProjectionEventsDrainPage />);
    expect(screen.getByText(/Failed to load drain status/i)).toBeTruthy();
    expect(screen.getByText(/asdb down/)).toBeTruthy();
  });
});
