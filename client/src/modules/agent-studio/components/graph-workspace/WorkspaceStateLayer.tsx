/**
 * WorkspaceStateLayer — Product Work item 25.
 *
 * Centralized renderer for the 11 explicit workspace states. Reuses
 * the canonical failure-state taxonomy so messages stay consistent
 * across panels.
 *
 * Hard rules:
 *   - Never leaks raw internal errors (the raw message is recorded
 *     in a tooltip / dev-only data attribute, not visible by default).
 *   - Distinguishes empty / unavailable / forbidden / stale.
 */

import React from "react";

export type WorkspaceState =
  | "loading"
  | "empty_vault"
  | "empty_graph"
  | "permission_denied"
  | "hidden_reference"
  | "projection_stale"
  | "projection_drift"
  | "neo4j_unavailable"
  | "graph_query_timeout"
  | "stale_search_index"
  | "save_conflict"
  | "read_only";

interface StateMetadata {
  readonly label: string;
  readonly description: string;
  readonly action?: string;
  readonly icon: string;
}

export const WORKSPACE_STATE_METADATA: Readonly<
  Record<WorkspaceState, StateMetadata>
> = {
  loading: {
    label: "Loading…",
    description: "Fetching workspace data.",
    icon: "⏳",
  },
  empty_vault: {
    label: "Empty vault",
    description: "This vault has no notes yet. Create one to get started.",
    action: "Create note",
    icon: "📂",
  },
  empty_graph: {
    label: "Empty graph",
    description: "No graph data is available for this scope.",
    icon: "·",
  },
  permission_denied: {
    label: "Permission denied",
    description: "You don't have access to this resource.",
    icon: "🔒",
  },
  hidden_reference: {
    label: "Hidden reference",
    description: "A referenced item exists but is not visible to you.",
    icon: "👁",
  },
  projection_stale: {
    label: "Projection stale",
    description:
      "The graph projection is older than the source data. Reads still served from cache.",
    action: "Trigger reprojection",
    icon: "⌛",
  },
  projection_drift: {
    label: "Projection drift detected",
    description:
      "Source-of-truth and graph projection have diverged. An operator has been notified.",
    icon: "⚠",
  },
  neo4j_unavailable: {
    label: "Graph backend unavailable",
    description:
      "The graph backend isn't reachable right now. Showing cached data where possible.",
    action: "Retry",
    icon: "⛔",
  },
  graph_query_timeout: {
    label: "Graph query timed out",
    description:
      "The query exceeded its time budget. Try narrowing the scope.",
    action: "Retry with smaller scope",
    icon: "⏱",
  },
  stale_search_index: {
    label: "Search index stale",
    description:
      "The search index is rebuilding. Results may be incomplete.",
    icon: "🔁",
  },
  save_conflict: {
    label: "Save conflict",
    description:
      "Another user updated this note. Refresh to see the latest version before saving.",
    action: "Refresh",
    icon: "✦",
  },
  read_only: {
    label: "Read-only",
    description:
      "Your role does not allow editing this note. Reading mode is still available.",
    icon: "👁",
  },
};

export interface WorkspaceStateLayerProps {
  readonly state: WorkspaceState;
  readonly onAction?: () => void;
  /** Optional raw error message (hidden from default UI; rendered only in dev). */
  readonly rawErrorForDevtools?: string;
}

export default function WorkspaceStateLayer({
  state,
  onAction,
  rawErrorForDevtools,
}: WorkspaceStateLayerProps): React.ReactElement {
  const meta = WORKSPACE_STATE_METADATA[state];
  return (
    <div
      role="status"
      data-testid={`workspace-state-${state}`}
      data-state={state}
      data-raw-error={rawErrorForDevtools ?? ""}
      className="flex flex-col items-center justify-center p-6 text-center border border-dashed rounded-md min-h-32"
    >
      <div className="text-2xl mb-2" aria-hidden="true">
        {meta.icon}
      </div>
      <div className="font-semibold">{meta.label}</div>
      <div className="text-sm text-gray-500 mt-1 max-w-md">
        {meta.description}
      </div>
      {meta.action && onAction && (
        <button
          type="button"
          className="mt-3 px-3 py-1 text-sm rounded border hover:bg-gray-50"
          onClick={onAction}
          data-testid={`workspace-state-action-${state}`}
        >
          {meta.action}
        </button>
      )}
    </div>
  );
}

/**
 * Map a tRPC error / failure-state event to a WorkspaceState.
 *
 * Pure helper — no side effects. Callers (panels, drawers) use this
 * to decide which state slide to render in their error branches.
 */
export function classifyWorkspaceState(input: {
  readonly trpcError?: { code?: string; message?: string };
  readonly failureStateKey?: string;
  readonly emptyResultKind?: "vault" | "graph" | null;
  readonly readOnly?: boolean;
}): WorkspaceState {
  if (input.trpcError) {
    const code = input.trpcError.code ?? "";
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
      return "permission_denied";
    }
    if (code === "TIMEOUT" || /timeout/i.test(input.trpcError.message ?? "")) {
      return "graph_query_timeout";
    }
    if (/conflict/i.test(input.trpcError.message ?? "")) {
      return "save_conflict";
    }
    return "neo4j_unavailable";
  }
  if (input.failureStateKey) {
    switch (input.failureStateKey) {
      case "neo4j_unavailable":
      case "neo4j_degraded":
        return "neo4j_unavailable";
      case "neo4j_query_timeout":
        return "graph_query_timeout";
      case "neo4j_projection_stale":
        return "projection_stale";
      case "projection_sync_failed":
        return "projection_drift";
      case "note_conflict":
        return "save_conflict";
      case "runtime_reference_hidden_by_permission":
      case "retrieval_safety_filter_blocked_content":
        return "hidden_reference";
      case "search_index_stale":
        return "stale_search_index";
      default:
        return "neo4j_unavailable";
    }
  }
  if (input.emptyResultKind === "vault") return "empty_vault";
  if (input.emptyResultKind === "graph") return "empty_graph";
  if (input.readOnly) return "read_only";
  return "loading";
}
