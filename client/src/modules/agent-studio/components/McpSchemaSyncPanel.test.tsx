// @vitest-environment jsdom
// McpSchemaSyncPanel — no-deferral continuation-22 slice 99 tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { McpSchemaSyncPanel } from "./McpSchemaSyncPanel";

interface SyncResult {
  workspaceId: number;
  mcpServerId: string;
  toolsAdded: number;
  toolsUpdated: number;
  toolsUnchanged: number;
  toolsMarkedUnavailable: number;
  changedToolNames: string[];
}

const mocks = vi.hoisted(() => ({
  syncState: {
    isPending: false,
    mutate: vi.fn(),
    lastOpts: null as null | {
      onSuccess?: (d: SyncResult) => void;
      onError?: (e: { message?: string }) => void;
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      mcpSchemaSync: {
        sync: {
          useMutation: (opts: {
            onSuccess?: (d: SyncResult) => void;
            onError?: (e: { message?: string }) => void;
          }) => {
            mocks.syncState.lastOpts = opts;
            return mocks.syncState;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.syncState.isPending = false;
  mocks.syncState.mutate.mockReset();
  mocks.syncState.lastOpts = null;
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

function fillRequired() {
  fireEvent.change(screen.getByTestId("mss-workspace-id"), {
    target: { value: "7" },
  });
  fireEvent.change(screen.getByTestId("mss-server-id"), {
    target: { value: "acme-mcp-prod" },
  });
  fireEvent.change(screen.getByTestId("mss-knowledge-source-id"), {
    target: { value: "13" },
  });
  fireEvent.change(screen.getByTestId("mss-actor-id"), {
    target: { value: "1" },
  });
}

describe("McpSchemaSyncPanel", () => {
  it("renders the section label + sync button", () => {
    render(<McpSchemaSyncPanel />);
    expect(
      screen.getByText(/sync mcp server tool snapshot/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mss-sync-button")).toBeInTheDocument();
  });

  it("sync button is disabled until all four ids + tools-JSON validate", () => {
    render(<McpSchemaSyncPanel />);
    const btn = screen.getByTestId("mss-sync-button");
    expect(btn).toBeDisabled();
    fillRequired();
    // default tools is "[]" which is a valid empty array
    expect(btn).not.toBeDisabled();
  });

  it("invalid tools JSON disables the button + shows error", () => {
    render(<McpSchemaSyncPanel />);
    fillRequired();
    fireEvent.change(screen.getByTestId("mss-tools"), {
      target: { value: "{ broken" },
    });
    expect(screen.getByTestId("mss-tools-error")).toBeInTheDocument();
    expect(screen.getByTestId("mss-sync-button")).toBeDisabled();
  });

  it("non-array tools is rejected", () => {
    render(<McpSchemaSyncPanel />);
    fillRequired();
    fireEvent.change(screen.getByTestId("mss-tools"), {
      target: { value: '{"name": "x"}' },
    });
    expect(screen.getByTestId("mss-tools-error")).toBeInTheDocument();
  });

  it("tools with missing name field are rejected", () => {
    render(<McpSchemaSyncPanel />);
    fillRequired();
    fireEvent.change(screen.getByTestId("mss-tools"), {
      target: { value: '[{"description": "no name here"}]' },
    });
    expect(screen.getByTestId("mss-tools-error")).toBeInTheDocument();
  });

  it("tools with too many entries (>1000) are rejected", () => {
    render(<McpSchemaSyncPanel />);
    fillRequired();
    const big = JSON.stringify(
      Array.from({ length: 1001 }, (_, i) => ({ name: `t${i}` })),
    );
    fireEvent.change(screen.getByTestId("mss-tools"), { target: { value: big } });
    expect(screen.getByTestId("mss-tools-error")).toBeInTheDocument();
  });

  it("valid tools array renders parsed count + enables sync", () => {
    render(<McpSchemaSyncPanel />);
    fillRequired();
    fireEvent.change(screen.getByTestId("mss-tools"), {
      target: {
        value:
          '[{"name": "search_docs", "description": "...", "inputSchema": {"type": "object"}}]',
      },
    });
    expect(screen.getByTestId("mss-tools-count").textContent).toContain(
      "1 tool",
    );
    expect(screen.getByTestId("mss-sync-button")).not.toBeDisabled();
  });

  it("submits the parsed payload on Sync click", () => {
    render(<McpSchemaSyncPanel />);
    fillRequired();
    fireEvent.change(screen.getByTestId("mss-tools"), {
      target: {
        value:
          '[{"name": "search_docs", "description": "d", "inputSchema": {"type": "object"}}]',
      },
    });
    fireEvent.click(screen.getByTestId("mss-sync-button"));
    expect(mocks.syncState.mutate).toHaveBeenCalledWith({
      workspaceId: 7,
      mcpServerId: "acme-mcp-prod",
      knowledgeSourceId: 13,
      actorId: 1,
      tools: [
        {
          name: "search_docs",
          description: "d",
          inputSchema: { type: "object" },
        },
      ],
    });
  });

  it("strips optional fields when not provided in tools entries", () => {
    render(<McpSchemaSyncPanel />);
    fillRequired();
    fireEvent.change(screen.getByTestId("mss-tools"), {
      target: { value: '[{"name": "ping"}]' },
    });
    fireEvent.click(screen.getByTestId("mss-sync-button"));
    expect(mocks.syncState.mutate).toHaveBeenCalledWith({
      workspaceId: 7,
      mcpServerId: "acme-mcp-prod",
      knowledgeSourceId: 13,
      actorId: 1,
      tools: [{ name: "ping" }],
    });
  });

  it("onSuccess pushes a row onto the recent-syncs shelf + toasts", () => {
    render(<McpSchemaSyncPanel />);
    fillRequired();
    fireEvent.change(screen.getByTestId("mss-tools"), {
      target: { value: '[{"name": "ping"}]' },
    });
    act(() => {
      mocks.syncState.lastOpts?.onSuccess?.({
        workspaceId: 7,
        mcpServerId: "acme-mcp-prod",
        toolsAdded: 1,
        toolsUpdated: 0,
        toolsUnchanged: 0,
        toolsMarkedUnavailable: 0,
        changedToolNames: ["ping"],
      });
    });
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    const rows = screen.getAllByTestId("mss-recent-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("acme-mcp-prod");
    expect(rows[0].textContent).toContain("+1 added");
    expect(rows[0].textContent).toContain("changed: ping");
  });

  it("onError fires toast.error", () => {
    render(<McpSchemaSyncPanel />);
    act(() => {
      mocks.syncState.lastOpts?.onError?.({ message: "FORBIDDEN" });
    });
    expect(mocks.toast.error).toHaveBeenCalledWith("Sync failed: FORBIDDEN");
  });

  it("recent shelf is capped at 10 entries", () => {
    render(<McpSchemaSyncPanel />);
    fillRequired();
    for (let i = 0; i < 12; i++) {
      act(() => {
        mocks.syncState.lastOpts?.onSuccess?.({
          workspaceId: 7,
          mcpServerId: `srv-${i}`,
          toolsAdded: 0,
          toolsUpdated: 0,
          toolsUnchanged: 0,
          toolsMarkedUnavailable: 0,
          changedToolNames: [],
        });
      });
    }
    const rows = screen.getAllByTestId("mss-recent-row");
    expect(rows).toHaveLength(10);
    expect(rows[0].textContent).toContain("srv-11");
  });

  it("pending state disables the button and shows spinner label", () => {
    mocks.syncState.isPending = true;
    render(<McpSchemaSyncPanel />);
    fillRequired();
    const btn = screen.getByTestId("mss-sync-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toMatch(/syncing/i);
  });
});
