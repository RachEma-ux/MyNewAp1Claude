// @vitest-environment jsdom
// CanvasProjectionEventsDrainStatusPanel — branch coverage tests
// (17-γ PR-V1-63).

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { CanvasProjectionEventsDrainStatusPanel } from "./CanvasProjectionEventsDrainStatusPanel";

interface DrainStatus {
  readonly ticksRun: number;
  readonly cursorMapSize: number;
  readonly lastTickResult: {
    readonly workspacesScanned: number;
    readonly totalProcessed: number;
    readonly totalFailed: number;
    readonly anyHitMaxBatches: boolean;
    readonly perWorkspace: ReadonlyArray<unknown>;
  } | null;
  readonly lastTickError: { readonly message: string; readonly at: Date } | null;
}

const mocks = vi.hoisted(() => ({
  queryState: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as DrainStatus | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      canvasProjectionEventsDrain: {
        getDrainStatus: {
          useQuery: () => mocks.queryState,
        },
      },
    },
  },
}));

function resetState(state: Partial<typeof mocks.queryState>) {
  mocks.queryState.isLoading = false;
  mocks.queryState.error = null;
  mocks.queryState.data = undefined;
  Object.assign(mocks.queryState, state);
}

describe("CanvasProjectionEventsDrainStatusPanel", () => {
  it("renders loading branch", () => {
    resetState({ isLoading: true });
    render(<CanvasProjectionEventsDrainStatusPanel />);
    expect(screen.getByText(/Loading drain status/i)).toBeTruthy();
  });

  it("renders error branch with message echo", () => {
    resetState({ error: { message: "ASDB boom" } });
    render(<CanvasProjectionEventsDrainStatusPanel />);
    expect(screen.getByText(/Failed to load drain status/i)).toBeTruthy();
    expect(screen.getByText(/ASDB boom/)).toBeTruthy();
  });

  it("renders the not-yet-ticked branch when ticksRun=0", () => {
    resetState({
      data: {
        ticksRun: 0,
        cursorMapSize: 0,
        lastTickResult: null,
        lastTickError: null,
      },
    });
    render(<CanvasProjectionEventsDrainStatusPanel />);
    expect(screen.getByText(/Scheduler not yet ticked/i)).toBeTruthy();
  });

  it("renders the populated branch with ticksRun + workspaces tracked", () => {
    resetState({
      data: {
        ticksRun: 7,
        cursorMapSize: 3,
        lastTickResult: {
          workspacesScanned: 3,
          totalProcessed: 12,
          totalFailed: 0,
          anyHitMaxBatches: false,
          perWorkspace: [],
        },
        lastTickError: null,
      },
    });
    render(<CanvasProjectionEventsDrainStatusPanel />);
    expect(screen.getByText(/Ticks run:/)).toBeTruthy();
    expect(screen.getByText(/7/)).toBeTruthy();
    expect(screen.getByText(/Workspaces tracked:/)).toBeTruthy();
    const lastTick = screen.getByTestId("drain-last-tick-result");
    expect(lastTick.textContent).toMatch(/12 events across 3 workspaces/);
  });

  it("pluralizes 'workspace' correctly when scanned=1", () => {
    resetState({
      data: {
        ticksRun: 1,
        cursorMapSize: 1,
        lastTickResult: {
          workspacesScanned: 1,
          totalProcessed: 5,
          totalFailed: 0,
          anyHitMaxBatches: false,
          perWorkspace: [],
        },
        lastTickError: null,
      },
    });
    render(<CanvasProjectionEventsDrainStatusPanel />);
    const lastTick = screen.getByTestId("drain-last-tick-result");
    expect(lastTick.textContent).toMatch(/5 events across 1 workspace\b/);
  });

  it("renders the failure-count suffix when totalFailed > 0", () => {
    resetState({
      data: {
        ticksRun: 4,
        cursorMapSize: 2,
        lastTickResult: {
          workspacesScanned: 2,
          totalProcessed: 8,
          totalFailed: 1,
          anyHitMaxBatches: false,
          perWorkspace: [],
        },
        lastTickError: null,
      },
    });
    render(<CanvasProjectionEventsDrainStatusPanel />);
    const lastTick = screen.getByTestId("drain-last-tick-result");
    expect(lastTick.textContent).toMatch(/\(1 failed\)/);
  });

  it("renders the lastTickError branch when present", () => {
    resetState({
      data: {
        ticksRun: 2,
        cursorMapSize: 1,
        lastTickResult: null,
        lastTickError: {
          message: "forward boom",
          at: new Date("2026-05-14T15:00:00Z"),
        },
      },
    });
    render(<CanvasProjectionEventsDrainStatusPanel />);
    const errorRow = screen.getByTestId("drain-last-tick-error");
    expect(errorRow.textContent).toMatch(/forward boom/);
  });

  it("renders the hit-max-batches advisory when set", () => {
    resetState({
      data: {
        ticksRun: 3,
        cursorMapSize: 2,
        lastTickResult: {
          workspacesScanned: 2,
          totalProcessed: 200,
          totalFailed: 0,
          anyHitMaxBatches: true,
          perWorkspace: [],
        },
        lastTickError: null,
      },
    });
    render(<CanvasProjectionEventsDrainStatusPanel />);
    const advisory = screen.getByTestId("drain-hit-max-batches");
    expect(advisory.textContent).toMatch(/hit the per-tick batch ceiling/);
  });

  it("renders the null-status fallback", () => {
    resetState({ data: undefined });
    render(<CanvasProjectionEventsDrainStatusPanel />);
    expect(screen.getByText(/No drain status available/i)).toBeTruthy();
  });
});
