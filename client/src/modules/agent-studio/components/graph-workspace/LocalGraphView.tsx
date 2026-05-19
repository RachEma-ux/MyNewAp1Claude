/**
 * LocalGraphView — Product Work item 18.
 *
 * Renders a depth-bounded local graph around the selected node.
 * Backs onto trpc.agentStudio.graphWorkspace.localGraph (which wraps
 * the GraphRepository's Cypher).
 *
 * Two view modes share the same query + depth selector:
 *   - "list" — text-based NodeList (original, screen-reader friendly).
 *   - "canvas" — react-flow node-link diagram (LocalGraphCanvas).
 *
 * No mock data. Empty result → empty_graph state. Backend down →
 * neo4j_unavailable state.
 */

import React, { useMemo, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import WorkspaceStateLayer, {
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";
import LocalGraphCanvas from "./LocalGraphCanvas";

export interface LocalGraphViewProps {
  readonly seedNodeId: string;
  readonly onSelectNode?: (nodeId: string) => void;
  readonly onSelectEdge?: (edgeKey: { fromId: string; toId: string }) => void;
  /** Initial view mode. Defaults to "canvas" for visual operators. */
  readonly defaultViewMode?: "list" | "canvas";
}

const DEPTH_OPTIONS = [1, 2, 3, 4] as const;
const VIEW_MODES = ["canvas", "list"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

export default function LocalGraphView({
  seedNodeId,
  onSelectNode,
  onSelectEdge,
  defaultViewMode = "canvas",
}: LocalGraphViewProps): React.ReactElement {
  const [depth, setDepth] = useState<number>(2);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);

  // The text view drives its own query so the empty/error states
  // stay co-located. The canvas view fetches independently — both
  // hit the same tRPC query key, so React Query dedupes the request.
  const query = trpc.agentStudio.graphWorkspace.localGraph.useQuery(
    {
      seedNodeId,
      options: { maxDepth: depth, maxResults: 100 },
    },
    { enabled: seedNodeId.length > 0 && viewMode === "list" },
  );

  const listState = useMemo(() => {
    if (!seedNodeId) return "empty_graph" as const;
    if (query.isLoading) return "loading" as const;
    if (query.error) {
      return classifyWorkspaceState({
        trpcError: {
          code: query.error.data?.code,
          message: query.error.message,
        },
      });
    }
    if ((query.data?.nodes ?? []).length === 0) return "empty_graph" as const;
    return null;
  }, [seedNodeId, query.isLoading, query.error, query.data]);

  return (
    <section
      className="border rounded flex flex-col"
      data-testid="local-graph-view"
      data-seed-id={seedNodeId}
      data-depth={depth}
      data-view-mode={viewMode}
    >
      <header className="flex items-center justify-between border-b px-3 py-1.5 text-xs gap-2">
        <span className="font-semibold uppercase text-gray-500">Local graph</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">view:</span>
            {VIEW_MODES.map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`local-graph-view-mode-${m}`}
                data-active={m === viewMode ? "true" : "false"}
                onClick={() => setViewMode(m)}
                className={`px-2 py-0.5 rounded border ${
                  m === viewMode ? "bg-blue-50 border-blue-300" : ""
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">depth:</span>
            {DEPTH_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                data-testid={`local-graph-depth-${d}`}
                data-active={d === depth ? "true" : "false"}
                onClick={() => setDepth(d)}
                className={`px-2 py-0.5 rounded border ${
                  d === depth ? "bg-blue-50 border-blue-300" : ""
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="p-3 min-h-32">
        {viewMode === "canvas" ? (
          <LocalGraphCanvas
            seedNodeId={seedNodeId}
            depth={depth}
            maxResults={100}
            onSelectNode={onSelectNode}
            onSelectEdge={onSelectEdge}
          />
        ) : listState !== null ? (
          <WorkspaceStateLayer
            state={listState}
            rawErrorForDevtools={query.error?.message}
          />
        ) : (
          <NodeList
            nodes={query.data?.nodes ?? []}
            edges={query.data?.edges ?? []}
            truncated={query.data?.truncated ?? false}
            truncationReason={query.data?.truncationReason}
            onSelectNode={onSelectNode}
            onSelectEdge={onSelectEdge}
          />
        )}
      </div>
    </section>
  );
}

interface NodeListProps {
  readonly nodes: ReadonlyArray<{ typeKey: string; id: string }>;
  readonly edges: ReadonlyArray<{ typeKey: string; sourceNode: { id: string }; targetNode: { id: string } }>;
  readonly truncated: boolean;
  readonly truncationReason?: string;
  readonly onSelectNode?: (nodeId: string) => void;
  readonly onSelectEdge?: (key: { fromId: string; toId: string }) => void;
}

function NodeList({
  nodes,
  edges,
  truncated,
  truncationReason,
  onSelectNode,
  onSelectEdge,
}: NodeListProps): React.ReactElement {
  return (
    <div className="space-y-2 text-xs">
      {truncated && (
        <div
          className="rounded bg-amber-50 text-amber-700 px-2 py-1"
          data-testid="local-graph-truncated"
        >
          ✂ Result truncated. {truncationReason ?? ""}
        </div>
      )}
      <div>
        <div className="font-semibold text-gray-500 mb-1">
          Nodes ({nodes.length})
        </div>
        <ul className="grid grid-cols-2 gap-1">
          {nodes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                data-testid={`local-graph-node-${n.id}`}
                className="text-left w-full px-2 py-0.5 rounded border hover:bg-gray-50 font-mono"
                onClick={() => onSelectNode?.(n.id)}
              >
                <span className="text-gray-500">{n.typeKey}:</span> {n.id}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="font-semibold text-gray-500 mb-1">
          Edges ({edges.length})
        </div>
        <ul className="space-y-0.5">
          {edges.map((e, idx) => (
            <li key={`${e.sourceNode.id}->${e.targetNode.id}-${idx}`}>
              <button
                type="button"
                data-testid={`local-graph-edge-${idx}`}
                className="text-left w-full px-2 py-0.5 rounded border hover:bg-gray-50 font-mono"
                onClick={() =>
                  onSelectEdge?.({ fromId: e.sourceNode.id, toId: e.targetNode.id })
                }
              >
                {e.sourceNode.id}
                <span className="text-blue-600 mx-1">— {e.typeKey} →</span>
                {e.targetNode.id}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
